/**
 * Type-level compatibility test (checked by `npm run typecheck`, not executed).
 *
 * The library ships its own structural types so it never has to import a map
 * runtime. This file makes sure that promise still holds against the real
 * `CustomLayerInterface` of both runtimes — including the next major versions.
 */
import type { CustomLayerInterface as MapboxCustomLayer } from 'mapbox-gl';
import type * as maplibregl from 'maplibre-gl';
import { ParticleLayer } from '../src/index';

const layer = new ParticleLayer({ id: 'wind' });

// MapLibre
const maplibreLayer: maplibregl.CustomLayerInterface = layer;

// Mapbox GL JS
const mapboxLayer: MapboxCustomLayer = layer;

// Both runtimes accept the same instance where a layer id is all they need.
const ids: string[] = [maplibreLayer.id, mapboxLayer.id];

export { ids };
