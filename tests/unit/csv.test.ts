import { describe, expect, it } from 'vitest'
import {
  UTF8_BOM,
  escapeCsvCell,
  generateCsv,
  generateCsvBytes,
  protectCsvFormula,
} from '@/lib/domain/csv'

describe('CSV generation', () => {
  it('uses RFC 4180 quoting, doubled quotes and CRLF records', () => {
    const rows = [{ name: 'Doe, "Jane"', note: 'first line\nsecond line' }]
    const csv = generateCsv(rows, [
      { key: 'name', header: 'Name' },
      { key: 'note', header: 'Note' },
    ])
    expect(csv).toBe('Name,Note\r\n"Doe, ""Jane""","first line\nsecond line"\r\n')
  })

  it.each([
    ['=1+1', "'=1+1"],
    [' +SUM(A1:A2)', "' +SUM(A1:A2)"],
    ['\t-cmd', "'\t-cmd"],
    ['\f+cmd', "'\f+cmd"],
    ['  @IMPORTXML(x)', "'  @IMPORTXML(x)"],
  ])('neutralizes formula text including leading whitespace: %j', (input, expected) => {
    expect(protectCsvFormula(input)).toBe(expected)
    expect(escapeCsvCell(input)).toBe(expected)
  })

  it('keeps primitive negative numbers numeric', () => {
    expect(escapeCsvCell(-42)).toBe('-42')
  })

  it('exports only explicitly allowlisted columns', () => {
    const rows = [
      {
        universityId: 'MU-2026-00001',
        program: 'BSc Computing',
        privateNotes: 'must not leak',
        passwordHash: 'must not leak either',
      },
    ]
    const csv = generateCsv(rows, [
      { key: 'universityId', header: 'University ID' },
      { key: 'program', header: 'Program' },
    ])
    expect(csv).toBe('University ID,Program\r\nMU-2026-00001,BSc Computing\r\n')
    expect(csv).not.toContain('privateNotes')
    expect(csv).not.toContain('must not leak')
    expect(csv).not.toContain('passwordHash')
  })

  it('encodes international text as UTF-8 and optionally emits a BOM', () => {
    const rows = [{ label: 'ကျောင်းသား' }]
    const columns = [{ key: 'label' as const, header: 'Label' }]
    const decoded = new TextDecoder('utf-8').decode(generateCsvBytes(rows, columns))
    expect(decoded).toBe('Label\r\nကျောင်းသား\r\n')
    expect(generateCsv(rows, columns, { includeUtf8Bom: true }).startsWith(UTF8_BOM)).toBe(true)
  })

  it('rejects missing and duplicate column allowlists', () => {
    expect(() => generateCsv([], [])).toThrow(/At least one/)
    expect(() =>
      generateCsv(
        [{ name: 'Ada' }],
        [
          { key: 'name', header: 'Name' },
          { key: 'name', header: 'Again' },
        ],
      ),
    ).toThrow(/Duplicate/)
  })
})
