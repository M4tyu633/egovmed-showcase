import { useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import Wordmark from '../components/Wordmark.jsx';


// Plays on every app load, before the sign-in screen — a deliberate brand moment rather than a
// one-time welcome, so it is not persisted anywhere and there is nothing to reset.
export function shouldShowSplash() {
  return true;
}

const prefersReducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Brand moment on every load: the eGovMed wordmark fading in over the app before it hands over.
 *
 * Rendered as an overlay inside the device frame rather than as a routed screen, so it never
 * competes with the resume effect for `screen` — a splash that set screen: 'signin' on finish
 * would stomp the 'home' a restored session had just navigated to.
 */
export default function Splash({ c, onDone }) {
  const ref = useRef(null);
  // Read once on mount: the media query is about how this visitor wants the app to behave, and
  // re-reading it mid-animation would only produce a half-played timeline.
  const [reduced] = useState(prefersReducedMotion);

  useGSAP(() => {
    let done = false;
    const finish = () => { if (done) return; done = true; onDone(); };

    // GSAP runs on requestAnimationFrame, which a tab that never composites — opened in the
    // background, embedded in a hidden frame — never fires. onComplete would then never arrive
    // and the app would sit behind the splash forever. A wall-clock failsafe well past the
    // timeline's own length means the welcome can stall but can never trap.
    const failsafe = window.setTimeout(finish, 2500);

    if (reduced) {
      // No tween at all. The mark is simply present, held just long enough to be read, so the
      // brand moment survives without anything moving.
      gsap.set('[data-splash]', { autoAlpha: 1 });
      gsap.delayedCall(0.5, finish);
    } else {
      gsap.timeline({ onComplete: finish })
        .fromTo('[data-splash-mark]', { autoAlpha: 0, scale: 0.86, y: 10 }, { autoAlpha: 1, scale: 1, y: 0, duration: 0.7, ease: 'power3.out' })
        .fromTo('[data-splash-tag]', { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.42, ease: 'power2.out' }, '-=0.24')
        .to({}, { duration: 0.4 }); // a beat to read it before the app takes over
    }

    return () => window.clearTimeout(failsafe);
  }, { scope: ref });

  return (
    <div
      ref={ref}
      role="status"
      aria-label={c.splashLoading}
      style={{
        position: 'absolute', inset: 0, zIndex: 60, background: 'var(--canvas)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24,
      }}
    >
      {/* visibility: hidden until GSAP's autoAlpha reveals it — useGSAP runs before paint, so
          this is what keeps the un-animated first frame from flashing on screen. */}
      <div data-splash data-splash-mark style={{ visibility: 'hidden' }}>
        <Wordmark height={46} />
      </div>
      <p data-splash data-splash-tag className="sub" style={{ visibility: 'hidden', margin: 0, textAlign: 'center', maxWidth: 280 }}>
        {c.appTagline}
      </p>
    </div>
  );
}
