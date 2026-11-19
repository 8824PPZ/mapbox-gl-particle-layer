import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ParticleLayer } from '../src/index.ts';
import { startFpsMeter } from './fps.js';

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json',
  center: [4, 30],
  zoom: 2.1,
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
    numParticles: 32768,
    particleSize: 2.2,
    colorRamp: 'wind',
  });

  map.addLayer(layer);
  window.windLayer = layer;

  const countOut = $('count');
  const refreshCount = () => {
    countOut.textContent = layer.particleCount.toLocaleString();
  };
  refreshCount();

  $('ramp').addEventListener('change', (event) => {
    layer.setColorRamp(event.target.value);
  });

  const particles = $('particles');
  // rebuild only on release: the slider fires continuously while dragging
  particles.addEventListener('input', (event) => {
    $('particles-out').textContent = Number(event.target.value).toLocaleString();
  });
  particles.addEventListener('change', (event) => {
    layer.setNumParticles(Number(event.target.value));
    refreshCount();
  });
  $('particles-out').textContent = Number(particles.value).toLocaleString();

  const size = $('size');
  size.addEventListener('input', (event) => {
    const value = Number(event.target.value);
    $('size-out').textContent = value.toFixed(1);
    layer.updateOptions({ particleSize: value });
  });

  const trail = $('trail');
  trail.addEventListener('input', (event) => {
    const value = Number(event.target.value);
    // 1 means "repaint every frame", anything below accumulates a trail
    $('trail-out').textContent = value >= 0.999 ? 'off' : `${Math.round(value * 100)}%`;
    layer.updateOptions({ fadeOpacity: value });
  });

  const speed = $('speed');
  speed.addEventListener('input', (event) => {
    const value = Number(event.target.value);
    $('speed-out').textContent = `${value.toFixed(1)}×`;
    layer.updateOptions({ speedFactor: value });
  });
});
