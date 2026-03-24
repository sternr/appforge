import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { getAppCode, getApp } from '../db/database.js';

/**
 * StandalonePage renders a generated app fullscreen with NO AppForge chrome.
 * Shows a floating "Add to Home Screen" banner that:
 * - On Android Chrome: intercepts beforeinstallprompt to trigger native install
 * - On iOS Safari: shows instructions to use Share → Add to Home Screen
 * - On Desktop: intercepts beforeinstallprompt or shows instructions
 *
 * Route: #/standalone/:appId
 */
export default function StandalonePage() {
  const { appId } = useParams<{ appId: string }>();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const blobUrlRef = useRef<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [appName, setAppName] = useState('App');
  const [appIcon, setAppIcon] = useState('');
  const [error, setError] = useState('');
  const [showBanner, setShowBanner] = useState(true);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // Capture the beforeinstallprompt event (Android Chrome / Desktop Chrome & Edge)
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    if (!appId) return;

    (async () => {
      try {
        const appData = await getApp(appId);
        if (appData) {
          setAppName(appData.name);
          setAppIcon(appData.icon || '');
          document.title = appData.name;
          setMeta('apple-mobile-web-app-capable', 'yes');
          setMeta('apple-mobile-web-app-status-bar-style', 'black-translucent');
          setMeta('apple-mobile-web-app-title', appData.name);
          setMeta('theme-color', '#0f172a');
          updateManifest(appData.name, appData.icon, appData.prompt);
        }

        const code = await getAppCode(appId);
        if (!code?.html) {
          setError('App not found or has no code');
          return;
        }

        const blob = new Blob([code.html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        setBlobUrl(url);
      } catch {
        setError('Failed to load app');
      }
    })();

    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, [appId]);

  const handleNativeInstall = useCallback(async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      if (result.outcome === 'accepted') {
        setShowBanner(false);
      }
      setDeferredPrompt(null);
    }
  }, [deferredPrompt]);

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#0f172a', color: '#94a3b8', fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: '2rem' }}>
        <div>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!blobUrl) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#0f172a' }}>
        <div style={{ width: '2rem', height: '2rem', border: '2px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true;

  return (
    <>
      <iframe
        ref={iframeRef}
        src={blobUrl}
        sandbox="allow-scripts allow-forms allow-modals"
        style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', border: 'none', margin: 0, padding: 0 }}
        title={appName}
      />

      {/* Install banner — shown unless already in standalone mode or dismissed */}
      {showBanner && !isStandalone && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
          background: 'linear-gradient(to top, rgba(15,23,42,0.98), rgba(15,23,42,0.95))',
          backdropFilter: 'blur(12px)',
          borderTop: '1px solid rgba(99,102,241,0.3)',
          padding: '16px 20px',
          paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          animation: 'slideUp 0.3s ease-out',
        }}>
          <style>{`
            @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
          `}</style>

          {/* Close button */}
          <button
            onClick={() => setShowBanner(false)}
            style={{
              position: 'absolute', top: '8px', right: '12px',
              background: 'none', border: 'none', color: '#94a3b8', fontSize: '20px',
              cursor: 'pointer', padding: '4px',
            }}
          >
            ✕
          </button>

          {/* App info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            {appIcon && <span style={{ fontSize: '32px' }}>{appIcon}</span>}
            <div>
              <div style={{ color: '#f8fafc', fontWeight: 600, fontSize: '16px' }}>
                Install {appName}
              </div>
              <div style={{ color: '#94a3b8', fontSize: '13px' }}>
                Add to your home screen for quick access
              </div>
            </div>
          </div>

          {/* Install action */}
          {deferredPrompt ? (
            /* Android Chrome / Desktop — native install prompt available */
            <button
              onClick={handleNativeInstall}
              style={{
                width: '100%', padding: '12px', borderRadius: '12px',
                background: '#6366f1', color: 'white', border: 'none',
                fontSize: '15px', fontWeight: 600, cursor: 'pointer',
              }}
            >
              Install App
            </button>
          ) : isIOS ? (
            /* iOS Safari — show instructions */
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#e2e8f0', fontSize: '14px' }}>
              <span>Tap</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', background: 'rgba(99,102,241,0.2)', borderRadius: '6px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
                  <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" strokeLinecap="round" strokeLinejoin="round"/>
                  <polyline points="16 6 12 2 8 6" strokeLinecap="round" strokeLinejoin="round"/>
                  <line x1="12" y1="2" x2="12" y2="15" strokeLinecap="round"/>
                </svg>
              </span>
              <span>then <strong>"Add to Home Screen"</strong></span>
            </div>
          ) : isAndroid ? (
            /* Android without beforeinstallprompt — show instructions */
            <div style={{ color: '#e2e8f0', fontSize: '14px' }}>
              Tap <strong>⋮</strong> (menu) then <strong>"Add to Home screen"</strong>
            </div>
          ) : (
            /* Desktop fallback */
            <div style={{ color: '#e2e8f0', fontSize: '14px' }}>
              Use your browser menu to <strong>"Install app"</strong> or <strong>"Create shortcut"</strong>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function setMeta(name: string, content: string) {
  let meta = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = name;
    document.head.appendChild(meta);
  }
  meta.content = content;
}

function emojiToIconUrl(emoji: string, size: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  // Dark background for contrast
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, size * 0.2);
  ctx.fill();
  // Draw emoji centered
  ctx.font = `${size * 0.6}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, size / 2, size / 2 + size * 0.05);
  return canvas.toDataURL('image/png');
}

function updateManifest(name: string, icon: string, description: string) {
  const emoji = icon || '📱';
  const icon192 = emojiToIconUrl(emoji, 192);
  const icon512 = emojiToIconUrl(emoji, 512);

  const manifest = {
    name,
    short_name: name.slice(0, 12),
    description: description.slice(0, 100),
    start_url: window.location.href,
    display: 'standalone',
    background_color: '#0f172a',
    theme_color: '#6366f1',
    icons: [
      { src: icon192, sizes: '192x192', type: 'image/png' },
      { src: icon512, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  };
  const manifestJson = JSON.stringify(manifest);
  const manifestBlob = new Blob([manifestJson], { type: 'application/manifest+json' });
  const manifestUrl = URL.createObjectURL(manifestBlob);
  const existing = document.querySelector('link[rel="manifest"]');
  if (existing) existing.remove();
  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = manifestUrl;
  document.head.appendChild(link);

  // Also set apple-touch-icon for iOS
  let appleTouchIcon = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null;
  if (!appleTouchIcon) {
    appleTouchIcon = document.createElement('link');
    appleTouchIcon.rel = 'apple-touch-icon';
    document.head.appendChild(appleTouchIcon);
  }
  appleTouchIcon.href = icon192;
}
