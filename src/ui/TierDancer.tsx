import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { danceFor, portraitFor, type Gender } from '../lib/levelTier';

// ---------------------------------------------------------------------------
//  TIER DANCER
// ---------------------------------------------------------------------------
//
// Renders the tier portrait as a static image, with a looping dance video
// overlaid on top that activates on hover (desktop) or tap (mobile). When
// the dance is idle the video is paused, `display: none`-ish, and not even
// fetched (preload="none"), so the only thing on the critical path is the
// PNG that we already load for every avatar. The video is only requested
// once the user signals interest.
//
// Three modes:
//   - `interactive` (default) — hover/tap to play, returns to still after.
//                                Looped on hover-capable devices; one-shot
//                                on touch (so tapping doesn't dance forever).
//   - `celebration`           — always playing + looping, no still fallback.
//                                Used on the level-up takeover.
//   - `auto`                  — autoplay once on mount, then stop. Used as
//                                a subtle "this is the current tier" tell
//                                on hero portraits.
//
// All modes respect `prefers-reduced-motion: reduce`. When reduced, the
// component degrades to a plain `<img>` (no fetch, no animation) and even
// the celebration overlay just shows the still portrait.

type Mode = 'interactive' | 'celebration' | 'auto';

type TierDancerProps = {
  level: number;
  gender?: Gender;
  /** Accessible label — what's in the portrait. */
  alt: string;
  mode?: Mode;
  className?: string;
  style?: CSSProperties;
  /** Force-disable the dance even on hover. Useful when an ancestor wants
   *  to "freeze" the figure (e.g. while a modal animates in). */
  paused?: boolean;
};

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
 * True on devices with a real hover (mouse, trackpad). False on pure-touch
 * devices. Used to pick the dance behaviour: loop-while-hovered vs.
 * tap-and-play-once.
 */
function useHoverCapable(): boolean {
  return useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return true;
    return window.matchMedia('(hover: hover)').matches;
  }, []);
}

