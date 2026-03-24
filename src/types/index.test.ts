import { describe, it, expect } from 'vitest';
import { PIPELINE_PHASES } from './index.js';
import type { PipelinePhase, AppMetadata } from './index.js';

describe('Types & Constants', () => {
  it('PIPELINE_PHASES should contain all expected phases in order', () => {
    const phases = PIPELINE_PHASES.map((p) => p.phase);
    expect(phases).toEqual([
      'clarifying',
      'planning',
      'designing',
      'coding',
      'testing',
      'agent-testing',
      'iterating',
      'done',
    ]);
  });

  it('PIPELINE_PHASES should all have labels', () => {
    for (const phase of PIPELINE_PHASES) {
      expect(phase.label).toBeTruthy();
      expect(typeof phase.label).toBe('string');
    }
  });

  it('AppMetadata shape should support all required fields', () => {
    const app: AppMetadata = {
      id: 'test',
      name: 'Test',
      icon: '🔥',
      prompt: 'A test',
      clarifications: [{ question: 'Q?', answer: 'A' }],
      status: 'ready',
      createdAt: 1,
      updatedAt: 2,
      version: 1,
      installedOnHomescreen: true,
      spec: {
        screens: [],
        flows: [],
        designSystem: {
          colorPalette: {},
          typography: { heading: 'a', body: 'b' },
          spacing: '8px',
          borderRadius: '8px',
          style: 'minimal',
        },
        testCases: [],
      },
    };

    expect(app.id).toBe('test');
    expect(app.spec?.designSystem.style).toBe('minimal');
  });

  it('PipelinePhase type should match known phases', () => {
    const validPhases: PipelinePhase[] = [
      'idle', 'clarifying', 'planning', 'designing',
      'coding', 'testing', 'agent-testing', 'iterating', 'done', 'error',
    ];
    // This is a compile-time check; if it compiles, the types are correct
    expect(validPhases).toHaveLength(10);
  });
});
