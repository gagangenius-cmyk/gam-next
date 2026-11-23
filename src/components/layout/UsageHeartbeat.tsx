'use client';

import { useEffect } from 'react';

const TICK_MS = 30_000;
const IDLE_AFTER_MS = 5 * 60_000;

// Reports active CRM time: counts only while the tab is visible and the person has used the mouse / keyboard in the
// last 5 minutes. Sends the accumulated seconds in small batches.
export default function UsageHeartbeat() {
  useEffect(() => {
    let lastActivity = Date.now();
    let pending = 0;
    const onActivity = () => { lastActivity = Date.now(); };
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    const flush = () => {
      if (pending < 1) return;
      const seconds = pending;
      pending = 0;
      fetch('/api/usage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seconds }), keepalive: true }).catch(() => { pending += seconds; });
    };
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && Date.now() - lastActivity < IDLE_AFTER_MS) pending += TICK_MS / 1000;
      if (pending >= 60) flush();
    }, TICK_MS);
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);

    return () => {
      clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, []);
  return null;
}
