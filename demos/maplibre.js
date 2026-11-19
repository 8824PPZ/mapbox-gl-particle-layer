import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ParticleLayer } from '../src/index.ts';
import { startFpsMeter } from './fps.js';

/**
 * MapLibre GL JS demo — the simplest possible setup.
 * The basemap is MapLibre's public demo style, so no token is needed.
 */
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json',
  center: [8, 34],
  zoom: 2.2,
  hash: true,
  attributionControl: { compact: true },
});

map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
startFpsMeter(document.getElementById('fps'));

map.on('load', () => {
  const layer = new ParticleLayer({
    id: 'wind-particles',
    windSource: '/wind-global.png',
    windBounds: [-180, -85, 180, 85],
    maxWindSpeed: 30,
    numParticles: 32768,
    particleSize: 2.2,
    opacity: 0.95,
    colorRamp: 'wind',
    mapRuntime: 'maplibre',
  });

  map.addLayer(layer);
  document.getElementById('count').textContent = layer.particleCount.toLocaleString();

  // handy while hacking on the layer
  window.windLayer = layer;
});

map.on('error', (event) => {
  console.error(event.error);
});
