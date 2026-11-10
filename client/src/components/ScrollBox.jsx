import { useEffect, useRef, useState } from 'react';

/**
 * Shows text in full; if it's taller than `maxHeight`, it scrolls inside the box with its own always-visible
 * scroll bar (phones hide the normal one) and a "scroll for more" cue until the end has been reached.
 */
export default function ScrollBox({ children, maxHeight = '45vh', className = '' }) {
  const ref = useRef(null);
  const [bar, setBar] = useState(null); // { top, height } as % of the track, or null when everything fits
  const [atEnd, setAtEnd] = useState(true);

  const measure = () => {
    const el = ref.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight + 1) {
      setBar(null);
      setAtEnd(true);
      return;
    }
    const height = Math.max(12, (clientHeight / scrollHeight) * 100);
    setBar({ height, top: (scrollTop / (scrollHeight - clientHeight)) * (100 - height) });
    setAtEnd(scrollTop + clientHeight >= scrollHeight - 4);
  };
  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [children]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`scroll-box ${bar ? 'scrolls' : ''} ${className}`}>
      <div ref={ref} className="scroll-box-body" style={{ maxHeight }} onScroll={measure} tabIndex={bar ? 0 : undefined}>
        {children}
      </div>
      {bar && (
        <div className="scroll-box-track" aria-hidden="true">
          <div className="scroll-box-thumb" style={{ top: `${bar.top}%`, height: `${bar.height}%` }} />
        </div>
      )}
      {bar && !atEnd && <div className="scroll-box-more tiny" aria-hidden="true">Scroll for more ↓</div>}
    </div>
  );
}
