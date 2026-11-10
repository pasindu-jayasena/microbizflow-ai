import { describe, expect, it } from 'vitest';
import { canTransition } from './appointments';

describe('appointment transitions', () => {
  it('allows an owner to confirm and later complete a booking', () => {
    expect(canTransition('pending', 'confirmed')).toBe(true);
    expect(canTransition('confirmed', 'completed')).toBe(true);
  });
  it('rejects a change after cancellation or completion', () => {
    expect(canTransition('cancelled', 'confirmed')).toBe(false);
    expect(canTransition('completed', 'pending')).toBe(false);
    expect(canTransition('confirmed', 'declined')).toBe(false);
  });
});
