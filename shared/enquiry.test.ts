import { describe, expect, it } from 'vitest';
import { demoIntent, redactContact, validIntent } from './enquiry';

const services = [{ id: 'cut', name: 'Signature haircut' }, { id: 'beard', name: 'Beard shaping' }, { id: 'combo', name: 'Cut + beard' }];
const today = '2026-11-11';
describe('no-key enquiry extraction', () => {
  it('extracts a normal English request', () => {
    expect(demoIntent('I need a haircut tomorrow around 5 PM.', services, 'Asia/Colombo', today)).toMatchObject({ serviceId: 'cut', date: '2026-11-12', time: '17:00', language: 'en', missing: [] });
  });
  it('keeps missing and ambiguous information explicit', () => {
    expect(demoIntent('Can I book a haircut?', services, 'Asia/Colombo', today).missing).toEqual(['date', 'time']);
    expect(demoIntent('Can I come tomorrow?', services, 'Asia/Colombo', today).missing).toEqual(['service', 'time']);
  });
  it('rejects invalid dates and unsupported services', () => {
    expect(demoIntent('Haircut on 2026-02-31 at 5 PM', services, 'Asia/Colombo', today).date).toBeNull();
    expect(demoIntent('I need a car repair tomorrow at 5 PM', services, 'Asia/Colombo', today).serviceId).toBeNull();
  });
  it('recognizes a Sinhala request', () => {
    expect(demoIntent('හෙට පස්වරු 5ට කොණ්ඩය කපන්න', services, 'Asia/Colombo', today)).toMatchObject({ serviceId: 'cut', date: '2026-11-12', time: '17:00', language: 'si' });
  });
  it('rejects malformed remote output and unknown service IDs', () => {
    expect(validIntent({ serviceId: 'fake', date: '2026-11-12', time: '17:00', language: 'en' }, services, 'Asia/Colombo', today)).toBeNull();
    expect(validIntent({ serviceId: 'cut', date: 'yesterday', time: '17:00', language: 'en' }, services, 'Asia/Colombo', today)).toBeNull();
    expect(validIntent('not json', services, 'Asia/Colombo', today)).toBeNull();
  });
  it('redacts obvious contact details before a remote request', () => {
    expect(redactContact('Call +94 77 123 4567 or a@b.com')).toBe('Call [phone] or [email]');
  });
});
