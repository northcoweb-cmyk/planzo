export type CsvCell = string | number | boolean | null | undefined

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const esc = (c: CsvCell) => {
    if (c == null) return ''
    const s = String(c)
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  return [headers, ...rows].map(r => r.map(esc).join(',')).join('\r\n') + '\r\n'
}
