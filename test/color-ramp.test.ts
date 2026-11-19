import { describe, expect, it } from 'vitest';
import {
  COLOR_RAMP_PRESETS,
  buildColorRampData,
  parseColor,
  resolveColorRamp,
} from '../src/utils/color-ramp';

describe('parseColor', () => {
  it('parses hex in all lengths', () => {
    expect(parseColor('#fff')).toEqual([255, 255, 255, 255]);
    expect(parseColor('#0000')).toEqual([0, 0, 0, 0]);
    expect(parseColor('#2c7bb6')).toEqual([44, 123, 182, 255]);
    expect(parseColor('#2c7bb680')).toEqual([44, 123, 182, 128]);
  });

  it('parses rgb()/rgba()', () => {
    expect(parseColor('rgb(1, 2, 3)')).toEqual([1, 2, 3, 255]);
    expect(parseColor('rgba(1,2,3,0.5)')).toEqual([1, 2, 3, 128]);
  });

  it('parses keywords and rejects garbage', () => {
    expect(parseColor('white')).toEqual([255, 255, 255, 255]);
    expect(() => parseColor('not-a-color')).toThrow();
    expect(() => parseColor('#12')).toThrow();
  });
});

describe('resolveColorRamp', () => {
  it('returns a copy of the default preset', () => {
    const ramp = resolveColorRamp(undefined);
    expect(ramp).toEqual(COLOR_RAMP_PRESETS.wind);
    expect(ramp).not.toBe(COLOR_RAMP_PRESETS.wind);
  });

  it('accepts a preset name', () => {
    expect(resolveColorRamp('viridis')).toHaveLength(5);
  });

  it('throws on an unknown preset', () => {
    expect(() => resolveColorRamp('nope' as never)).toThrow(/Unknown color ramp/);
  });

  it('sorts user stops and copies them', () => {
    const ramp = resolveColorRamp([
      [1, '#fff'],
      [0, '#000'],
    ]);
    expect(ramp.map((s) => s[0])).toEqual([0, 1]);
  });
});

describe('buildColorRampData', () => {
  it('produces one RGBA texel per sample and hits both ends', () => {
    const data = buildColorRampData(
      [
        [0, '#000000'],
        [1, '#ffffff'],
      ],
      256,
    );

    expect(data).toHaveLength(256 * 4);
    expect([...data.slice(0, 3)]).toEqual([0, 0, 0]);
    expect([...data.slice(255 * 4, 255 * 4 + 3)]).toEqual([255, 255, 255]);
  });

  it('interpolates between stops', () => {
    const data = buildColorRampData(
      [
        [0, '#000'],
        [1, '#fff'],
      ],
      3,
    );
    expect([...data.slice(4, 7)]).toEqual([128, 128, 128]);
  });

  it('handles a single stop as a constant color', () => {
    const data = buildColorRampData([[0.5, '#123456']], 4);
    for (let i = 0; i < 4; i++) {
      expect([...data.slice(i * 4, i * 4 + 3)]).toEqual([0x12, 0x34, 0x56]);
    }
  });
});
