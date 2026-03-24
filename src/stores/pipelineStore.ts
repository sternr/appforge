import { create } from 'zustand';
import type { PipelinePhase, PipelineState, TestCase } from '../types/index.js';

interface PipelineStore extends PipelineState {
  setPhase: (phase: PipelinePhase, detail?: string) => void;
  setProgress: (progress: number) => void;
  setDetail: (detail: string) => void;
  setStreaming: (content: string) => void;
  appendStreaming: (token: string) => void;
  setGeneratedHtml: (html: string) => void;
  appendGeneratedHtml: (token: string) => void;
  setTestResults: (results: TestCase[]) => void;
  incrementIteration: () => void;
  setError: (error: string) => void;
  reset: (appId?: string) => void;
}

const initialState: PipelineState = {
  phase: 'idle',
  appId: null,
  progress: 0,
  currentStepDetail: '',
  streamingContent: '',
  testResults: [],
  iterationCount: 0,
  generatedHtml: '',
};

export const usePipelineStore = create<PipelineStore>((set) => ({
  ...initialState,

  setPhase: (phase, detail) =>
    set((s) => ({
      phase,
      currentStepDetail: detail ?? s.currentStepDetail,
      streamingContent: '',
    })),

  setProgress: (progress) => set({ progress }),

  setDetail: (detail) => set({ currentStepDetail: detail }),

  setStreaming: (content) => set({ streamingContent: content }),

  appendStreaming: (token) =>
    set((s) => ({ streamingContent: s.streamingContent + token })),

  setGeneratedHtml: (html) => set({ generatedHtml: html }),

  appendGeneratedHtml: (token) =>
    set((s) => ({ generatedHtml: s.generatedHtml + token })),

  setTestResults: (results) => set({ testResults: results }),

  incrementIteration: () =>
    set((s) => ({ iterationCount: s.iterationCount + 1 })),

  setError: (error) => set({ phase: 'error', error }),

  reset: (appId) =>
    set({
      ...initialState,
      appId: appId ?? null,
    }),
}));
