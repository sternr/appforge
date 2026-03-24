import { describe, it, expect } from 'vitest';
import {
  clarificationPrompt,
  planningPrompt,
  codingPrompt,
  testingPrompt,
  iterationPrompt,
} from './prompts.js';
import type { AppSpec } from '../types/index.js';

const mockSpec: AppSpec = {
  screens: [
    { id: 'main', name: 'Main Screen', purpose: 'Entry point', wireframe: 'header + content', components: ['header', 'list'], interactions: ['tap item'] },
  ],
  flows: [
    { id: 'f1', name: 'Open app', steps: ['launch', 'show main'], fromScreen: 'main', toScreen: 'main' },
  ],
  designSystem: {
    colorPalette: { primary: '#6366f1', background: '#0f172a', text: '#f8fafc' },
    typography: { heading: 'system-ui', body: 'system-ui' },
    spacing: '8px',
    borderRadius: '12px',
    style: 'minimal',
  },
  testCases: [
    { id: 't1', type: 'ui', description: 'Header is visible', steps: ['open app'], expected: 'header visible', status: 'pending' },
  ],
};

describe('Prompts', () => {
  it('clarificationPrompt should include user prompt', () => {
    const result = clarificationPrompt('A recipe organizer');
    expect(result).toContain('A recipe organizer');
    expect(result).toContain('JSON');
    expect(result).toContain('questions');
  });

  it('planningPrompt should include prompt and clarifications', () => {
    const result = planningPrompt('A quiz game', [
      { question: 'Style?', answer: 'Colorful' },
    ]);
    expect(result).toContain('A quiz game');
    expect(result).toContain('Style?');
    expect(result).toContain('Colorful');
  });

  it('planningPrompt should handle empty clarifications', () => {
    const result = planningPrompt('A timer app', []);
    expect(result).toContain('No additional clarifications');
  });

  it('codingPrompt should include spec and key requirements', () => {
    const result = codingPrompt('A quiz game', mockSpec, '{}');
    expect(result).toContain('A quiz game');
    expect(result).toContain('Single HTML file');
    expect(result).toContain('Mobile-first');
    expect(result).toContain('sandboxed iframe');
    expect(result).toContain('DOCTYPE');
  });

  it('testingPrompt should include code and test cases', () => {
    const result = testingPrompt('<html><body>Test</body></html>', mockSpec);
    expect(result).toContain('<html>');
    expect(result).toContain('Header is visible');
    expect(result).toContain('JSON');
  });

  it('iterationPrompt should include failures and current code', () => {
    const result = iterationPrompt(
      '<html><body>Broken</body></html>',
      [{ id: 't1', reason: 'Header missing' }],
      mockSpec
    );
    expect(result).toContain('Broken');
    expect(result).toContain('Header missing');
    expect(result).toContain('DOCTYPE');
  });
});
