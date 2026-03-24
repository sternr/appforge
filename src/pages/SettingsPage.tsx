import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettingsStore } from '../stores/settingsStore.js';
import { useAppStore } from '../stores/appStore.js';
import { db } from '../db/database.js';
import Button from '../components/ui/Button.js';
import { useToast } from '../components/ui/Toast.js';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { apiKey, clearApiKey } = useSettingsStore();
  const { apps } = useAppStore();
  const { toast } = useToast();
  const [confirmClear, setConfirmClear] = useState(false);

  const maskedKey = apiKey
    ? `${apiKey.slice(0, 7)}...${apiKey.slice(-4)}`
    : 'Not set';

  const handleClearAll = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    await db.apps.clear();
    await db.appCode.clear();
    await db.settings.clear();
    await clearApiKey();
    toast('All data cleared', 'info');
    navigate('/onboarding', { replace: true });
  };

  return (
    <div className="flex flex-col h-full safe-top">
      {/* Header */}
      <div className="flex items-center px-4 py-3">
        <button onClick={() => navigate(-1)} className="text-text-muted p-2 -ml-2">
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold ml-2">Settings</h1>
      </div>

      <div className="flex-1 px-5 py-4 space-y-6">
        {/* API Key */}
        <section>
          <h2 className="text-xs font-semibold text-text-dim uppercase tracking-wider mb-3">
            API Key
          </h2>
          <div className="bg-surface-light rounded-xl p-4 border border-surface-lighter">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-text-muted">Anthropic Key</span>
              <span className="text-sm font-mono text-text-dim">{maskedKey}</span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              fullWidth
              onClick={() => {
                clearApiKey();
                navigate('/onboarding', { replace: true });
              }}
            >
              Change API Key
            </Button>
          </div>
        </section>

        {/* Stats */}
        <section>
          <h2 className="text-xs font-semibold text-text-dim uppercase tracking-wider mb-3">
            Statistics
          </h2>
          <div className="bg-surface-light rounded-xl p-4 border border-surface-lighter">
            <div className="flex justify-between py-1">
              <span className="text-sm text-text-muted">Total Apps</span>
              <span className="text-sm font-medium">{apps.length}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-sm text-text-muted">Ready</span>
              <span className="text-sm font-medium">{apps.filter((a) => a.status === 'ready').length}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-sm text-text-muted">Installed</span>
              <span className="text-sm font-medium">{apps.filter((a) => a.installedOnHomescreen).length}</span>
            </div>
          </div>
        </section>

        {/* Danger zone */}
        <section>
          <h2 className="text-xs font-semibold text-danger uppercase tracking-wider mb-3">
            Danger Zone
          </h2>
          <Button
            variant="danger"
            fullWidth
            onClick={handleClearAll}
          >
            {confirmClear ? 'Tap again to confirm' : 'Clear All Data'}
          </Button>
          {confirmClear && (
            <p className="text-xs text-danger/80 text-center mt-2">
              This will delete all apps and settings permanently.
            </p>
          )}
        </section>

        {/* About */}
        <section className="text-center pt-6">
          <p className="text-xs text-text-dim">AppForge v1.0.0</p>
          <p className="text-xs text-text-dim">Built with React + Vite</p>
        </section>
      </div>
    </div>
  );
}
