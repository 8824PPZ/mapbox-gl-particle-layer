import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ParticleLayer } from '../src/index.ts';
import { startFpsMeter } from './fps.js';

/**
 * Shows `constrainToViewport`: instead of seeding particles over the whole wind
 * raster, they are respawned inside the current map bounds. At city zoom the
 * field otherwise looks empty, because ~99% of the particles are off screen.
 */
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json',
  center: [4.4, 50.5],
  zoom: 5.4,
  hash: true,
});

map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
startFpsMeter(document.getElementById('fps'));

const $ = (id) => document.getElementById(id);

map.on('load', () => {
  const layer = new ParticleLayer({
    id: 'wind-particles',
    windSource: '/wind-global.png',
    windBounds: [-180, -85, 180, 85],
    maxWindSpeed: 30,
    numParticles: 16384,
    particleSize: 2.4,
    constrainToViewport: false,
    colorRamp: 'wind',
  });

  map.addLayer(layer);
  window.windLayer = layer;
  $('count').textContent = layer.particleCount.toLocaleString();

  const constrain = $('constrain');
  const output = $('constrain-out');

  constrain.addEventListener('change', () => {
    const enabled = constrain.checked;
    output.textContent = enabled ? 'visible box' : 'whole field';
    layer.updateOptions({ constrainToViewport: enabled });
    // reseed so the change is visible immediately
    layer.restart();
  });

  const particles = $('particles');
  particles.addEventListener('input', (event) => {
    $('particles-out').textContent = Number(event.target.value).toLocaleString();
  });
  particles.addEventListener('change', (event) => {
    layer.setNumParticles(Number(event.target.value));
    $('count').textContent = layer.particleCount.toLocaleString();
  });
  $('particles-out').textContent = Number(particles.value).toLocaleString();
});
