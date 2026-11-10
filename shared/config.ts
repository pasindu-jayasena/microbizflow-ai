import { z } from 'zod';

export const serviceConfig = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().min(2).max(500),
  durationMin: z.number().int().min(15).max(480).refine(value => value % 15 === 0, 'Use 15-minute increments'),
  priceMinor: z.number().int().min(0).max(10_000_000),
  active: z.boolean(),
});

export const hoursConfig = z.discriminatedUnion('closed', [
  z.object({ closed: z.literal(true) }),
  z.object({
    closed: z.literal(false),
    openMin: z.number().int().min(0).max(1439).refine(value => value % 15 === 0),
    closeMin: z.number().int().min(1).max(1440).refine(value => value % 15 === 0),
  }).refine(value => value.closeMin > value.openMin, 'Closing time must follow opening time'),
]);
