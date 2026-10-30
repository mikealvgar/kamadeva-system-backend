import ExcelJS from 'exceljs';

export type RawCell = string | number | null;

export interface RawSheet {
  headers: string[];
  /** Data rows with their 1-based spreadsheet row number. */
  rows: Array<{ row: number; cells: RawCell[] }>;
}

/** Unreadable or structurally invalid workbook; mapped to 400. */
export class WorkbookError extends Error {}

/** Flatten an ExcelJS cell value (rich text, formula, hyperlink, date) to a primitive. */
function primitive(value: ExcelJS.CellValue): RawCell {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  if ('richText' in value)
    return value.richText.map((part) => part.text).join('');
  if ('formula' in value || 'sharedFormula' in value) {
    const result = (value as ExcelJS.CellFormulaValue).result;
    return result === undefined || result === null || typeof result === 'object'
      ? null
      : typeof result === 'boolean'
        ? String(result)
        : result;
  }
  if ('text' in value) return String(value.text);
  if ('error' in value) return null;
  return null;
}

/** Read the first worksheet: row 1 is the header row. */
export async function readFirstSheet(
  buffer: Buffer,
  maxRows: number,
): Promise<RawSheet> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new WorkbookError('Archivo Excel inválido');
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new WorkbookError('El archivo no tiene hojas');
  const width = sheet.columnCount;
  const cellsOf = (row: ExcelJS.Row) =>
    Array.from({ length: width }, (_, index) =>
      primitive(row.getCell(index + 1).value),
    );
  const headers = cellsOf(sheet.getRow(1)).map((cell) =>
    cell === null ? '' : String(cell),
  );
  const rows: RawSheet['rows'] = [];
  for (let number = 2; number <= sheet.rowCount; number++) {
    const cells = cellsOf(sheet.getRow(number));
    if (cells.every((cell) => cell === null || String(cell).trim() === ''))
      continue;
    rows.push({ row: number, cells });
    if (rows.length > maxRows)
      throw new WorkbookError(`El archivo supera ${maxRows} renglones`);
  }
  return { headers, rows };
}
