import { describe, expect, it } from 'vitest';
import { appointmentsCsv, csvCell, parseAppointmentFilter } from './appointment-list';

describe('owner appointment list and CSV', () => {
  it('rejects unsupported status filters and long queries', () => {
    expect(parseAppointmentFilter(new URL('https://example.invalid/?status=unknown')).success).toBe(false);
    expect(parseAppointmentFilter(new URL(`https://example.invalid/?q=${'x'.repeat(101)}`)).success).toBe(false);
    expect(parseAppointmentFilter(new URL('https://example.invalid/?status=pending&q=Fictional')).success).toBe(true);
  });
  it('quotes cells and prevents spreadsheet formulas', () => {
    expect(csvCell('Alice, "A"')).toBe('"Alice, ""A"""');
    expect(csvCell('=HYPERLINK("evil")')).toBe('"\'=HYPERLINK(""evil"")"');
    expect(csvCell('  +1+2')).toBe('"\'  +1+2"');
    expect(appointmentsCsv([{ reference: 'MBF-1234ABCD', customer_name: '@SUM(1,2)' }])).toContain('"\'@SUM(1,2)"');
  });
});
