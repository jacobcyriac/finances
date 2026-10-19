import { useEffect, useRef, useState, type CSSProperties } from 'react';

export function TypingText({ text }: { text: string }) {
  return <span className="typing-text" aria-label={text}>
    {[...text].map((character, index) => <span className="typing-char" aria-hidden="true" key={`${index}-${character}`} style={{ '--typing-delay': `${Math.min(index * 14, 350)}ms` } as CSSProperties}>{character === ' ' ? '\u00a0' : character}</span>)}
  </span>;
}

function parseDisplayedNumber(value: string) {
  const match = value.match(/-?[\d][\d,]*(?:\.\d+)?/);
  if (!match || match.index === undefined) return null;
  const digits = match[0].split('.')[1]?.length ?? 0;
  return {
    number: Number(match[0].replaceAll(',', '')),
    prefix: value.slice(0, match.index),
    suffix: value.slice(match.index + match[0].length),
    digits,
  };
}

export function TickerNumber({ value }: { value: string }) {
  const target = parseDisplayedNumber(value);
  const [displayNumber, setDisplayNumber] = useState(target?.number ?? 0);
  const currentNumber = useRef(target?.number ?? 0);

  useEffect(() => {
    if (!target || currentNumber.current === target.number) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      currentNumber.current = target.number;
      setDisplayNumber(target.number);
      return;
    }
    const from = currentNumber.current;
    const startedAt = performance.now();
    const duration = 480;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - (1 - progress) ** 3;
      const next = from + (target.number - from) * eased;
      currentNumber.current = next;
      setDisplayNumber(progress === 1 ? target.number : next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target?.number]);

  if (!target) return <span>{value}</span>;
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: target.digits,
    maximumFractionDigits: target.digits,
  }).format(displayNumber);
  return <span className="ticker-number" aria-label={value}>
    <span aria-hidden="true">{target.prefix}{formatted}{target.suffix}</span>
  </span>;
}
