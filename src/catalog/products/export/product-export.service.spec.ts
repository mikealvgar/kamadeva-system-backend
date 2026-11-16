import ExcelJS from 'exceljs';
import type { ProductDto } from '../dto/product.dto.js';
import type { ProductsService } from '../products.service.js';
import { ProductExportService } from './product-export.service.js';

function makeProduct(overrides: Partial<ProductDto> = {}): ProductDto {
  return {
    id: '00000000-0000-4000-a000-000000000001',
    nombre: 'Vibrador Clásico',
    descripcion: 'Silicona médica',
    codigoBarras: '0075012345678',
    marca: { id: 'm1', descripcion: 'Lelo' },
    marcaId: 'm1',
    tallas: [],
    precioCompra: '450.50',
    precioVenta: '899.00',
    stock: '12.500',
    existenciaMinima: '3.000',
    imageUrl: null,
    activo: true,
    categoria: { id: 'c1', nombre: 'BIENESTAR' },
    categoriaId: 'c1',
    fechaCreacion: '2026-11-01T00:00:00.000Z',
    fechaActualizacion: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('ProductExportService', () => {
  it('generates an xlsx workbook with headers, numeric stock/prices and text barcode', async () => {
    const findForExport = vi.fn().mockResolvedValue([
      makeProduct(),
      makeProduct({
        id: '00000000-0000-4000-a000-000000000002',
        nombre: 'Aceite Neutro',
        descripcion: null,
        codigoBarras: '123456789012345',
        marca: null,
        marcaId: null,
        precioCompra: null,
        precioVenta: '199.90',
        stock: '0.000',
        existenciaMinima: null,
        activo: false,
        categoria: null,
        categoriaId: null,
      }),
    ]);
    const service = new ProductExportService({
      findForExport,
    } as unknown as ProductsService);

    const result = await service.exportToExcel({ search: 'test' });

    expect(findForExport).toHaveBeenCalledWith({ search: 'test' });
    expect(result.filename).toMatch(/^catalogo-productos-\d{4}-\d{2}-\d{2}\.xlsx$/);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet('Productos');
    expect(sheet).toBeDefined();

    const headers = sheet!.getRow(1).values as unknown[];
    expect(headers.slice(1)).toEqual([
      'Artículo',
      'Descripción',
      'Código de barras',
      'Stock',
      'Existencia mínima',
      'Categoría',
      'Marca',
      'Precio compra',
      'Precio venta',
      'Estado',
    ]);

    const row2 = sheet!.getRow(2);
    expect(row2.getCell(1).value).toBe('Vibrador Clásico');
    expect(row2.getCell(2).value).toBe('Silicona médica');
    expect(row2.getCell(3).value).toBe('0075012345678');
    expect(row2.getCell(3).numFmt).toBe('@');
    expect(row2.getCell(4).value).toBe(12.5);
    expect(row2.getCell(5).value).toBe(3);
    expect(row2.getCell(6).value).toBe('BIENESTAR');
    expect(row2.getCell(7).value).toBe('Lelo');
    expect(row2.getCell(8).value).toBe(450.5);
    expect(row2.getCell(9).value).toBe(899);
    expect(row2.getCell(10).value).toBe('ACTIVO');

    const row3 = sheet!.getRow(3);
    expect(row3.getCell(1).value).toBe('Aceite Neutro');
    expect(row3.getCell(2).value).toBeNull();
    expect(row3.getCell(3).value).toBe('123456789012345');
    expect(row3.getCell(4).value).toBe(0);
    expect(row3.getCell(5).value).toBeNull();
    expect(row3.getCell(6).value).toBeNull();
    expect(row3.getCell(7).value).toBeNull();
    expect(row3.getCell(8).value).toBeNull();
    expect(row3.getCell(9).value).toBe(199.9);
    expect(row3.getCell(10).value).toBe('INACTIVO');
  });

  it('generates a valid workbook with only headers when no products match', async () => {
    const service = new ProductExportService({
      findForExport: vi.fn().mockResolvedValue([]),
    } as unknown as ProductsService);

    const { buffer } = await service.exportToExcel();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet('Productos');

    expect(sheet).toBeDefined();
    expect(sheet!.rowCount).toBe(1);
  });
});
