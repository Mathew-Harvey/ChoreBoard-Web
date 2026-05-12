import { useEffect, useRef, useState } from 'react';

/**
 * Easing curve borrowed from the in-app feel — fast start, settles to a
 * slow finish. The `t` argument is normalised [0..1].
 */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

/**
 * Animates a numeric value from its previous render to the new value over
 * `duration` ms. Respects `prefers-reduced-motion`. Pass `format` to render
 * dollars / percentages / whatever.
 *
 *     <AnimatedNumber value={cents} format={(n) => money(n)} />
 */
export function AnimatedNumber({
  value,
  format,
  duration = 520,
  className,
  as: As = 'span',
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
  as?: 'span' | 'div';
}) {
  const reduced = usePrefersReducedMotion();
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (display === value) return;
    if (reduced) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }
    fromRef.current = display;
    startRef.current = null;
    const step = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const t = Math.min(1, elapsed / duration);
      const eased = easeOutCubic(t);
      const next = fromRef.current + (value - fromRef.current) * eased;
      setDisplay(t >= 1 ? value : next);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // We intentionally do not depend on `display` here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration, reduced]);

  // `format` defaults to integer rounding so animation looks crisp on cents.
  const out = format ? format(display) : Math.round(display).toLocaleString();
  return <As className={className}>{out}</As>;
}
