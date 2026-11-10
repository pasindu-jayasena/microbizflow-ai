import { describe, expect, it } from 'vitest';
import { hoursConfig, serviceConfig } from './config';

describe('owner configuration validation', () => {
  const service = { name: 'Signature haircut', description: 'Careful cut', durationMin: 45, priceMinor: 250000, active: true };
  it('accepts an aligned service and rejects invalid duration or price', () => {
    expect(serviceConfig.safeParse(service).success).toBe(true);
    expect(serviceConfig.safeParse({ ...service, durationMin: 47 }).success).toBe(false);
    expect(serviceConfig.safeParse({ ...service, priceMinor: -1 }).success).toBe(false);
  });
  it('accepts closed days and valid hours but rejects inverted windows', () => {
    expect(hoursConfig.safeParse({ closed: true }).success).toBe(true);
    expect(hoursConfig.safeParse({ closed: false, openMin: 540, closeMin: 1020 }).success).toBe(true);
    expect(hoursConfig.safeParse({ closed: false, openMin: 1020, closeMin: 540 }).success).toBe(false);
    expect(hoursConfig.safeParse({ closed: false, openMin: 541, closeMin: 1020 }).success).toBe(false);
  });
});
