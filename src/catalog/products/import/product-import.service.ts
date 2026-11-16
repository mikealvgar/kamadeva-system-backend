import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { serializableTransaction } from '../../../prisma/serializable-transaction.js';
import {
  analyzeSheet,
  ImportFormatError,
  nameKey,
  parseCategoryMap,
  type ImportError,
  type ImportSkip,
  type ParsedProduct,
} from './product-import.analyzer.js';
import type { ImportReportDto } from './import-products.dto.js';
import { readFirstSheet, WorkbookError } from './xlsx-reader.js';

function categoryKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

const MAX_ROWS = 5000;

export interface ImportOptions {
  dryRun: boolean;
  categoryMap?: string;
  actorId: string;
}

@Injectable()
export class ProductImportService {
  constructor(private readonly prisma: PrismaService) {}

  async import(
    buffer: Buffer,
    options: ImportOptions,
  ): Promise<ImportReportDto> {
    let analysis: ReturnType<typeof analyzeSheet>;
    try {
      const categoryMap = parseCategoryMap(options.categoryMap);
      analysis = analyzeSheet(
        await readFirstSheet(buffer, MAX_ROWS),
        categoryMap,
      );
    } catch (error) {
      if (error instanceof ImportFormatError || error instanceof WorkbookError)
        throw new BadRequestException(error.message);
      throw error;
    }
    try {
      return await serializableTransaction(this.prisma, (tx) =>
        this.apply(tx, analysis, options),
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'Otro proceso registró productos o categorías con los mismos datos; vuelva a intentar',
        );
      throw error;
    }
  }

  private async apply(
    tx: Prisma.TransactionClient,
    analysis: ReturnType<typeof analyzeSheet>,
    options: ImportOptions,
  ): Promise<ImportReportDto> {
    const skipped: ImportSkip[] = [...analysis.skipped];
    const errors: ImportError[] = [...analysis.errors];

    const existing = await tx.product.findMany({
      where: { codigoBarras: { in: analysis.candidates.map((c) => c.barcode) } },
      select: { codigoBarras: true, nombre: true },
    });
    const existingByBarcode = new Map(
      existing.map((product) => [product.codigoBarras, product.nombre]),
    );
    const toCreate: ParsedProduct[] = [];
    for (const candidate of analysis.candidates) {
      const issue = {
        row: candidate.row,
        codigoBarras: candidate.barcode,
        articulo: candidate.name,
      };
      const existingName = existingByBarcode.get(candidate.barcode);
      if (existingName === undefined) toCreate.push(candidate);
      else if (nameKey(existingName) === nameKey(candidate.name))
        skipped.push({ ...issue, reason: 'Ya existe en el catálogo' });
      else
        errors.push({
          ...issue,
          message: `El código ya pertenece a otro producto: ${existingName}`,
        });
    }

    const namesByKey = new Map<string, string>();
    const valid: ParsedProduct[] = [];
    for (const product of toCreate) {
      if (product.category === null) {
        valid.push(product);
        continue;
      }
      const desc = product.category.trim().toUpperCase();
      if (!desc) {
        errors.push({
          row: product.row,
          codigoBarras: product.barcode,
          articulo: product.name,
          message: `Categoría inválida: ${product.category}`,
        });
        continue;
      }
      const key = categoryKey(product.category);
      if (!namesByKey.has(key)) namesByKey.set(key, desc);
      valid.push(product);
    }
    const allCategories = await tx.category.findMany({
      select: { id: true, descripcion: true },
    });
    const categoryIdsByKey = new Map(
      allCategories.map(({ descripcion, id }) => [categoryKey(descripcion), id]),
    );
    const missingKeys = [...namesByKey.keys()].filter(
      (key) => !categoryIdsByKey.has(key),
    );
    for (const key of missingKeys) categoryIdsByKey.set(key, randomUUID());

    const report = (created: number): ImportReportDto => ({
      dryRun: options.dryRun,
      totalRows: analysis.totalRows,
      created,
      skipped: skipped.sort((a, b) => a.row - b.row),
      errors: errors.sort((a, b) => a.row - b.row),
      categoriesCreated: missingKeys.map((key) => namesByKey.get(key)!).sort(),
      withoutCategory: valid.filter((p) => p.category === null).length,
    });
    if (options.dryRun) return report(valid.length);

    if (missingKeys.length > 0)
      await tx.category.createMany({
        data: missingKeys.map((key) => ({
          id: categoryIdsByKey.get(key)!,
          descripcion: namesByKey.get(key)!,
        })),
      });

    const rows = valid.map((product) => ({
      product,
      id: randomUUID(),
    }));
    await tx.product.createMany({
      data: rows.map(({ product, id }) => ({
        id,
        codigoBarras: product.barcode,
        nombre: product.name,
        descripcion: product.description,
        precioVenta: product.price,
        precioCompra: product.cost,
        categoriaId:
          product.category === null
            ? null
            : categoryIdsByKey.get(categoryKey(product.category))!,
      })),
    });
    const stocked = rows.filter(({ product }) => product.stock.greaterThan(0));
    if (stocked.length > 0)
      await tx.inventoryMovement.createMany({
        data: stocked.map(({ product, id }) => ({
          productoId: id,
          tipo: 'ADJUSTMENT_IN' as const,
          cambioExistencias: product.stock,
          tipoReferencia: 'IMPORT',
          creadoPorId: options.actorId,
          notas: 'Inventario inicial (importación)',
        })),
      });
    return report(valid.length);
  }
}
