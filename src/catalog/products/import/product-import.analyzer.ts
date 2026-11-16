import { Prisma } from '../../../generated/prisma/client.js';
import type { RawCell, RawSheet } from './xlsx-reader.js';

/** Columns recognized by normalized header (lower-case, no accents, no `*`). */
export const COLUMNS = {
  name: 'articulo',
  description: 'descripcion',
  barcode: 'codigo de barras',
  stock: 'stock',
  category: 'categoria',
  brand: 'marca',
  cost: 'precio compra',
  price: 'precio venta',
} as const;
type Column = keyof typeof COLUMNS;
const REQUIRED: Column[] = ['name', 'barcode', 'stock', 'category', 'price'];

export interface ImportIssue {
  row: number;
  codigoBarras: string | null;
  articulo: string | null;
}
export interface ImportError extends ImportIssue {
  message: string;
}
export interface ImportSkip extends ImportIssue {
  reason: string;
}

export interface ParsedProduct {
  row: number;
  barcode: string;
  name: string;
  description: string | null;
  brand: string | null;
  stock: Prisma.Decimal;
  cost: Prisma.Decimal | null;
  price: Prisma.Decimal;
  /** Upper-case category name, or null when it must be imported without one. */
  category: string | null;
}

export interface AnalyzedSheet {
  totalRows: number;
  /** One candidate per barcode, still to be checked against the database. */
  candidates: ParsedProduct[];
  skipped: ImportSkip[];
  errors: ImportError[];
}

/** Bad header row or category map; the whole request is rejected (400). */
export class ImportFormatError extends Error {}

const stripAccents = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '');
const collapse = (value: string) => value.trim().replace(/\s+/g, ' ');

export const normalizeHeader = (value: string) =>
  collapse(stripAccents(value).replace(/\*/g, '')).toLowerCase();

/** Category lookup key: upper-case, no accents, single spaces. */
export const categoryKey = (value: string) =>
  collapse(stripAccents(value)).toUpperCase();

/** "Same product" compares names ignoring case and extra spaces. */
export const nameKey = (value: string) => collapse(value).toLowerCase();

/**
 * Excel stores numeric codes as numbers (7.503445E7) and marks text codes
 * with a leading apostrophe or acute accent (´0704…). Returns null if empty.
 */
