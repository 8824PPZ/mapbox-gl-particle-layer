/** Tiny FPS readout shared by the demos. */
export function startFpsMeter(element) {
  if (!element) return () => {};
  let frames = 0;
  let last = performance.now();
  let raf = 0;

  const tick = () => {
    frames++;
    const now = performance.now();
    const elapsed = now - last;
    if (elapsed >= 500) {
      element.textContent = Math.round((frames * 1000) / elapsed);
      frames = 0;
      last = now;
    }
    raf = requestAnimationFrame(tick);
  };

  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
