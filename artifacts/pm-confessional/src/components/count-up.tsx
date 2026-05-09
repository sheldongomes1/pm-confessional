import { useEffect, useRef, useState } from "react";

interface CountUpProps {
  value: number;
  duration?: number;
  decimals?: number;
  className?: string;
}

export function CountUp({
  value: rawValue,
  duration = 1100,
  decimals = 0,
  className,
}: CountUpProps) {
  // Coerce to a safe number — avoids stuck-at-0 if a parent passes
  // undefined / null / NaN before its data settles.
  const value = Number.isFinite(rawValue) ? Number(rawValue) : 0;
  const [display, setDisplay] = useState(value);
  const startTimeRef = useRef<number | null>(null);
  const fromRef = useRef(0);
  const previousValueRef = useRef(value);

  useEffect(() => {
    // Don't try to animate non-finite or negative-delta nonsense.
    if (!Number.isFinite(value)) {
      setDisplay(value);
      return;
    }
    fromRef.current = previousValueRef.current;
    previousValueRef.current = value;
    startTimeRef.current = null;
    let frame = 0;

    const tick = (now: number) => {
      if (startTimeRef.current === null) startTimeRef.current = now;
      const elapsed = now - startTimeRef.current;
      const t = Math.min(1, elapsed / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      const next = fromRef.current + (value - fromRef.current) * eased;
      setDisplay(next);
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        setDisplay(value);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  const formatted =
    decimals > 0
      ? display.toFixed(decimals)
      : Math.round(display).toLocaleString();

  return <span className={className}>{formatted}</span>;
}
