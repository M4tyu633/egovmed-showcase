import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

// Pop-in for success checks: scale 0 → 1 with back-out easing (matches the prototype's pop()).
export function usePop(ref) {
  useGSAP(() => {
    if (ref.current) gsap.fromTo(ref.current, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: 'back.out(2.4)' });
  }, { scope: ref });
}

export function Pop({ children, className, style }) {
  const ref = useRef(null);
  usePop(ref);
  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}
