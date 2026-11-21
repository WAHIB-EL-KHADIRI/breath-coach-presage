import { useEffect, useState } from 'react';
import { useSelector } from '../shared/store';
import type { AppState } from './state';
import { store } from './runtime';

/** Select a slice of app state. Selectors must return primitives or stable references. */
export function useApp<S>(selector: (s: AppState) => S): S {
  return useSelector(store, selector);
}

/** Re-renders the calling component on an interval. Used only by small leaf components. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function useReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}
