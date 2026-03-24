import { describe, it, expect, beforeEach } from 'vitest';
import { usePipelineStore } from './pipelineStore.js';

describe('PipelineStore', () => {
  beforeEach(() => {
    usePipelineStore.getState().reset();
  });

  it('should start in idle phase', () => {
    const state = usePipelineStore.getState();
    expect(state.phase).toBe('idle');
    expect(state.progress).toBe(0);
    expect(state.generatedHtml).toBe('');
  });

  it('should set phase and detail', () => {
    usePipelineStore.getState().setPhase('planning', 'Creating spec...');
    const state = usePipelineStore.getState();
    expect(state.phase).toBe('planning');
    expect(state.currentStepDetail).toBe('Creating spec...');
    expect(state.streamingContent).toBe(''); // reset on phase change
  });

  it('should append streaming content', () => {
    usePipelineStore.getState().appendStreaming('Hello ');
    usePipelineStore.getState().appendStreaming('World');
    expect(usePipelineStore.getState().streamingContent).toBe('Hello World');
  });

  it('should append generated HTML', () => {
    usePipelineStore.getState().appendGeneratedHtml('<div>');
    usePipelineStore.getState().appendGeneratedHtml('hi</div>');
    expect(usePipelineStore.getState().generatedHtml).toBe('<div>hi</div>');
  });

  it('should increment iteration count', () => {
    usePipelineStore.getState().incrementIteration();
    usePipelineStore.getState().incrementIteration();
    expect(usePipelineStore.getState().iterationCount).toBe(2);
  });

  it('should set error and change phase', () => {
    usePipelineStore.getState().setError('Something failed');
    const state = usePipelineStore.getState();
    expect(state.phase).toBe('error');
    expect(state.error).toBe('Something failed');
  });

  it('should reset to initial state', () => {
    usePipelineStore.getState().setPhase('coding');
    usePipelineStore.getState().setProgress(50);
    usePipelineStore.getState().appendGeneratedHtml('<p>test</p>');

    usePipelineStore.getState().reset('new-app-id');

    const state = usePipelineStore.getState();
    expect(state.phase).toBe('idle');
    expect(state.progress).toBe(0);
    expect(state.generatedHtml).toBe('');
    expect(state.appId).toBe('new-app-id');
  });

  it('should set progress', () => {
    usePipelineStore.getState().setProgress(42);
    expect(usePipelineStore.getState().progress).toBe(42);
  });

  it('should set test results', () => {
    const results = [
      { id: 't1', type: 'ui' as const, description: 'Check header', steps: [], expected: 'visible', status: 'pass' as const },
      { id: 't2', type: 'functional' as const, description: 'Check nav', steps: [], expected: 'works', status: 'fail' as const, failureReason: 'broken' },
    ];
    usePipelineStore.getState().setTestResults(results);
    expect(usePipelineStore.getState().testResults).toHaveLength(2);
    expect(usePipelineStore.getState().testResults[1].status).toBe('fail');
  });
});
