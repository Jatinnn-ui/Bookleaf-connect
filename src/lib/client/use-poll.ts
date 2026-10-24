"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Fetch + poll. Guarantees:
 *  - one request in flight at a time (no overlapping polls)
 *  - responses from an older request never overwrite newer state
 *  - pauses while the tab is hidden, refreshes immediately on return
 *  - cleans up on unmount / key change
 */
export function usePoll<T>(key: string | null, fetcher: () => Promise<T>, intervalMs = 5000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  // Key of the last completed load; "loading" is true until the current key has loaded once.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const seq = useRef(0);
  const inFlight = useRef(false);
  const fetcherRef = useRef(fetcher);
  useLayoutEffect(() => {
    fetcherRef.current = fetcher;
  });

  const run = useCallback(async (forKey: string | null, force = false) => {
    if (inFlight.current && !force) return;
    inFlight.current = true;
    const id = ++seq.current;
    try {
      const result = await fetcherRef.current();
      if (id === seq.current) {
        setData(result);
        setError(null);
      }
    } catch (e) {
      if (id === seq.current) setError(e as Error);
    } finally {
      if (id === seq.current) setLoadedKey(forKey);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!key) return;
    run(key, true);
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (!timer && intervalMs > 0) timer = setInterval(() => run(key), intervalMs);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVis = () => {
      if (document.hidden) stop();
      else {
        run(key);
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVis);
    const counter = seq;
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
      counter.current++; // invalidate in-flight responses
    };
  }, [key, intervalMs, run]);

  return { data, error, loading: loadedKey !== key, refresh: () => run(key, true), setData };
}
