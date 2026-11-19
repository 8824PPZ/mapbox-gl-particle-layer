---
name: Bug report
about: Something renders wrong, crashes, or performs badly
labels: [bug]
---

## What happened

<!-- A clear description of the problem. -->

## Expected behaviour

## Reproduction

- Demo page: `demos/…` or a CodeSandbox link:
- Map runtime + version (Mapbox GL JS / MapLibre GL JS):
- Browser + GPU:
- `numParticles` / `zoom` / `renderingMode` if relevant:

```ts
const layer = new ParticleLayer({
  // minimal options that reproduce it
});
```

## Screenshots / video

<!-- Optional but very helpful for shader issues. -->

## Notes

If the problem is visual, mention the affected shader in `src/shaders/`
(`update.frag.glsl`, `draw.vert.glsl`, …) so the fix stays local.
