import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useSettingsStore } from './stores/settingsStore.js';
import { ToastProvider } from './components/ui/Toast.js';
import { useAutoUpdate } from './hooks/useAutoUpdate.js';
import { initInstallListener } from './stores/installStore.js';

// Capture beforeinstallprompt as early as possible — before React renders
initInstallListener();
import OnboardingPage from './pages/OnboardingPage.js';
import HomePage from './pages/HomePage.js';
import NewAppPage from './pages/NewAppPage.js';
import ClarificationPage from './pages/ClarificationPage.js';
import GenerationPage from './pages/GenerationPage.js';
import AppRunnerPage from './pages/AppRunnerPage.js';
import SettingsPage from './pages/SettingsPage.js';
import StandalonePage from './pages/StandalonePage.js';

function AppRoutes() {
  const { isOnboarded, loading, init } = useSettingsStore();

  // Auto-detect new builds and refresh when the user returns to the app
  useAutoUpdate();

  useEffect(() => {
    init();
  }, [init]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={isOnboarded ? <HomePage /> : <Navigate to="/onboarding" replace />}
      />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route
        path="/new"
        element={isOnboarded ? <NewAppPage /> : <Navigate to="/onboarding" replace />}
      />
      <Route path="/clarify/:appId" element={<ClarificationPage />} />
      <Route path="/generate/:appId" element={<GenerationPage />} />
      <Route path="/run/:appId" element={<AppRunnerPage />} />
      <Route path="/standalone/:appId" element={<StandalonePage />} />
      <Route path="/settings" element={<SettingsPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <HashRouter>
      <ToastProvider>
        <div className="h-full">
          <AppRoutes />
        </div>
      </ToastProvider>
    </HashRouter>
  );
}
