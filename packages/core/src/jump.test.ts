import { describe, expect, it } from 'vitest';
import { jumpDuration, jumpFuel, validateJump } from './jump.js';

describe('jumpFuel', () => {
  it('uses 10% of hull tonnage per parsec', () => {
    // 200t hull, Jump-2 => 0.1 * 200 * 2 = 40t
    expect(jumpFuel(200, 2).fuelTons).toBe(40);
    // 100t hull, Jump-1 => 10t
    expect(jumpFuel(100, 1).fuelTons).toBe(10);
  });

  it('reports fuel as a percentage of the hull', () => {
    expect(jumpFuel(200, 2).fuelPercentOfHull).toBe(20);
    expect(jumpFuel(600, 3).fuelPercentOfHull).toBe(30);
  });

  it('rejects non-positive inputs', () => {
    expect(() => jumpFuel(0, 1)).toThrow(RangeError);
    expect(() => jumpFuel(100, 0)).toThrow(RangeError);
  });
});

describe('validateJump', () => {
  it('accepts jumps within drive rating and 1..6', () => {
    expect(validateJump(2, 3).ok).toBe(true);
    expect(validateJump(1).ok).toBe(true);
    expect(validateJump(6).ok).toBe(true);
  });

  it('rejects jumps beyond the installed drive', () => {
    const result = validateJump(4, 2);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Jump-2 drive');
  });

  it('rejects out-of-range and non-integer jumps', () => {
    expect(validateJump(0).ok).toBe(false);
    expect(validateJump(7).ok).toBe(false);
    expect(validateJump(1.5).ok).toBe(false);
  });
});

describe('jumpDuration', () => {
  it('returns 148 + 6D bounds in hours', () => {
    const d = jumpDuration();
    expect(d.minHours).toBe(154);
    expect(d.avgHours).toBe(169);
    expect(d.maxHours).toBe(184);
  });
});
