import ExcelJS from 'exceljs';
import {
  analyzeSheet,
  categoryKey,
  ImportFormatError,
  normalizeBarcode,
  normalizeHeader,
  parseCategoryMap,
} from './product-import.analyzer.js';
import { readFirstSheet, WorkbookError } from './xlsx-reader.js';
import type { RawCell } from './xlsx-reader.js';

const HEADERS = [
  'articulo*',
  'Descripción',
  'Código de barras*',
  'Stock*',
  'Categoría*',
  'Marca',
  'Precio Compra',
  'Precio Venta*',
];
const sheet = (...rows: RawCell[][]) => ({
  headers: HEADERS,
  rows: rows.map((cells, index) => ({ row: index + 2, cells })),
});
const row = (overrides: Partial<Record<number, RawCell>> = {}): RawCell[] => {
  const base: RawCell[] = [
    'Anillo',
    null,
    'C1',
    1,
    'Lenceria',
    null,
    null,
    100,
  ];
  for (const [index, value] of Object.entries(overrides))
    base[Number(index)] = value ?? null;
  return base;
};

describe('import normalization', () => {
  it.each([
    [75034450, '75034450'],
    [6970379687697, '6970379687697'],
    ['´0704030101088', '0704030101088'],
    [' ´ 0704030101088 ', '0704030101088'],
    ["'0123", '0123'],
    ['  lu   0018 ', 'LU 0018'],
    ['Jofer', 'JOFER'],
    ['   ', null],
    [null, null],
  ])('normalizes barcode %o → %o', (input, expected) => {
    expect(normalizeBarcode(input)).toBe(expected);
  });

  it('rejects non-integer numeric barcodes', () => {
    expect(() => normalizeBarcode(1.5)).toThrow();
  });

  it('normalizes headers and category keys without case, accents or asterisks', () => {
    expect(normalizeHeader(' Código  de barras* ')).toBe('codigo de barras');
    expect(categoryKey(' LEncería ')).toBe('LENCERIA');
  });

  it('parses a category map with normalized keys and upper-case targets', () => {
    const map = parseCategoryMap('{"festish":"Fetish","Dildo":null}');
    expect([...map]).toEqual([
      ['FESTISH', 'FETISH'],
      ['DILDO', null],
    ]);
    expect(parseCategoryMap(undefined).size).toBe(0);
    for (const bad of ['{', '[]', '"x"', '{"A":1}', '{"A":" "}', '{" ":"B"}'])
      expect(() => parseCategoryMap(bad)).toThrow(ImportFormatError);
  });
});

