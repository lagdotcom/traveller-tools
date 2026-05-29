import { describe, expect, it } from 'vitest';
import { humanizeDuration, travel } from './travel.js';

describe('travel (flip and burn)', () => {
  it('matches a hand-computed clean case', () => {
    // 100 km at 1 G with g = 10 m/s^2:
    //   a = 10, d = 100_000 m
    //   t = 2 * sqrt(100_000 / 10) = 2 * sqrt(10_000) = 2 * 100 = 200 s
    //   peak = sqrt(10 * 100_000) = sqrt(1e6) = 1000 m/s
    const r = travel(100, 'km', 1, 10);
    expect(r.seconds).toBeCloseTo(200, 6);
    expect(r.peakVelocityMs).toBeCloseTo(1000, 6);
    expect(r.peakVelocityKms).toBeCloseTo(1, 6);
  });

  it('computes 1 AU at 1 G with standard gravity', () => {
    const r = travel(1, 'AU', 1);
    // ~246,978 s (~2.86 days), peak ~1211 km/s
    expect(Math.abs(r.seconds - 246_978)).toBeLessThan(50);
    expect(Math.abs(r.peakVelocityKms - 1211.4)).toBeLessThan(1);
  });

  it('higher thrust is faster (and inversely proportional to sqrt)', () => {
    const oneG = travel(1, 'AU', 1);
    const fourG = travel(1, 'AU', 4);
    // Quadrupling acceleration halves the time (2 * sqrt(d/a)).
    expect(fourG.seconds).toBeCloseTo(oneG.seconds / 2, 3);
  });

  it('rejects non-positive inputs', () => {
    expect(() => travel(0, 'km', 1)).toThrow(RangeError);
    expect(() => travel(100, 'km', 0)).toThrow(RangeError);
  });
});

describe('humanizeDuration', () => {
  it('breaks seconds into d/h/m/s', () => {
    expect(humanizeDuration(90_061)).toEqual({
      days: 1,
      hours: 1,
      minutes: 1,
      seconds: 1,
    });
  });
});
