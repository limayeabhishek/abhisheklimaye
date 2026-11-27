import { useCallback, useEffect, useRef, useState } from 'react';

function formatClockTime(epochMs) {
  const d = new Date(epochMs);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function useServerTime() {
  const offsetRef = useRef(0);
  const bestRttRef = useRef(Infinity);
  const [offsetMs, setOffsetMs] = useState(0);
  const [rttMs, setRttMs] = useState(null);
  const [isSynced, setIsSynced] = useState(false);
  const [serverClockStr, setServerClockStr] = useState(() => formatClockTime(Date.now()));

  const getServerNow = useCallback(() => Date.now() + offsetRef.current, []);

  const syncWithServer = useCallback(async () => {
    bestRttRef.current = Infinity;

    for (let i = 0; i < 4; i++) {
      try {
        const t0 = performance.now();
        const wallBefore = Date.now();
        const res = await fetch('/api/time', { cache: 'no-store' });
        const t1 = performance.now();
        const wallAfter = Date.now();

        if (!res.ok) continue;
        const data = await res.json();
        const serverNow = Number(data?.serverNow);
        if (!Number.isFinite(serverNow)) continue;

        const rtt = Math.max(0, t1 - t0);
        const localMidpoint = (wallBefore + wallAfter) / 2;
        const computedOffset = serverNow - localMidpoint;

        if (rtt <= bestRttRef.current) {
          bestRttRef.current = rtt;
          offsetRef.current = computedOffset;
          setOffsetMs(Math.round(computedOffset));
          setRttMs(Math.round(rtt));
          setIsSynced(true);
        }
      } catch {
        // Ignore transient network errors during sync probes
      }

      if (i < 3) {
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
    }
  }, []);

  useEffect(() => {
    const initialTimer = setTimeout(() => {
      syncWithServer();
    }, 0);
    const recalTimer = setInterval(() => {
      syncWithServer();
    }, 30000);
    const tickTimer = setInterval(() => {
      setServerClockStr(formatClockTime(Date.now() + offsetRef.current));
    }, 250);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(recalTimer);
      clearInterval(tickTimer);
    };
  }, [syncWithServer]);

  return {
    getServerNow,
    offsetMs,
    rttMs,
    isSynced,
    serverClockStr,
    resyncClock: syncWithServer,
  };
}
