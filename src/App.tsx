/**
 * The site: a butterfly field that covers the page, and the illustrated build
 * report underneath it.
 *
 * The field itself lives in src/butterflies, which is self contained and has
 * no idea this site exists. Everything in this file is sequencing: when to
 * hand over, what to fade, and how to put the butterflies back.
 */

import { lazy, Suspense, useEffect, useState } from 'react';

import { ButterflyLoader } from './butterflies/react';
import { setScenesPaused } from './scenePause';

const Masterclass = lazy(() => import('./masterclass/Masterclass'));

// The field is the front door and the walkthrough is the building. Releasing
// the butterflies is what opens it.
//
// The course is a lazy chunk, and the import below is fired on mount rather
// than at render time, so it downloads while the field is still up. That makes
// the loading screen honest: by the time anyone releases it, the thing it was
// covering has actually arrived.
export default function App() {
  const startRevealed = () => window.location.hash.length > 1;

  const [phase, setPhase] = useState<'load' | 'fade' | 'done'>(() =>
    startRevealed() ? 'done' : 'load',
  );
  // Kept mounted once shown, so replaying the field does not throw away scroll
  // position or the state of any figure.
  const [shown, setShown] = useState(startRevealed);
  const [run, setRun] = useState(0);

  useEffect(() => {
    void import('./masterclass/Masterclass');
  }, []);

  // The course's figures each run their own loop. Park them while the field
  // has the frame budget, and stop the page scrolling behind the field.
  useEffect(() => {
    setScenesPaused(phase === 'load');
    document.body.style.overflow = phase === 'load' ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [phase]);

  const replay = () => {
    setRun(r => r + 1);
    setPhase('load');
  };

  return (
    <>
      <div
        style={{
          opacity: phase === 'load' ? 0 : 1,
          transition: 'opacity 1.1s ease 0.1s',
        }}
      >
        {shown && (
          <Suspense fallback={null}>
            <Masterclass onReplay={replay} />
          </Suspense>
        )}
      </div>

      {phase !== 'done' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10,
            background: '#0b0e12',
            opacity: phase === 'fade' ? 0 : 1,
            transition: 'opacity 0.9s ease',
            pointerEvents: phase === 'fade' ? 'none' : 'auto',
          }}
        >
          <ButterflyLoader
            key={run}
            invite="Tap or click anywhere to release"
            onReveal={() => {
              setShown(true);
              setPhase('fade');
              window.setTimeout(() => setPhase('done'), 940);
            }}
          />
        </div>
      )}
    </>
  );
}
