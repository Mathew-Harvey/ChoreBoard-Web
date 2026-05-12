/**
 * Fire a localised burst of confetti from a screen-space anchor (or an element).
 * Used for goal-hit celebrations, payday banner spawn, etc.
 *
 * Self-contained: no React, no portals, no dependencies. Adds DOM nodes to
 * <body>, animates them with the existing `confettiFall` keyframes, and
 * cleans up after itself. Honors prefers-reduced-motion (no-op).
 */
export function celebrate(
  anchor:
    | { x: number; y: number }
    | HTMLElement
    | null
    | undefined = null,
  options: { pieces?: number; spread?: number; durationMs?: number } = {},
) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = [
    'position: fixed',
    'inset: 0',
    'pointer-events: none',
    'overflow: hidden',
    'z-index: 80',
  ].join(';');

  let origin: { x: number; y: number };
  if (!anchor) {
    origin = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  } else if (anchor instanceof HTMLElement) {
    const r = anchor.getBoundingClientRect();
    origin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  } else {
    origin = anchor;
  }

  const pieces = options.pieces ?? 60;
  const spread = options.spread ?? 360;
  const colors = ['#3253D7', '#DB4646', '#E8B12A', '#3CA163', '#E07E2E', '#8B5BD9', '#22A8A8'];

  for (let i = 0; i < pieces; i++) {
    const span = document.createElement('span');
    const size = 6 + Math.random() * 8;
    const dx = (Math.random() - 0.5) * spread * 2;
    span.style.cssText = [
      'position: absolute',
      `left: ${origin.x}px`,
      `top: ${origin.y}px`,
      `width: ${size}px`,
      `height: ${size * 0.4}px`,
      `background: ${colors[i % colors.length]}`,
      'border-radius: 2px',
      `animation: confettiFall ${(options.durationMs ?? 2400) / 1000}s ease-in forwards`,
      `animation-delay: ${Math.random() * 0.6}s`,
      `--cx: ${dx}px`,
    ].join(';');
    layer.appendChild(span);
  }

  document.body.appendChild(layer);
  // Garbage-collect after the longest animation chain has wrapped up.
  setTimeout(
    () => {
      if (layer.parentNode) layer.parentNode.removeChild(layer);
    },
    (options.durationMs ?? 2400) + 1200,
  );
}
