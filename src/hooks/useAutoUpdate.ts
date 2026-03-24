import { useEffect, useRef } from 'react';

/**
 * Auto-update hook: checks for new builds when the user returns to the app.
 *
 * On each visibility change (tab focus, phone unlock, app switch back):
 * 1. Fetches version.json with a cache-busting query param
 * 2. Compares the build hash to the one embedded at build time
 * 3. If different: unregisters the service worker, clears caches, reloads
 *
 * This eliminates the need to manually clear browser caches after deploys.
 */

// Injected at build time by the vite-version-plugin via define
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BUILD_VERSION: string = (import.meta.env as any).VITE_BUILD_VERSION ?? 'dev';

export function useAutoUpdate() {
  const checking = useRef(false);

  useEffect(() => {
    async function checkForUpdate() {
      if (checking.current) return;
      checking.current = true;

      try {
        // Fetch version.json with cache-busting to bypass HTTP cache + SW cache
        const res = await fetch(`./version.json?_=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        });

        if (!res.ok) return;

        const data = await res.json() as { version: string };

        if (data.version && data.version !== BUILD_VERSION && BUILD_VERSION !== 'dev') {
          console.log(`[AutoUpdate] New version detected: ${data.version} (current: ${BUILD_VERSION}). Updating...`);

          // Unregister all service workers
          if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map(r => r.unregister()));
          }

          // Clear all caches
          if ('caches' in window) {
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(name => caches.delete(name)));
          }

          // Reload the page to pick up the new version
          window.location.reload();
        }
      } catch {
        // Network error, offline, etc. — silently ignore
      } finally {
        checking.current = false;
      }
    }

    // Check on visibility change (user returns to tab / unlocks phone)
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        checkForUpdate();
      }
    }

    // Check on focus (covers some edge cases visibility change misses)
    function onFocus() {
      checkForUpdate();
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);

    // Also check on initial load (in case user reloads manually)
    checkForUpdate();

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
    };
  }, []);
}