export function normalizeBarcode(value: RawCell): string | null {
  if (value === null) return null;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0)
      throw new Error('Código de barras numérico inválido');
    return String(value);
  }
  // Trim first: the text marker may follow leading spaces.
  const text = collapse(collapse(value).replace(/^[´'`‘’]+/, '')).toUpperCase();
  return text === '' ? null : text;
}

/** Validate the cashier-supplied category map: key → target name or null. */
export function parseCategoryMap(
  raw: string | undefined,
): Map<string, string | null> {
  if (raw === undefined || raw.trim() === '') return new Map();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ImportFormatError('categoryMap debe ser JSON válido');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new ImportFormatError('categoryMap debe ser un objeto');
  const map = new Map<string, string | null>();
  for (const [key, target] of Object.entries(parsed)) {
    if (target !== null && typeof target !== 'string')
      throw new ImportFormatError(
        `categoryMap["${key}"] debe ser texto o null`,
      );
    const normalizedTarget =
      target === null ? null : collapse(target).toUpperCase();
    if (
      categoryKey(key) === '' ||
      key.length > 100 ||
      normalizedTarget === '' ||
      (normalizedTarget?.length ?? 0) > 100
    )
      throw new ImportFormatError(`categoryMap["${key}"] inválido`);
    map.set(categoryKey(key), normalizedTarget);
  }
  return map;
}

function columnIndexes(headers: string[]): Partial<Record<Column, number>> {
  const byHeader = new Map(
    headers.map((header, index) => [normalizeHeader(header), index]),
  );
  const indexes: Partial<Record<Column, number>> = {};
  for (const [column, header] of Object.entries(COLUMNS) as Array<
    [Column, string]
  >) {
    const index = byHeader.get(header);
    if (index !== undefined) indexes[column] = index;
  }
  const missing = REQUIRED.filter((column) => indexes[column] === undefined);
  if (missing.length > 0)
    throw new ImportFormatError(
      `Faltan columnas obligatorias: ${missing.map((c) => COLUMNS[c]).join(', ')}`,
    );
  return indexes;
}

function text(value: RawCell): string | null {
  if (value === null) return null;
  const result = collapse(String(value));
  return result === '' ? null : result;
}

function decimal(
  value: RawCell,
  places: number,
): Prisma.Decimal | null | 'invalid' {
  if (value === null || (typeof value === 'string' && value.trim() === ''))
    return null;
  try {
    const parsed = new Prisma.Decimal(
      typeof value === 'number' ? value : value.trim(),
    );
    if (!parsed.isFinite() || parsed.decimalPlaces() > places) return 'invalid';
    return parsed;
  } catch {
    return 'invalid';
  }
}

function parseRow(
  row: number,
  cells: RawCell[],
  indexes: Partial<Record<Column, number>>,
  categoryMap: Map<string, string | null>,
): ParsedProduct | ImportError {
  const cell = (column: Column) =>
    indexes[column] === undefined ? null : (cells[indexes[column]] ?? null);
  const name = text(cell('name'));
  let barcode: string | null;
  try {
    barcode = normalizeBarcode(cell('barcode'));
  } catch (error) {
    return {
      row,
      codigoBarras: null,
      articulo: name,
      message: (error as Error).message,
    };
  }
  const fail = (message: string): ImportError => ({
    row,
    codigoBarras: barcode,
    articulo: name,
    message,
  });
  if (!name) return fail('Falta el artículo');
  if (name.length > 200) return fail('El artículo supera 200 caracteres');
  if (!barcode) return fail('Falta el código de barras');
  if (barcode.length > 64)
    return fail('El código de barras supera 64 caracteres');
  const description = text(cell('description'));
  if (description && description.length > 500)
    return fail('La descripción supera 500 caracteres');
  const brand = text(cell('brand'));
  if (brand && brand.length > 100)
    return fail('La marca supera 100 caracteres');
  const stock = decimal(cell('stock'), 3);
  if (stock === null) return fail('Falta el stock');
  if (
    stock === 'invalid' ||
    stock.isNegative() ||
    stock.greaterThan('99999999999.999')
  )
    return fail('Stock inválido: número ≥ 0 con hasta 3 decimales');
  const cost = decimal(cell('cost'), 2);
  if (
    cost === 'invalid' ||
    cost?.isNegative() ||
    cost?.greaterThan('9999999999.99')
  )
    return fail('Precio de compra inválido: número ≥ 0 con hasta 2 decimales');
  const price = decimal(cell('price'), 2);
  if (price === null) return fail('Falta el precio de venta');
  if (
    price === 'invalid' ||
    !price.greaterThan(0) ||
    price.greaterThan('9999999999.99')
  )
    return fail('Precio de venta inválido: número > 0 con hasta 2 decimales');
  const rawCategory = text(cell('category'));
  if (!rawCategory) return fail('Falta la categoría');
  const key = categoryKey(rawCategory);
  const category = categoryMap.has(key)
    ? categoryMap.get(key)!
    : collapse(rawCategory).toUpperCase();
  if (category !== null && category.length > 100)
    return fail('La categoría supera 100 caracteres');
  return {
    row,
    barcode,
    name,
    description,
    brand,
    stock,
    cost,
    price,
    category,
  };
}

/**
 * Validate every row and resolve duplicates inside the file: rows sharing a
 * barcode and name are one product (first wins); rows sharing a barcode with
 * different names are all rejected.
 */
export function analyzeSheet(
  sheet: RawSheet,
  categoryMap: Map<string, string | null>,
): AnalyzedSheet {
  const indexes = columnIndexes(sheet.headers);
  const errors: ImportError[] = [];
  const byBarcode = new Map<string, ParsedProduct[]>();
  for (const { row, cells } of sheet.rows) {
    const parsed = parseRow(row, cells, indexes, categoryMap);
    if ('message' in parsed) {
      errors.push(parsed);
      continue;
    }
    const group = byBarcode.get(parsed.barcode) ?? [];
    group.push(parsed);
    byBarcode.set(parsed.barcode, group);
  }
  const candidates: ParsedProduct[] = [];
  const skipped: ImportSkip[] = [];
  for (const group of byBarcode.values()) {
    const first = group[0]!;
    if (new Set(group.map(({ name }) => nameKey(name))).size > 1) {
      const rows = group.map(({ row }) => row).join(', ');
      for (const product of group)
        errors.push({
          row: product.row,
          codigoBarras: product.barcode,
          articulo: product.name,
          message: `Código compartido por productos distintos (renglones ${rows})`,
        });
      continue;
    }
    candidates.push(first);
    for (const duplicate of group.slice(1))
      skipped.push({
        row: duplicate.row,
        codigoBarras: duplicate.barcode,
        articulo: duplicate.name,
        reason: `Duplicado en el archivo (renglón ${first.row})`,
      });
  }
  const byRow = (a: { row: number }, b: { row: number }) => a.row - b.row;
  return {
    totalRows: sheet.rows.length,
    candidates: candidates.sort(byRow),
    skipped: skipped.sort(byRow),
    errors: errors.sort(byRow),
  };
}
