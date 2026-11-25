'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

function getSessionId() {
  try {
    let sid = localStorage.getItem('nphi_sid');
    if (!sid) {
      sid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem('nphi_sid', sid);
    }
    return sid;
  } catch {
    return 'anon';
  }
}

export default function AnalyticsTracker() {
  const pathname = usePathname();
  const lastPath = useRef(null);

  useEffect(() => {
    if (!pathname || pathname === lastPath.current) return;
    lastPath.current = pathname;

    const payload = JSON.stringify({
      path: pathname,
      sid: getSessionId(),
      referrer: document.referrer || '',
    });

    const url = '/api/analytics/track';
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
    } else {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  }, [pathname]);

  return null;
}
