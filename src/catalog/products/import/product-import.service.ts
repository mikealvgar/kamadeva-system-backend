import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { serializableTransaction } from '../../../prisma/serializable-transaction.js';
import { slugify } from '../../slugify.js';
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

const MAX_ROWS = 5000;

export interface ImportOptions {
  dryRun: boolean;
  categoryMap?: string;
  actorId: string;
}

@Injectable()
export class ProductImportService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create the products of the sheet that do not exist yet. Rows with errors
   * are reported and skipped; the valid rest is written in one transaction,
   * so re-importing the same file only creates what is still missing.
   */
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
      where: { barcode: { in: analysis.candidates.map((c) => c.barcode) } },
      select: { barcode: true, name: true },
    });
    const existingByBarcode = new Map(
      existing.map((product) => [product.barcode, product.name]),
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

    // Categories are matched by slug, which ignores case and accents.
    const namesBySlug = new Map<string, string>();
    const valid: ParsedProduct[] = [];
    for (const product of toCreate) {
      if (product.category === null) {
        valid.push(product);
        continue;
      }
      const slug = slugify(product.category);
      if (!slug) {
        errors.push({
          row: product.row,
          codigoBarras: product.barcode,
          articulo: product.name,
          message: `Categoría inválida: ${product.category}`,
        });
        continue;
      }
      if (!namesBySlug.has(slug)) namesBySlug.set(slug, product.category);
      valid.push(product);
    }
    const found = await tx.category.findMany({
      where: { slug: { in: [...namesBySlug.keys()] } },
      select: { id: true, slug: true },
    });
    const categoryIds = new Map(found.map(({ slug, id }) => [slug, id]));
    const missing = [...namesBySlug].filter(([slug]) => !categoryIds.has(slug));
    for (const [slug] of missing) categoryIds.set(slug, randomUUID());

    const report = (created: number): ImportReportDto => ({
      dryRun: options.dryRun,
      totalRows: analysis.totalRows,
      created,
      skipped: skipped.sort((a, b) => a.row - b.row),
      errors: errors.sort((a, b) => a.row - b.row),
      categoriesCreated: missing.map(([, name]) => name).sort(),
      withoutCategory: valid.filter((p) => p.category === null).length,
    });
    if (options.dryRun) return report(valid.length);

    if (missing.length > 0)
      await tx.category.createMany({
        data: missing.map(([slug, name]) => ({
          id: categoryIds.get(slug)!,
          name,
          slug,
        })),
      });
    const rows = valid.map((product) => ({
      product,
      id: randomUUID(),
    }));
    await tx.product.createMany({
      data: rows.map(({ product, id }) => ({
        id,
        barcode: product.barcode,
        name: product.name,
        description: product.description,
        brand: product.brand,
        price: product.price,
        cost: product.cost,
        categoryId:
          product.category === null
            ? null
            : categoryIds.get(slugify(product.category))!,
      })),
    });
    const stocked = rows.filter(({ product }) => product.stock.greaterThan(0));
    if (stocked.length > 0)
      await tx.inventoryMovement.createMany({
        data: stocked.map(({ product, id }) => ({
          productId: id,
          type: 'ADJUSTMENT_IN' as const,
          quantityChange: product.stock,
          referenceType: 'IMPORT',
          createdById: options.actorId,
          notes: 'Inventario inicial (importación)',
        })),
      });
    return report(valid.length);
  }
}
