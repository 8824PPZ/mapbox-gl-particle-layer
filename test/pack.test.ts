import { describe, expect, it } from 'vitest';
import { packChannel, packPosition, unpackChannel, unpackPosition } from '../src/utils/pack';

describe('packChannel', () => {
  it('round-trips through the two bytes', () => {
    for (const value of [0, 0.1, 0.25, 1 / 3, 0.5, 0.75, 0.999, 1]) {
      const [hi, lo] = packChannel(value);
      expect(unpackChannel(hi, lo)).toBeCloseTo(value, 4);
    }
  });

  it('keeps every byte inside 0..255', () => {
    for (let i = 0; i <= 1; i += 0.001) {
      const [hi, lo] = packChannel(i);
      expect(hi).toBeGreaterThanOrEqual(0);
      expect(hi).toBeLessThanOrEqual(255);
      expect(lo).toBeGreaterThanOrEqual(0);
      expect(lo).toBeLessThanOrEqual(255);
    }
  });

  it('is more precise than a single byte', () => {
    const value = 0.123456;
    const [hi, lo] = packChannel(value);
    const error = Math.abs(unpackChannel(hi, lo) - value);
    expect(error).toBeLessThan(1 / 65025 / 2);
  });

  it('clamps out of range input', () => {
    expect(packChannel(-1)).toEqual([0, 0]);
    expect(packChannel(2)).toEqual([255, 0]);
  });
});

describe('packPosition', () => {
  it('round-trips x and y independently', () => {
    const [r, g, b, a] = packPosition(0.75, 0.2);
    const [x, y] = unpackPosition(r, g, b, a);
    expect(x).toBeCloseTo(0.75, 4);
    expect(y).toBeCloseTo(0.2, 4);
  });
});
