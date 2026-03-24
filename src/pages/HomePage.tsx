import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAppStore } from '../stores/appStore.js';
import BottomSheet from '../components/ui/BottomSheet.js';
import Button from '../components/ui/Button.js';
import { useToast } from '../components/ui/Toast.js';
import type { AppMetadata } from '../types/index.js';

export default function HomePage() {
  const { apps, loading, loadApps, removeApp, updateApp } = useAppStore();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [selectedApp, setSelectedApp] = useState<AppMetadata | null>(null);
  const [showInstallGuide, setShowInstallGuide] = useState(false);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  const installedApps = apps.filter((a) => a.installedOnHomescreen);
  const otherApps = apps.filter((a) => !a.installedOnHomescreen);

  const handleDelete = async (app: AppMetadata) => {
    await removeApp(app.id);
    setSelectedApp(null);
    toast(`"${app.name}" deleted`, 'info');
  };

  const handleInstall = async (app: AppMetadata) => {
    // Build the standalone URL for this specific app.
    // This is a real, persistent URL within AppForge that renders the app
    // fullscreen with PWA meta tags — perfect for "Add to Home Screen".
    const baseUrl = window.location.href.split('#')[0];
    const standaloneUrl = `${baseUrl}#/standalone/${app.id}`;

    // Open in a new tab using an <a> element to avoid popup blockers
    const a = document.createElement('a');
    a.href = standaloneUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Mark as installed in our db
    await updateApp({ ...app, installedOnHomescreen: true, updatedAt: Date.now() });
    setSelectedApp(null);

    // Show the install guide
    setShowInstallGuide(true);
  };

  const handleUninstall = async (app: AppMetadata) => {
    await updateApp({ ...app, installedOnHomescreen: false, updatedAt: Date.now() });
    setSelectedApp(null);
    toast(`"${app.name}" removed from homescreen`, 'info');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full safe-top">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4">
        <h1 className="text-2xl font-bold">AppForge</h1>
        <button
          onClick={() => navigate('/settings')}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-light text-text-muted"
        >
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      {/* App list */}
      <div className="flex-1 overflow-y-auto px-5 pb-24">
        {apps.length === 0 ? (
          <EmptyState onNew={() => navigate('/new')} />
        ) : (
          <>
            {/* Installed / homescreen section */}
            {installedApps.length > 0 && (
              <section className="mb-6">
                <h2 className="text-xs font-semibold text-text-dim uppercase tracking-wider mb-3">
                  Homescreen
                </h2>
                <div className="grid grid-cols-4 gap-3">
                  {installedApps.map((app) => (
                    <AppIcon key={app.id} app={app} onTap={() => setSelectedApp(app)} />
                  ))}
                </div>
              </section>
            )}

            {/* All apps */}
            <section>
              {installedApps.length > 0 && (
                <h2 className="text-xs font-semibold text-text-dim uppercase tracking-wider mb-3">
                  All Apps
                </h2>
              )}
              <div className="grid grid-cols-3 gap-3">
                {(installedApps.length > 0 ? otherApps : apps).map((app) => (
                  <AppCard key={app.id} app={app} onTap={() => setSelectedApp(app)} />
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      {/* FAB */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 safe-bottom">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate('/new')}
          className="flex items-center gap-2 px-6 py-3.5 bg-primary text-white font-semibold rounded-full shadow-lg shadow-primary/30"
        >
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New App
        </motion.button>
      </div>

      {/* Detail sheet */}
      <BottomSheet open={!!selectedApp} onClose={() => setSelectedApp(null)}>
        {selectedApp && (
          <AppDetailContent
            app={selectedApp}
            onOpen={() => { setSelectedApp(null); navigate(`/run/${selectedApp.id}`); }}
            onEdit={() => { setSelectedApp(null); navigate(`/new?edit=${selectedApp.id}`); }}
            onDelete={() => handleDelete(selectedApp)}
            onInstall={() => handleInstall(selectedApp)}
            onUninstall={() => handleUninstall(selectedApp)}
          />
        )}
      </BottomSheet>

      {/* Install guide modal */}
      <BottomSheet open={showInstallGuide} onClose={() => setShowInstallGuide(false)}>
        <InstallGuide onClose={() => setShowInstallGuide(false)} />
      </BottomSheet>
    </div>
  );
}

function InstallGuide({ onClose }: { onClose: () => void }) {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/.test(navigator.userAgent);

  return (
    <div>
      <h3 className="text-lg font-semibold mb-3">Add to Home Screen</h3>
      <p className="text-sm text-text-muted mb-4">
        Your app opened in a new tab in fullscreen mode. To add it as a shortcut on your home screen:
      </p>

      {isIOS ? (
        <div className="space-y-3 mb-5">
          <Step num={1} text='In the new tab, tap the Share button (square with arrow) at the bottom of Safari' />
          <Step num={2} text='Scroll down and tap "Add to Home Screen"' />
          <Step num={3} text='Tap "Add" — the app will appear as its own icon!' />
        </div>
      ) : isAndroid ? (
        <div className="space-y-3 mb-5">
          <Step num={1} text='In the new tab, tap the menu (three dots) in the top right' />
          <Step num={2} text='Tap "Add to Home screen" or "Install app"' />
          <Step num={3} text='Tap "Add" — the app will appear as its own icon!' />
        </div>
      ) : (
        <div className="space-y-3 mb-5">
          <Step num={1} text='In the new tab, look for an install icon in the address bar (or use the browser menu)' />
          <Step num={2} text='Click "Install app" or "Create shortcut"' />
          <Step num={3} text='The app will appear on your desktop / taskbar as its own shortcut' />
        </div>
      )}

      <Button variant="primary" fullWidth onClick={onClose}>
        Got it
      </Button>
    </div>
  );
}

function Step({ num, text }: { num: number; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center flex-shrink-0 text-xs font-bold">
        {num}
      </div>
      <p className="text-sm text-text">{text}</p>
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-20">
      <div className="text-5xl mb-4">🚀</div>
      <h2 className="text-xl font-semibold mb-2">No apps yet</h2>
      <p className="text-text-muted mb-6 max-w-xs">
        Create your first app by describing what you want to build.
      </p>
      <Button onClick={onNew}>Create Your First App</Button>
    </div>
  );
}

function AppIcon({ app, onTap }: { app: AppMetadata; onTap: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={onTap}
      className="flex flex-col items-center gap-1"
    >
      <div className="w-14 h-14 rounded-2xl bg-surface-light flex items-center justify-center text-2xl border border-surface-lighter">
        {app.icon || '📱'}
      </div>
      <span className="text-xs text-text-muted truncate w-full text-center">{app.name}</span>
    </motion.button>
  );
}

function AppCard({ app, onTap }: { app: AppMetadata; onTap: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onTap}
      className="flex flex-col items-center p-3 rounded-2xl bg-surface-light border border-surface-lighter hover:border-primary/40 transition-colors"
    >
      <div className="text-3xl mb-2">{app.icon || '📱'}</div>
      <span className="text-sm font-medium truncate w-full text-center">{app.name}</span>
      <span className={`text-xs mt-0.5 ${app.status === 'error' ? 'text-danger' : 'text-text-dim'}`}>
        {app.status === 'ready' ? 'Ready' : app.status === 'generating' ? 'Building...' : app.status === 'error' ? (app.errorMessage ? app.errorMessage.slice(0, 40) : 'Error') : 'Draft'}
      </span>
    </motion.button>
  );
}

function AppDetailContent({
  app,
  onOpen,
  onEdit,
  onDelete,
  onInstall,
  onUninstall,
}: {
  app: AppMetadata;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onInstall: () => void;
  onUninstall: () => void;
}) {
  const sizeKb = app.spec ? '~' + Math.round(JSON.stringify(app.spec).length / 1024) + ' KB' : 'N/A';

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-14 h-14 rounded-2xl bg-surface flex items-center justify-center text-3xl border border-surface-lighter">
          {app.icon || '📱'}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold truncate">{app.name}</h3>
          <p className="text-sm text-text-muted truncate">{app.prompt}</p>
        </div>
      </div>

      <div className="flex gap-2 text-xs text-text-dim mb-5">
        <span>Created {new Date(app.createdAt).toLocaleDateString()}</span>
        <span>·</span>
        <span>{sizeKb}</span>
        <span>·</span>
        <span>v{app.version}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="primary" onClick={onOpen} disabled={app.status !== 'ready'} fullWidth>
          ▶ Open
        </Button>
        <Button
          variant="secondary"
          onClick={app.installedOnHomescreen ? onUninstall : onInstall}
          disabled={app.status !== 'ready'}
          fullWidth
        >
          {app.installedOnHomescreen ? '✓ Installed' : '📥 Install'}
        </Button>
        <Button variant="secondary" onClick={onEdit} fullWidth>
          ✏ Edit
        </Button>
        <Button variant="danger" onClick={onDelete} fullWidth>
          🗑 Delete
        </Button>
      </div>
    </div>
  );
}
