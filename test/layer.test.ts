import { describe, expect, it } from 'vitest';
import { ParticleLayer } from '../src/ParticleLayer';

describe('ParticleLayer options', () => {
  it('requires an id', () => {
    expect(() => new ParticleLayer({ id: '' })).toThrow(/id/);
    // @ts-expect-error id is required
    expect(() => new ParticleLayer({})).toThrow(/id/);
  });

  it('applies defaults', () => {
    const layer = new ParticleLayer({ id: 'wind' });
    const options = layer.getOptions();

    expect(options.numParticles).toBe(16384);
    expect(options.maxWindSpeed).toBe(30);
    expect(options.colorScale).toBe(30);
    expect(options.colorRamp).toBe('wind');
    expect(options.particleSize).toBe(2.2);
    expect(options.fadeOpacity).toBe(1);
    expect(options.animate).toBe(true);
    expect(options.wrapLongitude).toBe(true);
    expect(options.constrainToViewport).toBe(false);
    expect(options.windBounds).toEqual([-180, -89.9, 180, 89.9]);
  });

  it('rounds the particle count up to a square texture', () => {
    expect(new ParticleLayer({ id: 'a', numParticles: 16384 }).particleCount).toBe(16384);
    expect(new ParticleLayer({ id: 'b', numParticles: 16385 }).particleCount).toBe(16641);
  });

  it('derives the color scale from maxWindSpeed unless overridden', () => {
    expect(new ParticleLayer({ id: 'a', maxWindSpeed: 12 }).getOptions().colorScale).toBe(12);
    expect(
      new ParticleLayer({ id: 'b', maxWindSpeed: 12, colorScale: 4 }).getOptions().colorScale,
    ).toBe(4);
  });

  it('is not ready before it is added to a map', () => {
    expect(new ParticleLayer({ id: 'wind' }).ready).toBe(false);
  });

  it('merges option patches without dropping the previous values', () => {
    const layer = new ParticleLayer({ id: 'wind', maxWindSpeed: 18, opacity: 0.5 });
    layer.updateOptions({ particleSize: 3 });

    const options = layer.getOptions();
    expect(options.maxWindSpeed).toBe(18);
    expect(options.opacity).toBe(0.5);
    expect(options.particleSize).toBe(3);
  });
});
