export type CsvCellValue = string | number | boolean | bigint | Date | null | undefined

export interface CsvColumn<Row extends object> {
  /** Explicit allowlist key. Object properties not listed here are never exported. */
  key: Extract<keyof Row, string>
  header: string
  format?: (value: Row[Extract<keyof Row, string>], row: Row) => CsvCellValue
}

export interface GenerateCsvOptions {
  includeUtf8Bom?: boolean
}

export const CSV_CONTENT_TYPE = 'text/csv; charset=utf-8'
export const UTF8_BOM = '\uFEFF'
const FORMULA_PREFIX = /^\s*[=+\-@]/u

/** Prefixes spreadsheet-significant user text while preserving its exact value. */
export function protectCsvFormula(value: string): string {
  return FORMULA_PREFIX.test(value) ? `'${value}` : value
}

function stringifyCell(value: CsvCellValue): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime()))
      throw new TypeError('CSV values cannot contain an invalid Date.')
    return value.toISOString()
  }
  return String(value)
}

/** RFC 4180 field escaping with spreadsheet-formula protection for string values. */
export function escapeCsvCell(value: CsvCellValue): string {
  const text = typeof value === 'string' ? protectCsvFormula(value) : stringifyCell(value)
  return /[",\r\n]/u.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function validateColumns<Row extends object>(columns: readonly CsvColumn<Row>[]): void {
  if (columns.length === 0) throw new TypeError('At least one CSV column is required.')
  const keys = new Set<string>()
  for (const column of columns) {
    const key = String(column.key).trim()
    if (!key) throw new TypeError('CSV column keys cannot be empty.')
    if (!column.header.trim()) throw new TypeError(`CSV column "${key}" requires a header.`)
    if (keys.has(key)) throw new TypeError(`Duplicate CSV column "${key}".`)
    keys.add(key)
  }
}

/**
 * Generates a UTF-8/RFC 4180 CSV string. Only explicitly listed columns are
 * read, so internal IDs, notes, hashes and other hidden fields cannot leak by
 * object enumeration.
 */
export function generateCsv<Row extends object>(
  rows: readonly Row[],
  columns: readonly CsvColumn<Row>[],
  options: GenerateCsvOptions = {},
): string {
  validateColumns(columns)
  const lines = [
    columns.map((column) => escapeCsvCell(column.header)).join(','),
    ...rows.map((row) =>
      columns
        .map((column) => {
          const value = row[column.key]
          return escapeCsvCell(column.format ? column.format(value, row) : (value as CsvCellValue))
        })
        .join(','),
    ),
  ]
  const csv = `${lines.join('\r\n')}\r\n`
  return options.includeUtf8Bom ? `${UTF8_BOM}${csv}` : csv
}

export function generateCsvBytes<Row extends object>(
  rows: readonly Row[],
  columns: readonly CsvColumn<Row>[],
  options: GenerateCsvOptions = {},
): Uint8Array {
  return new TextEncoder().encode(generateCsv(rows, columns, options))
}

export const createCsvExport = generateCsv
