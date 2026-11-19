import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { ParticleLayer } from '../src/index.ts';
import { startFpsMeter } from './fps.js';

/**
 * Mapbox GL JS demo. The layer is runtime agnostic — only the basemap style and
 * the token differ from `maplibre.js`.
 */
const params = new URLSearchParams(location.search);
const token = params.get('token') || localStorage.getItem('mapbox_token') || '';

const overlay = document.getElementById('token-overlay');
const form = document.getElementById('token-form');
const input = document.getElementById('token-input');

if (!token) {
  overlay.hidden = false;
  input.focus();
} else {
  localStorage.setItem('mapbox_token', token);
  start(token);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const value = input.value.trim();
  if (!value) return;
  localStorage.setItem('mapbox_token', value);
  location.reload();
});

form.querySelector('[data-demo="maplibre"]').addEventListener('click', () => {
  location.href = './maplibre.html';
});

function start(accessToken) {
  mapboxgl.accessToken = accessToken;

  const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/light-v11',
    center: [8, 34],
    zoom: 2.2,
    hash: true,
  });

  map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'bottom-right');
  startFpsMeter(document.getElementById('fps'));

  map.on('load', () => {
    const layer = new ParticleLayer({
      id: 'wind-particles',
      windSource: '/wind-global.png',
      windBounds: [-180, -85, 180, 85],
      maxWindSpeed: 30,
      numParticles: 32768,
      particleSize: 2.2,
      colorRamp: 'wind',
      mapRuntime: 'mapbox',
    });

    map.addLayer(layer);
    document.getElementById('count').textContent = layer.particleCount.toLocaleString();
    window.windLayer = layer;
  });

  map.on('error', (event) => {
    console.error(event.error);
    if (String(event.error?.message || '').includes('token')) {
      overlay.hidden = false;
    }
  });
}
