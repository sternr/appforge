import { create } from 'zustand';

/**
 * Global store for PWA install prompt.
 *
 * Chrome fires `beforeinstallprompt` once per page load when install criteria are met.
 * We capture it globally so ANY component can trigger the native install dialog.
 *
 * The event fires when:
 * - The page has a valid manifest with name, icons (192+512), start_url, display
 * - The page is served over HTTPS
 * - The user hasn't already installed the PWA
 * - The user has engaged with the page (Chrome heuristic)
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallStore {
  /** The captured beforeinstallprompt event, or null if not available */
  deferredPrompt: BeforeInstallPromptEvent | null;
  /** Whether the user has already installed (via our prompt) */
  installed: boolean;
  /** Capture the event */
  setDeferredPrompt: (e: BeforeInstallPromptEvent | null) => void;
  /** Trigger the native install dialog. Returns true if accepted. */
  triggerInstall: () => Promise<boolean>;
}

export const useInstallStore = create<InstallStore>((set, get) => ({
  deferredPrompt: null,
  installed: false,

  setDeferredPrompt: (e) => set({ deferredPrompt: e }),

  triggerInstall: async () => {
    const { deferredPrompt } = get();
    if (!deferredPrompt) return false;

    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    const accepted = result.outcome === 'accepted';

    set({ deferredPrompt: null, installed: accepted });
    return accepted;
  },
}));

/**
 * Initialize the global beforeinstallprompt listener.
 * Call this once at app startup (e.g. in App.tsx).
 */
export function initInstallListener() {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    useInstallStore.getState().setDeferredPrompt(e as BeforeInstallPromptEvent);
  });

  window.addEventListener('appinstalled', () => {
    useInstallStore.getState().setDeferredPrompt(null);
    useInstallStore.setState({ installed: true });
  });
}