describe('analyzeSheet', () => {
  it('requires the mandatory columns', () => {
    expect(() =>
      analyzeSheet({ headers: ['articulo', 'stock'], rows: [] }, new Map()),
    ).toThrow(
      'Faltan columnas obligatorias: codigo de barras, categoria, precio venta',
    );
  });

  it('parses a valid row with upper-case category and exact decimals', () => {
    const result = analyzeSheet(
      sheet(
        row({
          0: '  Anillo   de plata ',
          1: ' Fino ',
          2: 75034450,
          3: 2.5,
          4: ' lencería ',
          5: ' Marca ',
          6: 10.25,
          7: '99.90',
        }),
      ),
      new Map(),
    );
    expect(result.errors).toEqual([]);
    expect(result.candidates).toHaveLength(1);
    const product = result.candidates[0]!;
    expect(product).toMatchObject({
      row: 2,
      barcode: '75034450',
      name: 'Anillo de plata',
      description: 'Fino',
      brand: 'Marca',
      category: 'LENCERÍA',
    });
    expect(product.stock.toFixed(3)).toBe('2.500');
    expect(product.cost!.toFixed(2)).toBe('10.25');
    expect(product.price.toFixed(2)).toBe('99.90');
  });

  it('applies the category map, including null for no category', () => {
    const map = parseCategoryMap('{"FESTISH":"FETISH","DILDO":null}');
    const result = analyzeSheet(
      sheet(
        row({ 2: 'A', 4: 'festish' }),
        row({ 2: 'B', 4: 'Dildo' }),
        row({ 2: 'C', 4: 'Vibrador' }),
      ),
      map,
    );
    expect(result.candidates.map(({ category }) => category)).toEqual([
      'FETISH',
      null,
      'VIBRADOR',
    ]);
  });

  it('keeps the first of identical rows and rejects codes shared by different products', () => {
    const result = analyzeSheet(
      sheet(
        row({ 0: 'Anal Relax', 2: 7503016608183 }),
        row({ 0: 'Disfraz Conejo', 2: 'Jofer' }),
        row({ 0: 'anal  relax', 2: 7503016608183, 3: 8 }),
        row({ 0: 'Disfraz Mesera', 2: 'JOFER' }),
        row({ 0: 'Antifaz', 2: 'Anti1' }),
        row({ 0: 'Antifaz', 2: 'Anti2' }),
      ),
      new Map(),
    );
    expect(result.totalRows).toBe(6);
    expect(result.candidates.map(({ row: r }) => r)).toEqual([2, 6, 7]);
    expect(result.skipped).toEqual([
      {
        row: 4,
        codigoBarras: '7503016608183',
        articulo: 'anal relax',
        reason: 'Duplicado en el archivo (renglón 2)',
      },
    ]);
    expect(result.errors.map(({ row: r, message }) => [r, message])).toEqual([
      [3, 'Código compartido por productos distintos (renglones 3, 5)'],
      [5, 'Código compartido por productos distintos (renglones 3, 5)'],
    ]);
  });

  it.each([
    [{ 0: null }, 'Falta el artículo'],
    [{ 0: 'x'.repeat(201) }, 'El artículo supera 200 caracteres'],
    [{ 2: null }, 'Falta el código de barras'],
    [{ 2: 1.5 }, 'Código de barras numérico inválido'],
    [{ 1: 'x'.repeat(501) }, 'La descripción supera 500 caracteres'],
    [{ 3: null }, 'Falta el stock'],
    [{ 3: -1 }, 'Stock inválido: número ≥ 0 con hasta 3 decimales'],
    [{ 3: 1.0001 }, 'Stock inválido: número ≥ 0 con hasta 3 decimales'],
    [{ 3: 'muchos' }, 'Stock inválido: número ≥ 0 con hasta 3 decimales'],
    [{ 4: ' ' }, 'Falta la categoría'],
    [{ 6: -5 }, 'Precio de compra inválido: número ≥ 0 con hasta 2 decimales'],
    [{ 7: null }, 'Falta el precio de venta'],
    [{ 7: 0 }, 'Precio de venta inválido: número > 0 con hasta 2 decimales'],
    [
      { 7: 10.001 },
      'Precio de venta inválido: número > 0 con hasta 2 decimales',
    ],
  ])('reports %o', (overrides, message) => {
    const result = analyzeSheet(sheet(row(overrides)), new Map());
    expect(result.candidates).toEqual([]);
    expect(result.errors).toEqual([
      expect.objectContaining({ row: 2, message }),
    ]);
  });
});

describe('readFirstSheet', () => {
  async function workbook(rows: unknown[][]): Promise<Buffer> {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Hoja 1');
    for (const values of rows) sheet.addRow(values);
    return Buffer.from(await book.xlsx.writeBuffer());
  }

  it('reads headers, flattens rich text and formulas and skips blank rows', async () => {
    const buffer = await workbook([
      HEADERS,
      ['Anillo', null, 75034450, 1, 'Lenceria', null, null, 100],
      [],
      [
        { richText: [{ text: 'Ani' }, { text: 'llo 2' }] },
        null,
        'C2',
        { formula: '1+1', result: 2 },
        'Lenceria',
        null,
        null,
        50,
      ],
    ]);
    const result = await readFirstSheet(buffer, 10);
    expect(result.headers.slice(0, 3)).toEqual([
      'articulo*',
      'Descripción',
      'Código de barras*',
    ]);
    expect(result.rows.map(({ row: r }) => r)).toEqual([2, 4]);
    expect(result.rows[0]!.cells[2]).toBe(75034450);
    expect(result.rows[1]!.cells.slice(0, 4)).toEqual([
      'Anillo 2',
      null,
      'C2',
      2,
    ]);
  });

  it('rejects invalid workbooks and too many rows', async () => {
    await expect(readFirstSheet(Buffer.from('not a zip'), 10)).rejects.toThrow(
      WorkbookError,
    );
    const buffer = await workbook([HEADERS, ['a'], ['b'], ['c']]);
    await expect(readFirstSheet(buffer, 2)).rejects.toThrow(
      'El archivo supera 2 renglones',
    );
  });
});
