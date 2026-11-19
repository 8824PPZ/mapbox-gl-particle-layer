import { describe, expect, it } from 'vitest';
import {
  intersectBounds,
  isValidBounds,
  lonLatToMercator,
  mercatorToLonLat,
  mercatorY,
  normalizeBounds,
  squareSide,
  wrapLongitude,
} from '../src/utils/math';

describe('mercator', () => {
  it('maps the world corners', () => {
    expect(lonLatToMercator(-180, 0)).toEqual([0, 0.5]);
    expect(lonLatToMercator(0, 0)).toEqual([0.5, 0.5]);
    expect(lonLatToMercator(180, 0)).toEqual([1, 0.5]);
  });

  it('puts the north pole above the south pole', () => {
    expect(mercatorY(85)).toBeLessThan(mercatorY(0));
    expect(mercatorY(0)).toBeLessThan(mercatorY(-85));
  });

  it('round-trips lon/lat', () => {
    for (const [lon, lat] of [
      [0, 0],
      [13.4, 52.5],
      [-122.4, 37.8],
      [151.2, -33.9],
    ]) {
      const [x, y] = lonLatToMercator(lon, lat);
      const [lon2, lat2] = mercatorToLonLat(x, y);
      expect(lon2).toBeCloseTo(lon, 6);
      expect(lat2).toBeCloseTo(lat, 6);
    }
  });

  it('clamps latitudes beyond the mercator limit', () => {
    expect(Number.isFinite(mercatorY(90))).toBe(true);
    expect(mercatorY(90)).toBeCloseTo(mercatorY(85.0511287798), 6);
  });
});

describe('wrapLongitude', () => {
  it('wraps into [-180, 180)', () => {
    expect(wrapLongitude(190)).toBeCloseTo(-170, 9);
    expect(wrapLongitude(-190)).toBeCloseTo(170, 9);
    expect(wrapLongitude(180)).toBeCloseTo(-180, 9);
    expect(wrapLongitude(-180)).toBeCloseTo(-180, 9);
  });
});

describe('squareSide', () => {
  it('rounds up to a perfect square', () => {
    expect(squareSide(1)).toBe(1);
    expect(squareSide(2)).toBe(2);
    expect(squareSide(16384)).toBe(128);
    expect(squareSide(16385)).toBe(129);
    expect(squareSide(0)).toBe(1);
  });
});

describe('bounds helpers', () => {
  it('validates tuples', () => {
    expect(isValidBounds([-10, -10, 10, 10])).toBe(true);
    expect(isValidBounds([10, -10, -10, 10])).toBe(false);
    expect(isValidBounds([0, 0, 0, 0])).toBe(false);
    expect(isValidBounds(['a', 0, 1, 1])).toBe(false);
    expect(isValidBounds(null)).toBe(false);
  });

  it('normalises reversed slices', () => {
    expect(normalizeBounds([20, 10, 0, -10])).toEqual([0, -10, 20, 10]);
  });

  it('intersects overlapping boxes', () => {
    expect(intersectBounds([-10, -10, 10, 10], [0, 0, 20, 20])).toEqual([0, 0, 10, 10]);
  });

  it('falls back to the first box when there is no overlap', () => {
    expect(intersectBounds([0, 0, 1, 1], [5, 5, 6, 6])).toEqual([0, 0, 1, 1]);
  });
});
