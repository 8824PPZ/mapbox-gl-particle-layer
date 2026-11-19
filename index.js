import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ParticleLayer } from './src/index.ts';
import { startFpsMeter } from './demos/fps.js';

/**
 * Landing page: a live instance of the layer over MapLibre's demo style, so
 * `npm run dev` shows something moving straight away.
 */
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json',
  center: [6, 28],
  zoom: 2,
  hash: true,
});

map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
startFpsMeter(document.getElementById('fps'));

map.on('load', () => {
  const layer = new ParticleLayer({
    id: 'wind-particles',
    windSource: '/wind-global.png',
    windBounds: [-180, -85, 180, 85],
    maxWindSpeed: 30,
    numParticles: 49152,
    particleSize: 2.1,
    colorRamp: 'wind',
  });

  map.addLayer(layer);
  document.getElementById('count').textContent = layer.particleCount.toLocaleString();
  window.windLayer = layer;
});

map.on('error', (event) => {
  console.error(event.error);
});
