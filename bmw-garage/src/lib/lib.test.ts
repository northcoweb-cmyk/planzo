import { describe, expect, it } from 'vitest'
import { addDays, addMonths, daysBetween, isValidDateStr, weekKey } from './dates'
import { checkVin } from './vin'
import { toCsv } from './csv'
import { parseNum } from './format'

describe('dates', () => {
  it('handles month ends, DST and week keys', () => {
    expect(addMonths('2025-01-31', 1)).toBe('2025-02-28')
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29')
    expect(addMonths('2025-09-13', 24)).toBe('2027-09-13')
    expect(daysBetween('2025-03-01', '2025-03-31')).toBe(30)
    expect(daysBetween('2025-11-01', '2025-11-03')).toBe(2) // across DST fall-back
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01')
    expect(weekKey('2025-10-01')).toBe('2025-09-29') // Wednesday -> Monday
    expect(isValidDateStr('2025-02-30')).toBe(false)
  })
})
describe('vin', () => {
  it('validates length, forbidden letters and check digit; never invents', () => {
    expect(checkVin('').ok).toBe(true)
    expect(checkVin('1HGCM82633A004352').ok).toBe(true)
    expect(checkVin('1HGCM82633A004353').ok).toBe(false)
    expect(checkVin('1HGCM82633A00435').message).toMatch(/17/)
    expect(checkVin('1HGCM82633A00435O').message).toMatch(/I, O or Q/)
  })
})
describe('csv + numbers', () => {
  it('escapes csv', () => { expect(toCsv(['a', 'b'], [['x,y', 'say "hi"'], [1, null]])).toBe('a,b\r\n"x,y","say ""hi"""\r\n1,\r\n') })
  it('parses user numbers', () => { expect(parseNum('65,482')).toBe(65482); expect(parseNum('$12.50')).toBe(12.5); expect(parseNum('')).toBeNull(); expect(parseNum('abc')).toBeNull() })
})