export function TierDancer({
  level,
  gender = 'm',
  alt,
  mode = 'interactive',
  className = '',
  style,
  paused = false,
}: TierDancerProps) {
  const portrait = portraitFor(level, gender);
  const dance = danceFor(level, gender);
  const reduceMotion = usePrefersReducedMotion();
  const hoverCapable = useHoverCapable();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // True whenever the video should be visible + playing. For celebration
  // mode this is just "always" (modulo reduced-motion). For auto mode it
  // flips to true on mount and falls back to false once the clip ends.
  const [playing, setPlaying] = useState<boolean>(
    mode === 'celebration' || mode === 'auto',
  );

  // True once the video has loaded enough to render its first frame —
  // we only crossfade the <video> in when this is set, so we never see
  // an ugly black "loading" flash before the figure appears.
  const [ready, setReady] = useState(false);

  // True if the browser couldn't load/decode the dance clip (e.g. an
  // older browser without VP9 alpha, a network blip, or some exotic
  // WebView). When set, we permanently fall back to the still portrait
  // and stop trying — better a frozen hero than a broken square.
  const [failed, setFailed] = useState(false);

  // If the underlying member changes (level-up, switching dashboards) the
  // video element gets a new src — reset the loading + failure flags so
  // the new clip gets a fair shot at loading.
  useEffect(() => {
    setReady(false);
    setFailed(false);
  }, [dance]);

  // Want to play if (mode requires it) AND (not paused) AND (motion is
  // OK) AND (video hasn't failed to load).
  const wantPlay = !paused && !reduceMotion && playing && !failed;

  // Stop dancing when scrolled off-screen so we don't waste decode cycles
  // on a six-portrait ladder where five are invisible at any moment. Only
  // applied to interactive/auto modes — celebration is a full-screen
  // takeover and is always on-screen by construction.
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    if (mode === 'celebration') return;
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) setOnScreen(e.isIntersecting);
      },
      { threshold: 0.01 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [mode]);

  // Drive the <video> imperatively. React's declarative play/pause via
  // the `autoPlay` attribute is too coarse (it doesn't re-trigger on
  // state changes), so we own play/pause ourselves.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (wantPlay && onScreen) {
      // Browsers throw an unhandled-rejection if a paused play() is
      // racing a load; swallow it — the next state change will retry.
      v.play().catch(() => undefined);
    } else {
      v.pause();
      if (mode === 'interactive') {
        // Snap back to the first frame so the next hover starts clean.
        try {
          v.currentTime = 0;
        } catch {
          /* some browsers refuse seek before metadata; harmless. */
        }
      }
    }
  }, [wantPlay, onScreen, mode, ready]);

  // For `auto` mode, fall back to the still after the first loop. Lets us
  // do "wave once when the dashboard mounts" without a perpetual disco.
  const handleEnded = useCallback(() => {
    if (mode === 'interactive' && !hoverCapable) {
      // Touch tap: played through, now go back to still.
      setPlaying(false);
    } else if (mode === 'auto') {
      setPlaying(false);
    }
  }, [mode, hoverCapable]);

  const startDance = useCallback(() => {
    if (mode !== 'interactive' || reduceMotion) return;
    setPlaying(true);
  }, [mode, reduceMotion]);

  const stopDance = useCallback(() => {
    if (mode !== 'interactive') return;
    // Only stop on pointerleave if we're on a real hover device. On touch,
    // pointerleave fires immediately after the tap, but we want the video
    // to play through and stop on its own `ended` event.
    if (!hoverCapable) return;
    setPlaying(false);
  }, [mode, hoverCapable]);

  // Reduced-motion users get the still portrait, end of story.
  if (reduceMotion && mode !== 'celebration') {
    return (
      <img
        ref={(node) => {
          // Keep the container ref API consistent so callers can measure.
          if (node) containerRef.current = node.parentElement as HTMLDivElement | null;
        }}
        src={portrait}
        alt={alt}
        draggable={false}
        className={className}
        style={style}
      />
    );
  }

  // Celebration mode under reduced-motion: still the still image, just
  // shown big. The level-up moment is already framed by the rest of the
  // overlay (rings, ribbon, headline) so it doesn't *need* the dance.
  if (reduceMotion && mode === 'celebration') {
    return (
      <img
        src={portrait}
        alt={alt}
        draggable={false}
        className={className}
        style={style}
      />
    );
  }

  const isCelebration = mode === 'celebration';

  return (
    <div
      ref={containerRef}
      // Base class is just `relative` — consumers pass through their own
      // display utility (`inline-block`, `block`, `flex`, etc.) so the
      // dancer can slot into any layout without fighting it. The inner
      // <img> below drives the intrinsic size when the container is
      // inline-block-like.
      className={`relative ${className}`}
      style={style}
      onPointerEnter={startDance}
      onPointerLeave={stopDance}
      onFocus={startDance}
      onBlur={stopDance}
      // Touch tap fires `click` after pointerup; treat it as "start".
      // pointerenter typically already fired, but tapping a still after
      // it returned to idle needs this fallback.
      onClick={startDance}
      // Make the figure keyboard-discoverable for accessibility — only
      // interactive mode needs focus, the others are decorative.
      tabIndex={mode === 'interactive' ? 0 : undefined}
      role={mode === 'interactive' ? 'button' : undefined}
      aria-label={mode === 'interactive' ? `Tap to see ${alt} dance` : undefined}
    >
      {/* Still portrait — always rendered. In interactive mode it stays
          visible underneath the video so we never flash to empty while
          the video is buffering, and it's what's visible when paused.
          This <img> is also what drives the *intrinsic size* of the
          dancer — the outer div is `inline-block` so it shrink-wraps to
          whatever the still image renders at, and the video below
          stretches over it via `absolute inset-0`. That keeps consumers
          using h/w utilities (e.g. `h-full w-auto`) without anything
          breaking. */}
      <img
        src={portrait}
        alt={alt}
        draggable={false}
        className="block h-full w-auto select-none"
        style={{
          // When the dance is in-frame and ready, fade the still out a
          // touch so the dancer takes over without a hard cut.
          opacity: wantPlay && ready && !isCelebration ? 0 : 1,
          transition: 'opacity 160ms ease-out',
        }}
      />
      {/* Dance video, layered absolutely on top. For interactive mode it
          fades in when ready and playing; for celebration it's always on. */}
      <video
        ref={videoRef}
        src={dance}
        muted
        playsInline
        // Loop while a desktop user is hovering and during celebrations;
        // for touch (tap-to-play) we want one-shot then back to still.
        loop={isCelebration || (mode === 'interactive' && hoverCapable) || false}
        // Don't fetch bytes until the user signals interest (or it's a
        // celebration / auto mode where we want it immediately).
        preload={
          isCelebration || mode === 'auto' || playing ? 'auto' : 'none'
        }
        // autoplay attribute is unreliable when the src/loop changes; we
        // drive play/pause from the effect above. Setting `autoPlay`
        // here as well covers the celebration first-paint case on some
        // browsers (notably iOS WKWebView) that ignore `play()` if it
        // wasn't blessed by an attribute.
        autoPlay={isCelebration}
        onCanPlay={() => setReady(true)}
        onLoadedData={() => setReady(true)}
        onEnded={handleEnded}
        onError={() => setFailed(true)}
        aria-hidden={!isCelebration}
        draggable={false}
        className="pointer-events-none absolute inset-0 h-full w-full select-none"
        style={{
          opacity: isCelebration ? 1 : wantPlay && ready ? 1 : 0,
          transition: 'opacity 200ms ease-out',
          // The portrait sits centred and aspect-preserved inside the
          // box; the video — at 288xN with alpha — should match.
          objectFit: 'contain',
          objectPosition: 'center bottom',
        }}
      />
    </div>
  );
}
