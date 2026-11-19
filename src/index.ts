/**
 * mapbox-gl-particle-layer
 *
 * GPU wind / flow particle layer for Mapbox GL JS and MapLibre GL JS.
 *
 * @packageDocumentation
 */

export { ParticleLayer } from './ParticleLayer';

export type {
  ColorRampPreset,
  ColorRampStops,
  CustomLayerLike,
  GLContext,
  LonLatBounds,
  MapRuntime,
  MapLike,
  ParticleLayerOptions,
  ParticleLayerUpdateOptions,
  RawWindData,
  WindSource,
} from './types';

export { COLOR_RAMP_PRESETS, buildColorRampData, parseColor, resolveColorRamp } from './utils/color-ramp';
export { DEFAULT_WIND_BOUNDS, loadWindImage } from './core/WindTexture';
export {
  clamp,
  intersectBounds,
  isValidBounds,
  lonLatToMercator,
  mercatorToLonLat,
  mercatorX,
  mercatorY,
  normalizeBounds,
  squareSide,
  wrapLongitude,
} from './utils/math';
export { packPosition, unpackPosition } from './utils/pack';
