import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { ExportProductsDto } from '../dto/export-products.dto.js';
import type { ProductDto } from '../dto/product.dto.js';
import { ProductsService } from '../products.service.js';

export interface ProductExportResult {
  buffer: Buffer;
  filename: string;
}

/** Genera libros Excel (.xlsx) con el catálogo de productos y existencias vigentes. */
@Injectable()
export class ProductExportService {
  constructor(private readonly products: ProductsService) {}

  async exportToExcel(
    query: ExportProductsDto = {},
  ): Promise<ProductExportResult> {
    const items = await this.products.findForExport(query);
    const buffer = await this.buildWorkbook(items);
    const dateStamp = new Date().toISOString().slice(0, 10);

    return {
      buffer,
      filename: `catalogo-productos-${dateStamp}.xlsx`,
    };
  }

  private async buildWorkbook(items: ProductDto[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Kamadeva System';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Productos');
    sheet.columns = [
      { header: 'Artículo', key: 'articulo', width: 32 },
      { header: 'Descripción', key: 'descripcion', width: 40 },
      {
        header: 'Código de barras',
        key: 'codigoBarras',
        width: 22,
        style: { numFmt: '@' },
      },
      {
        header: 'Stock',
        key: 'stock',
        width: 14,
        style: { numFmt: '0.###' },
      },
      {
        header: 'Existencia mínima',
        key: 'existenciaMinima',
        width: 18,
        style: { numFmt: '0.###' },
      },
      { header: 'Categoría', key: 'categoria', width: 24 },
      { header: 'Marca', key: 'marca', width: 22 },
      {
        header: 'Precio compra',
        key: 'precioCompra',
        width: 16,
        style: { numFmt: '0.00' },
      },
      {
        header: 'Precio venta',
        key: 'precioVenta',
        width: 16,
        style: { numFmt: '0.00' },
      },
      { header: 'Estado', key: 'estado', width: 12 },
    ];

    sheet.getRow(1).font = { bold: true };

    for (const product of items) {
      const row = sheet.addRow({
        articulo: product.nombre,
        descripcion: product.descripcion ?? null,
        codigoBarras: String(product.codigoBarras),
        stock: Number(product.stock),
        existenciaMinima:
          product.existenciaMinima !== null
            ? Number(product.existenciaMinima)
            : null,
        categoria: product.categoria?.nombre ?? null,
        marca: product.marca?.descripcion ?? null,
        precioCompra:
          product.precioCompra !== null ? Number(product.precioCompra) : null,
        precioVenta: Number(product.precioVenta),
        estado: product.activo ? 'ACTIVO' : 'INACTIVO',
      });

      // Fuerza formato textual en código de barras para preservar ceros iniciales y >11 dígitos.
      const barcodeCell = row.getCell('codigoBarras');
      barcodeCell.value = String(product.codigoBarras);
      barcodeCell.numFmt = '@';
    }

    const rawBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(rawBuffer);
  }
}
