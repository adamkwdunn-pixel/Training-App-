// Background checks while the app is open: unread notifications and whether a new version is live.
import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

/* global __BUILD_ID__ */
const BUILD_ID = typeof __BUILD_ID__ === 'undefined' ? 'dev' : __BUILD_ID__;
const EVERY = 60_000;

export function useLive(signedIn) {
  const [unread, setUnread] = useState(0);
  const [updateReady, setUpdateReady] = useState(false);

  const check = useCallback(async () => {
    if (document.visibilityState === 'hidden') return;
    try {
      const { version } = await fetch('/api/version', { cache: 'no-store' }).then((r) => r.json());
      if (version !== 'dev' && BUILD_ID !== 'dev' && version !== BUILD_ID) setUpdateReady(true);
    } catch {
      /* offline or mid-deploy: try again next time */
    }
    if (!signedIn) return;
    try {
      const { count } = await api('/notifications/unread');
      setUnread(count);
      if (navigator.setAppBadge) (count ? navigator.setAppBadge(count) : navigator.clearAppBadge()).catch(() => {});
    } catch {
      /* ignore */
    }
  }, [signedIn]);

  useEffect(() => {
    check();
    const t = setInterval(check, EVERY);
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [check]);

  return { unread, refresh: check, updateReady };
}

/** Load the new version: make sure the service worker is current, then reload. */
export async function applyUpdate() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
  } catch {
    /* ignore */
  }
  window.location.reload();
}
