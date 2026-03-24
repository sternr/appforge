import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../stores/appStore.js';
import { useSettingsStore } from '../stores/settingsStore.js';
import { usePipelineStore } from '../stores/pipelineStore.js';
import { runClarification } from '../pipeline/pipeline.js';
import { getAppCode } from '../db/database.js';
import { generateId } from '../utils/id.js';
import Button from '../components/ui/Button.js';
import { useToast } from '../components/ui/Toast.js';
import type { AppMetadata, ClarificationQuestion } from '../types/index.js';

const EXAMPLES = [
  'A workout tracker with exercises and sets',
  'A quiz game about world capitals',
  'A recipe organizer with categories',
  'A budget calculator with expense tracking',
  'A pomodoro timer with statistics',
  'A mood journal with daily entries',
];

type EditMode = null | 'choosing' | 'refine' | 'regenerate';

export default function NewAppPage() {
  const [prompt, setPrompt] = useState('');
  const [appName, setAppName] = useState('');
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState<EditMode>(null);
  const [existingApp, setExistingApp] = useState<AppMetadata | null>(null);
  const [hasExistingCode, setHasExistingCode] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');

  const apiKey = useSettingsStore((s) => s.apiKey);
  const { addApp, getApp } = useAppStore();
  const pipelineReset = usePipelineStore((s) => s.reset);
  const { toast } = useToast();

  // If editing, load existing app and check for existing code
  useEffect(() => {
    if (editId) {
      getApp(editId).then(async (app) => {
        if (app) {
          setPrompt(app.prompt);
          setAppName(app.name);
          setExistingApp(app);
          // Check if there's existing generated code
          const code = await getAppCode(editId);
          if (code?.html && code.html.length > 100) {
            setHasExistingCode(true);
            setEditMode('choosing');
          } else {
            // No existing code, go straight to regenerate mode
            setEditMode('regenerate');
          }
        }
      });
    }
  }, [editId, getApp]);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    if (!apiKey) {
      toast('API key not set — go to Settings to add your Anthropic key', 'error');
      navigate('/settings');
      return;
    }

    setLoading(true);

    try {
      const appId = editId ?? generateId();

      // If refining, go directly to generation page with refine mode
      if (editMode === 'refine' && existingApp) {
        pipelineReset(appId);
        navigate(`/generate/${appId}`, {
          state: {
            app: existingApp,
            clarifications: [],
            refineMode: true,
            editInstructions: prompt.trim(),
          },
        });
        return;
      }

      // Normal flow: create/update app then clarify → generate
      const app: AppMetadata = {
        id: appId,
        name: appName.trim() || 'Untitled App',
        icon: '📱',
        prompt: prompt.trim(),
        clarifications: [],
        status: 'generating',
        createdAt: editId ? (existingApp?.createdAt ?? Date.now()) : Date.now(),
        updatedAt: Date.now(),
        version: existingApp ? existingApp.version : 1,
        installedOnHomescreen: existingApp?.installedOnHomescreen ?? false,
      };

      if (!editId) {
        await addApp(app);
      }

      pipelineReset(appId);

      // Try to get clarification questions
      let questions: ClarificationQuestion[] = [];
      try {
        questions = await runClarification(apiKey, prompt.trim());
      } catch {
        // If clarification fails, skip to generation
      }

      if (questions.length > 0) {
        navigate(`/clarify/${appId}`, {
          state: { questions, app },
        });
      } else {
        navigate(`/generate/${appId}`, {
          state: { app, clarifications: [] },
        });
      }
    } catch (err) {
      console.error('Generate failed:', err);
      toast('Something went wrong — please try again', 'error');
      setLoading(false);
    }
  };

  const isRefineMode = editMode === 'refine';

  return (
    <div className="flex flex-col h-full safe-top">
      {/* Header */}
      <div className="flex items-center px-4 py-3">
        <button onClick={() => navigate(-1)} className="text-text-muted p-2 -ml-2">
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold ml-2">
          {isRefineMode ? 'Refine App' : editId ? 'Regenerate App' : 'New App'}
        </h1>
      </div>

      <div className="flex-1 px-5 pb-6 flex flex-col">
        {/* Edit mode chooser */}
        <AnimatePresence mode="wait">
          {editMode === 'choosing' && (
            <motion.div
              key="choosing"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-5"
            >
              <p className="text-text-muted mb-3">
                This app already has generated code. What would you like to do?
              </p>
              <div className="space-y-2">
                <button
                  onClick={() => {
                    setEditMode('refine');
                    setPrompt('');
                  }}
                  className="w-full flex items-start gap-3 p-4 bg-surface-light border border-surface-lighter rounded-xl text-left hover:border-primary/50 transition-colors"
                >
                  <span className="text-2xl mt-0.5">✍️</span>
                  <div>
                    <p className="font-medium text-text">Refine existing app</p>
                    <p className="text-sm text-text-muted mt-0.5">
                      Describe what to change — keeps current code and applies your edits. Faster and preserves what works.
                    </p>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setEditMode('regenerate');
                    setPrompt(existingApp?.prompt ?? '');
                  }}
                  className="w-full flex items-start gap-3 p-4 bg-surface-light border border-surface-lighter rounded-xl text-left hover:border-primary/50 transition-colors"
                >
                  <span className="text-2xl mt-0.5">🔄</span>
                  <div>
                    <p className="font-medium text-text">Regenerate from scratch</p>
                    <p className="text-sm text-text-muted mt-0.5">
                      Start over with a new or updated prompt. Full pipeline: clarify → plan → code → test.
                    </p>
                  </div>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {editMode !== 'choosing' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex-1 flex flex-col"
          >
            <p className="text-text-muted mb-4">
              {isRefineMode
                ? 'Describe what you want to change:'
                : 'What would you like to build?'}
            </p>

            {/* App name input — only for new apps and regenerate, not refine */}
            {!isRefineMode && (
              <input
                type="text"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                placeholder="App name (e.g. My Workout Tracker)"
                className="w-full mb-3 px-4 py-3 bg-surface-light border border-surface-lighter rounded-xl text-text placeholder-text-dim focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-base"
                maxLength={40}
              />
            )}

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                isRefineMode
                  ? 'e.g. "Make the character cuter, slow down the game, add more colors..."'
                  : 'Describe the app you want...'
              }
              className="flex-1 min-h-[150px] max-h-[300px] w-full p-4 bg-surface-light border border-surface-lighter rounded-xl text-text placeholder-text-dim focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-base leading-relaxed"
              autoFocus
            />

            {/* Examples (only for new apps) */}
            {!prompt && !editId && (
              <div className="mt-4">
                <p className="text-xs text-text-dim mb-2">Try an example:</p>
                <div className="flex flex-wrap gap-2">
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      onClick={() => setPrompt(ex)}
                      className="px-3 py-1.5 text-xs bg-surface-light border border-surface-lighter rounded-full text-text-muted hover:text-text hover:border-primary/40 transition-colors"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Switch mode link when editing */}
            {hasExistingCode && editMode !== null && (
              <button
                onClick={() => setEditMode('choosing')}
                className="mt-3 text-xs text-primary underline self-start"
              >
                ← Change edit mode
              </button>
            )}
          </motion.div>
        )}

        {editMode !== 'choosing' && (
          <div className="mt-4">
            <Button
              fullWidth
              size="lg"
              onClick={handleGenerate}
              disabled={prompt.trim().length < 10 || loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {isRefineMode ? 'Refining...' : 'Analyzing...'}
                </span>
              ) : isRefineMode ? (
                '✍️ Refine App'
              ) : (
                'Generate App'
              )}
            </Button>
            {prompt.trim().length > 0 && prompt.trim().length < 10 && (
              <p className="text-xs text-text-dim text-center mt-2">
                Please write at least 10 characters
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
