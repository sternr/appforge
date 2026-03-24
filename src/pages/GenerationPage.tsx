import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { usePipelineStore } from '../stores/pipelineStore.js';
import { useSettingsStore } from '../stores/settingsStore.js';
import { useAppStore } from '../stores/appStore.js';
import { runGeneration, runRefinement } from '../pipeline/pipeline.js';
import { useToast } from '../components/ui/Toast.js';
import Button from '../components/ui/Button.js';
import type { AppMetadata, ClarificationAnswer, PipelinePhase } from '../types/index.js';
import { PIPELINE_PHASES as PHASES } from '../types/index.js';

export default function GenerationPage() {
  const navigate = useNavigate();
  const { appId } = useParams<{ appId: string }>();
  const location = useLocation();
  const { app, clarifications, refineMode, editInstructions } = location.state as {
    app: AppMetadata;
    clarifications: ClarificationAnswer[];
    refineMode?: boolean;
    editInstructions?: string;
  };

  const apiKey = useSettingsStore((s) => s.apiKey);
  const { toast } = useToast();

  const phase = usePipelineStore((s) => s.phase);
  const progress = usePipelineStore((s) => s.progress);
  const detail = usePipelineStore((s) => s.currentStepDetail);
  const streamingContent = usePipelineStore((s) => s.streamingContent);
  const generatedHtml = usePipelineStore((s) => s.generatedHtml);
  const testResults = usePipelineStore((s) => s.testResults);
  const error = usePipelineStore((s) => s.error);

  const [statusExpanded, setStatusExpanded] = useState(false);
  const [expandedPhase, setExpandedPhase] = useState<PipelinePhase | null>(null);
  const [showRetry, setShowRetry] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const blobUrlRef = useRef<string | null>(null);
  const generationStarted = useRef(false);
  const lastProgressRef = useRef({ progress: 0, time: Date.now() });

  // Track progress changes to detect stuck state
  useEffect(() => {
    if (phase !== 'done' && phase !== 'error' && phase !== 'idle') {
      lastProgressRef.current = { progress, time: Date.now() };
    }
  }, [progress, phase]);

  // Detect stuck pipeline when user returns to the tab
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== 'visible') return;

      const { phase: currentPhase } = usePipelineStore.getState();
      // Only check if we're in an active generation phase
      if (currentPhase === 'done' || currentPhase === 'error' || currentPhase === 'idle') return;

      const elapsed = Date.now() - lastProgressRef.current.time;
      // If no progress in 30+ seconds after returning, offer retry
      if (elapsed > 30_000) {
        console.warn(`[StuckDetect] No progress for ${Math.round(elapsed / 1000)}s in phase "${currentPhase}". Showing retry.`);
        setShowRetry(true);
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  const handleRetry = () => {
    if (!apiKey || !app) return;
    setShowRetry(false);
    generationStarted.current = false;
    usePipelineStore.getState().reset(app.id);

    // Re-trigger generation
    setTimeout(() => {
      generationStarted.current = true;
      if (refineMode && editInstructions) {
        runRefinement(apiKey, app, editInstructions);
      } else {
        runGeneration(apiKey, app, clarifications);
      }
    }, 100);
  };

  // Start generation on mount
  useEffect(() => {
    if (!apiKey || !app || generationStarted.current) return;
    generationStarted.current = true;

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    if (refineMode && editInstructions) {
      runRefinement(apiKey, app, editInstructions);
    } else {
      runGeneration(apiKey, app, clarifications);
    }
  }, [apiKey, app, clarifications, refineMode, editInstructions]);

  // Update iframe preview.
  // During streaming: debounce heavily (2s) so we don't constantly reload and break the game.
  // When generation is DONE: always force one final fresh load with the complete, tested HTML.
  const lastUpdateRef = useRef(0);
  const prevPhaseRef = useRef<PipelinePhase>('idle');

  useEffect(() => {
    if (!generatedHtml || !iframeRef.current) return;

    const isDone = phase === 'done';
    const justFinished = isDone && prevPhaseRef.current !== 'done';
    prevPhaseRef.current = phase;

    // If generation just completed, ALWAYS force-load the final HTML (no debounce)
    if (justFinished) {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      const blob = new Blob([generatedHtml], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      iframeRef.current.src = url;
      lastUpdateRef.current = Date.now();
      return;
    }

    // Don't update preview after generation is done (user is interacting with the game)
    if (isDone) return;

    // During streaming: debounce to 2s to avoid constant reloads
    const now = Date.now();
    if (now - lastUpdateRef.current < 2000) return;
    lastUpdateRef.current = now;

    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    const blob = new Blob([generatedHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    blobUrlRef.current = url;
    iframeRef.current.src = url;
  }, [generatedHtml, phase]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  // Notify on completion
  useEffect(() => {
    if (phase === 'done') {
      toast('Your app is ready!', 'success');
    } else if (phase === 'error') {
      toast(`Generation failed: ${error}`, 'error');
    }
  }, [phase, error, toast]);

  const handleSave = () => {
    navigate('/', { replace: true });
  };

  const handleEdit = () => {
    navigate(`/new?edit=${appId}`, { replace: true });
  };

  const handleInstall = async () => {
    const appStore = useAppStore.getState();
    const currentApp = await appStore.getApp(appId!);
    if (currentApp) {
      await appStore.updateApp({ ...currentApp, installedOnHomescreen: true, updatedAt: Date.now() });
      toast('App installed to homescreen!', 'success');
    }
    navigate('/', { replace: true });
  };

  const getPhaseStatus = (p: typeof PHASES[number]) => {
    const phaseOrder: PipelinePhase[] = ['clarifying', 'planning', 'designing', 'coding', 'testing', 'agent-testing', 'iterating', 'done'];
    const currentIdx = phaseOrder.indexOf(phase);
    const thisIdx = phaseOrder.indexOf(p.phase);

    if (phase === 'error') {
      if (thisIdx <= currentIdx) return thisIdx === currentIdx ? 'error' : 'done';
      return 'pending';
    }
    if (thisIdx < currentIdx) return 'done';
    if (thisIdx === currentIdx) return 'active';
    return 'pending';
  };

  return (
    <div className="flex flex-col h-full bg-black relative">
      {/* Floating Status Bar */}
      <div className="absolute top-0 left-0 right-0 z-20 safe-top">
        <motion.div
          className="mx-3 mt-3 rounded-2xl bg-surface-light/95 backdrop-blur-lg border border-surface-lighter shadow-xl overflow-hidden"
          layout
        >
          {/* Collapsed bar */}
          <button
            onClick={() => setStatusExpanded(!statusExpanded)}
            className="w-full flex items-center justify-between px-4 py-2.5"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {phase === 'done' ? (
                <span className="text-success text-sm">✓</span>
              ) : phase === 'error' ? (
                <span className="text-danger text-sm">✗</span>
              ) : (
                <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
              )}
              <span className="text-sm font-medium truncate">
                {detail || 'Starting...'}
              </span>
            </div>
            <svg
              width="16"
              height="16"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
              className={`text-text-dim flex-shrink-0 transition-transform ${statusExpanded ? 'rotate-180' : ''}`}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Progress bar */}
          <div className="h-0.5 bg-surface-lighter">
            <motion.div
              className="h-full bg-primary"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>

          {/* Expanded details */}
          <AnimatePresence>
            {statusExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-4 py-3">
                  <h3 className="text-xs font-semibold text-text-dim uppercase tracking-wider mb-2">
                    Generation Progress
                  </h3>
                  <div className="space-y-1">
                    {PHASES.filter((p) => p.phase !== 'done').map((p) => {
                      const status = getPhaseStatus(p);
                      const isActive = status === 'active';

                      return (
                        <div key={p.phase}>
                          <button
                            onClick={() =>
                              setExpandedPhase(expandedPhase === p.phase ? null : p.phase)
                            }
                            className="w-full flex items-center gap-2 py-1.5 text-left"
                            disabled={status === 'pending'}
                          >
                            <span className="flex-shrink-0 w-5 text-center text-xs">
                              {status === 'done' ? (
                                <span className="text-success">✓</span>
                              ) : status === 'active' ? (
                                <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin inline-block" />
                              ) : status === 'error' ? (
                                <span className="text-danger">✗</span>
                              ) : (
                                <span className="text-text-dim">○</span>
                              )}
                            </span>
                            <span
                              className={`text-sm ${
                                isActive ? 'text-text font-medium' : status === 'done' ? 'text-text-muted' : 'text-text-dim'
                              }`}
                            >
                              {p.label}
                            </span>
                          </button>

                          {/* Streaming detail for active/expanded phase */}
                          <AnimatePresence>
                            {(isActive || expandedPhase === p.phase) && streamingContent && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="ml-7 mb-2 overflow-hidden"
                              >
                                <div className="bg-surface/80 rounded-lg p-2 max-h-32 overflow-y-auto">
                                  <pre className="text-xs text-text-dim font-mono whitespace-pre-wrap break-all">
                                    {streamingContent.slice(-500)}
                                  </pre>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>

                  {/* Test results if available */}
                  {testResults.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-surface-lighter">
                      <h4 className="text-xs font-semibold text-text-dim mb-1">Tests</h4>
                      <div className="space-y-0.5">
                        {testResults.map((t) => (
                          <div key={t.id} className="flex items-center gap-2 text-xs">
                            <span>{t.status === 'pass' ? '✅' : t.status === 'fail' ? '❌' : '⚪'}</span>
                            <span className="text-text-muted truncate">{t.description}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Live Preview (full screen iframe) */}
      <div className="flex-1 relative">
        {!generatedHtml ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-12 h-12 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-text-muted text-sm">Generating your app...</p>
            </div>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            sandbox="allow-scripts allow-forms allow-modals"
            className="w-full h-full border-0"
            title="App Preview"
          />
        )}

        {/* Shimmer overlay during generation */}
        {phase !== 'done' && phase !== 'error' && generatedHtml && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent animate-pulse" />
        )}

        {/* Stuck detection retry banner */}
        {showRetry && phase !== 'done' && phase !== 'error' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-10">
            <div className="bg-surface-light rounded-2xl p-6 mx-6 text-center shadow-xl border border-surface-lighter">
              <p className="text-text font-medium mb-2">Generation may have stalled</p>
              <p className="text-text-muted text-sm mb-4">
                The browser paused the connection while the app was in the background.
              </p>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setShowRetry(false)} className="flex-1" size="sm">
                  Dismiss
                </Button>
                <Button variant="primary" onClick={handleRetry} className="flex-1" size="sm">
                  Retry
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="safe-bottom bg-surface-light/95 backdrop-blur-lg border-t border-surface-lighter">
        <div className="flex gap-2 px-4 py-3">
          <Button
            variant="ghost"
            onClick={handleEdit}
            className="flex-1"
            size="sm"
          >
            ✏ Edit
          </Button>
          <Button
            variant="secondary"
            onClick={handleSave}
            disabled={phase !== 'done' && phase !== 'error'}
            className="flex-1"
            size="sm"
          >
            💾 Save
          </Button>
          <Button
            variant="primary"
            onClick={handleInstall}
            disabled={phase !== 'done'}
            className="flex-1"
            size="sm"
          >
            📱 Install
          </Button>
        </div>
      </div>
    </div>
  );
}
