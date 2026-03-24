import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getAppCode, getApp } from '../db/database.js';
import type { AppMetadata } from '../types/index.js';

export default function AppRunnerPage() {
  const navigate = useNavigate();
  const { appId } = useParams<{ appId: string }>();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const blobUrlRef = useRef<string | null>(null);
  const [app, setApp] = useState<AppMetadata | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!appId) return;

    (async () => {
      try {
        const appData = await getApp(appId);
        if (!appData) {
          setError('App not found');
          setLoading(false);
          return;
        }
        setApp(appData);

        const code = await getAppCode(appId);
        if (!code?.html) {
          setError('No code found for this app');
          setLoading(false);
          return;
        }

        const blob = new Blob([code.html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        setBlobUrl(url);
        setLoading(false);
      } catch {
        setError('Failed to load app');
        setLoading(false);
      }
    })();

    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, [appId]);

  return (
    <div className="flex flex-col h-full bg-black">
      {/* Header */}
      <div className="flex items-center px-3 py-2 bg-surface-light/95 backdrop-blur-lg border-b border-surface-lighter safe-top">
        <button onClick={() => navigate(-1)} className="text-text-muted p-2 -ml-1">
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex items-center gap-2 ml-1 min-w-0">
          {app?.icon && <span className="text-lg">{app.icon}</span>}
          <span className="text-sm font-medium truncate">{app?.name || 'App'}</span>
        </div>
      </div>

      {/* App iframe */}
      <div className="flex-1 relative">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-center px-6">
            <div>
              <div className="text-4xl mb-3">⚠️</div>
              <p className="text-text-muted">{error}</p>
              <button
                onClick={() => navigate('/')}
                className="mt-4 text-primary text-sm"
              >
                Back to Home
              </button>
            </div>
          </div>
        ) : blobUrl ? (
          <iframe
            ref={iframeRef}
            src={blobUrl}
            sandbox="allow-scripts allow-forms allow-modals"
            className="w-full h-full border-0"
            title={app?.name || 'App'}
          />
        ) : null}
      </div>
    </div>
  );
}
