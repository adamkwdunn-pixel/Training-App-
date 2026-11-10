import { useLayoutEffect, useRef } from 'react';

/**
 * A textarea that grows to fit what's typed, so nothing is hidden. Past `maxHeight` it scrolls with a
 * visible scroll bar instead of growing forever.
 */
export default function AutoTextarea({ minRows = 2, maxHeight = '60vh', className = '', style, ...props }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [props.value]);
  return <textarea ref={ref} rows={minRows} className={`auto-textarea ${className}`} style={{ maxHeight, ...style }} {...props} />;
}
