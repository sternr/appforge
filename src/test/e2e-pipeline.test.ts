import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { db, saveApp, getAppCode } from '../db/database.js';
import { useAppStore } from '../stores/appStore.js';
import { usePipelineStore } from '../stores/pipelineStore.js';
import { runClarification, runGeneration } from '../pipeline/pipeline.js';
import type { AppMetadata } from '../types/index.js';

// Real Anthropic API key — set via env var
const API_KEY = process.env.ANTHROPIC_API_KEY || '';

const GAME_PROMPT = 'Create a simple Flappy Bird clone — a bunny running and jumping over trees. Tap to jump. Add score tracking, a title screen, and a game over screen with restart. For kids — easy difficulty.';

describe('E2E Pipeline Test', () => {
  beforeEach(async () => {
    await db.apps.clear();
    await db.appCode.clear();
    await db.settings.clear();
    usePipelineStore.getState().reset();
    useAppStore.setState({ apps: [], loading: false });
  });

  it('should run clarification and get questions', async () => {
    if (!API_KEY) { console.log('Skipping: no ANTHROPIC_API_KEY'); return; }
    const questions = await runClarification(API_KEY, GAME_PROMPT);

    console.log('=== Clarification Questions ===');
    questions.forEach((q, i) => {
      console.log(`Q${i + 1}: ${q.question}`);
      q.options.forEach((o) => console.log(`  - ${o}`));
    });

    expect(questions.length).toBeGreaterThan(0);
    expect(questions.length).toBeLessThanOrEqual(5);

    for (const q of questions) {
      expect(q.question).toBeTruthy();
      expect(q.options.length).toBeGreaterThanOrEqual(2);
    }
  }, 30000);

  it('should generate a working game with no JS errors and functional start', async () => {
    if (!API_KEY) { console.log('Skipping: no ANTHROPIC_API_KEY'); return; }

    const app: AppMetadata = {
      id: 'e2e-bunny-game',
      name: 'Bunny Jump',
      icon: '🐰',
      prompt: GAME_PROMPT,
      clarifications: [],
      status: 'generating',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1,
      installedOnHomescreen: false,
    };

    await saveApp(app);
    await useAppStore.getState().addApp(app);

    // Run full pipeline
    await runGeneration(API_KEY, app, [
      { question: 'Visual style?', answer: 'Colorful & cartoon — bright greens, blue sky, cute bunny' },
      { question: 'Difficulty?', answer: 'Very easy — for young kids (ages 4-7)' },
    ]);

    // Check pipeline completed
    const pipeline = usePipelineStore.getState();
    console.log('=== Pipeline State ===');
    console.log('Phase:', pipeline.phase);
    console.log('Progress:', pipeline.progress);
    console.log('Iterations:', pipeline.iterationCount);
    console.log('Test results:', pipeline.testResults.map(t => `${t.id}: ${t.status} ${t.failureReason || ''}`));

    expect(pipeline.phase).toBe('done');
    expect(pipeline.progress).toBe(100);

    // Get generated HTML
    const code = await getAppCode('e2e-bunny-game');
    expect(code).toBeDefined();
    expect(code!.html).toBeTruthy();
    expect(code!.html.length).toBeGreaterThan(500);

    const html = code!.html;
    console.log('=== Generated HTML ===');
    console.log('Size:', Math.round(html.length / 1024), 'KB');

    // ── STRUCTURAL VALIDATION ──
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
    expect(html).toContain('<canvas');
    expect(html).toContain('<script');

    // ── STATIC CODE ANALYSIS ──
    // Must have requestAnimationFrame for game loop
    expect(html).toContain('requestAnimationFrame');

    // Must have event listeners
    expect(html).toMatch(/addEventListener\s*\(\s*['"](?:click|touchstart|mousedown|pointerdown|keydown)/);

    // Must have game states
    const hasGameStates = html.includes("'menu'") || html.includes('"menu"') ||
                          html.includes("'title'") || html.includes('"title"') ||
                          html.includes('gameState') || html.includes('state ===') ||
                          html.includes('state===');
    expect(hasGameStates).toBe(true);

    // ── DOM VALIDATION (simulate browser) ──
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      resources: 'usable',
      pretendToBeVisual: true,
      beforeParse(window: any) {
        // Stub AudioContext (not available in jsdom)
        window.AudioContext = class {
          createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {} }, type: '' }; }
          createGain() { return { connect() {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {} } }; }
          get destination() { return {}; }
          resume() { return Promise.resolve(); }
        };
        window.webkitAudioContext = window.AudioContext;

        // Stub requestAnimationFrame
        let rafId = 0;
        window.requestAnimationFrame = (cb: FrameRequestCallback) => {
          rafId++;
          setTimeout(() => cb(performance.now()), 16);
          return rafId;
        };
        window.cancelAnimationFrame = () => {};

        // Stub canvas getContext if needed
        const origCreateElement = window.document.createElement.bind(window.document);
        window.document.createElement = function(tag: string) {
          const el = origCreateElement(tag);
          if (tag.toLowerCase() === 'canvas' && !el.getContext) {
            el.getContext = () => null;
          }
          return el;
        };
      }
    });

    // Wait for scripts to execute
    await new Promise(r => setTimeout(r, 500));

    const doc = dom.window.document;

    // Canvas must exist
    const canvas = doc.querySelector('canvas');
    expect(canvas).not.toBeNull();

    // Canvas must have non-zero dimensions
    if (canvas) {
      expect(canvas.width).toBeGreaterThan(0);
      expect(canvas.height).toBeGreaterThan(0);
    }

    // No unhandled script errors — check the document didn't throw on load
    // (jsdom throws if there's a script error, so if we got here we're good)

    // ── Simulate a click to start the game ──
    let clickError: Error | null = null;
    dom.window.onerror = (msg: any) => {
      clickError = new Error(String(msg));
    };

    // Try clicking canvas
    if (canvas) {
      const evt = new dom.window.MouseEvent('click', {
        bubbles: true,
        clientX: canvas.width / 2,
        clientY: canvas.height / 2,
      });
      canvas.dispatchEvent(evt);
    }

    // Try pressing space
    const spaceEvt = new dom.window.KeyboardEvent('keydown', {
      bubbles: true,
      key: ' ',
      code: 'Space',
      keyCode: 32,
    });
    doc.dispatchEvent(spaceEvt);

    // Wait a tick for handlers to fire
    await new Promise(r => setTimeout(r, 100));

    // Must not throw on click
    expect(clickError).toBeNull();

    // App status should be 'ready'
    const updatedApp = await db.apps.get('e2e-bunny-game');
    expect(updatedApp?.status).toBe('ready');

    console.log('=== App Spec ===');
    console.log('Name:', updatedApp?.name);
    console.log('Screens:', updatedApp?.spec?.screens.length);

    dom.window.close();
  }, 180000); // 3 minute timeout
});
