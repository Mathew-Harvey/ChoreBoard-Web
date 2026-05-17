import { useEffect } from 'react';

/**
 * Chunky 4-digit PIN pad shared by every surface that takes a kid PIN —
 * the kid sign-in screen, the onboarding wizard's "Add a kid" step, the
 * AdminFamily kid editor when a parent resets a PIN.
 *
 * Visual contract is the same one the original `KidPinScreen` shipped:
 *   • Four 14×14/16×16 dots show the entered digits (popping in on entry).
 *   • A 3×4 grid of digit buttons (1-9, clear, 0, ←) with `ring-2 ring-ink-900`
 *     and `shadow-paper-sm`, sized 18-20% of viewport on tablet.
 *   • `onComplete(pin)` fires the moment the user enters the 4th digit so
 *     the caller doesn't need a separate "Continue" button. The caller can
 *     reset by setting `value` back to ''.
 *
 * The component is presentational only: it does not call any API, it does
 * not own any timers, and it does not call `onComplete` more than once for
 * a given filled-in 4-character `value`.
 */
export function PinPad({
  value,
  onChange,
  onComplete,
  digitClassName,
  className = '',
}: {
  /** Current entered PIN; the parent owns this state. */
  value: string;
  /** Called whenever a digit, clear, or backspace changes the PIN. */
  onChange: (next: string) => void;
  /** Fires once when `value` first becomes 4 digits long. */
  onComplete?: (pin: string) => void;
  /** Optional override for the digit-button colour palette (e.g. on a dark surface). */
  digitClassName?: string;
  className?: string;
}) {
  useEffect(() => {
    if (value.length === 4 && onComplete) onComplete(value);
    // We intentionally do NOT depend on `onComplete` so a parent component
    // re-creating the callback on every render doesn't refire completion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const digit = (n: number) => () => {
    if (value.length < 4) onChange(value + String(n));
  };
  const clear = () => onChange('');
  const back = () => onChange(value.slice(0, -1));

  const buttonClass =
    digitClassName ??
    'aspect-square rounded-2xl bg-paper text-2xl font-bold text-ink-900 ring-2 ring-ink-900 shadow-paper-sm transition active:translate-y-px hover:bg-cream-50 sm:text-3xl';
  const utilClass =
    'aspect-square rounded-2xl bg-paper text-sm font-semibold text-ink-700 ring-2 ring-ink-900 shadow-paper-sm transition active:translate-y-px hover:bg-cream-50';

  return (
    <div className={`flex flex-col items-center gap-6 sm:gap-8 ${className}`}>
      <div className="flex justify-center gap-3 sm:gap-4">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`grid h-14 w-14 place-items-center rounded-2xl text-3xl font-bold ring-2 ring-ink-900 transition-transform sm:h-16 sm:w-16 sm:text-4xl ${
              value[i]
                ? 'animate-pop bg-ink-900 text-cream-50'
                : 'bg-paper text-ink-300'
            }`}
            aria-label={value[i] ? 'digit entered' : 'empty digit'}
          >
            {value[i] ? '•' : ''}
          </span>
        ))}
      </div>

      <div className="mx-auto grid w-full max-w-[20rem] grid-cols-3 gap-3 sm:max-w-[22rem] sm:gap-4">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button key={n} type="button" onClick={digit(n)} className={buttonClass}>
            {n}
          </button>
        ))}
        <button type="button" onClick={clear} className={utilClass}>
          clear
        </button>
        <button type="button" onClick={digit(0)} className={buttonClass}>
          0
        </button>
        <button type="button" onClick={back} className={utilClass}>
          ←
        </button>
      </div>
    </div>
  );
}
