import { usePipelineStore } from '../stores/pipelineStore.js';
import { useAppStore } from '../stores/appStore.js';
import { saveAppCode, getAppCode } from '../db/database.js';
import { streamChat, chatComplete, MODEL_SMART, type ChatMessage } from './llm.js';
import {
  SYSTEM_PROMPT,
  clarificationPrompt,
  planningPrompt,
  codingPrompt,
  codeReviewPrompt,
  iterationPrompt,
  refinementPrompt,
  visualReviewPrompt,
  visualFixPrompt,
} from './prompts.js';
import { runRuntimeTests } from './runtimeTests.js';
import { runAgentTest } from './agentTest.js';
import type {
  AppMetadata,
  AppSpec,
  ClarificationQuestion,
  ClarificationAnswer,
  TestCase,
} from '../types/index.js';

const MAX_ITERATIONS = 3;

/**
 * Strip markdown code fences from LLM JSON output.
 * Anthropic models often wrap JSON in ```json ... ``` even when asked not to.
 */
function stripJsonFences(raw: string): string {
  let s = raw.trim();
  const fenceMatch = s.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) return fenceMatch[1].trim();
  return s;
}

/**
 * Extract clean HTML from LLM output — strips markdown fences and any preamble.
 */
function extractHtml(raw: string): string {
  let html = raw.trim();

  // Strip markdown code fences (```html ... ``` or ``` ... ```)
  const fenceMatch = html.match(/```(?:html)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    html = fenceMatch[1].trim();
  }

  // Find the start of actual HTML content
  const doctypeIdx = html.indexOf('<!DOCTYPE');
  const htmlTagIdx = html.indexOf('<html');
  const startIdx = doctypeIdx >= 0 ? doctypeIdx : htmlTagIdx >= 0 ? htmlTagIdx : -1;

  if (startIdx > 0) {
    html = html.slice(startIdx);
  }

  // Find the end of HTML content
  const endIdx = html.lastIndexOf('</html>');
  if (endIdx >= 0) {
    html = html.slice(0, endIdx + '</html>'.length);
  }

  return html;
}

/** Helper to stream code and track HTML preview */
function createStreamingHandler() {
  let foundHtmlStart = false;
  let rawAccumulator = '';

  return {
    onToken: (t: string) => {
      const ps = usePipelineStore.getState();
      ps.appendStreaming(t);

      rawAccumulator += t;
      if (!foundHtmlStart) {
        const lower = rawAccumulator.toLowerCase();
        if (lower.includes('<!doctype') || lower.includes('<html')) {
          foundHtmlStart = true;
          const idx = Math.min(
            lower.indexOf('<!doctype') >= 0 ? lower.indexOf('<!doctype') : Infinity,
            lower.indexOf('<html') >= 0 ? lower.indexOf('<html') : Infinity
          );
          if (idx < Infinity) {
            ps.setGeneratedHtml(rawAccumulator.slice(idx));
          }
        }
      } else {
        ps.appendGeneratedHtml(t);
      }
    },
    reset: () => {
      foundHtmlStart = false;
      rawAccumulator = '';
      usePipelineStore.getState().setGeneratedHtml('');
    },
  };
}

/**
 * Run runtime tests on the generated HTML and convert results to TestCase format.
 * Returns { testCases, failures, needsIteration }
 */
async function runTestsOnHtml(html: string): Promise<{
  testCases: TestCase[];
  failures: { id: string; reason: string }[];
  needsIteration: boolean;
  screenshots: { menuScreen?: string; gameplayScreen?: string };
}> {
  const pipeline = usePipelineStore.getState();
  pipeline.setPhase('testing', 'Running runtime tests...');

  try {
    const report = await runRuntimeTests(html, 8000);

    const testCases: TestCase[] = report.results.map((r) => ({
      id: r.id,
      type: 'functional' as const,
      description: r.name,
      steps: [],
      expected: 'pass',
      status: r.status,
      failureReason: r.reason,
    }));

    // Add JS error test cases
    if (report.jsErrors.length > 0) {
      testCases.push({
        id: 'runtime-js-errors',
        type: 'functional',
        description: 'No runtime JavaScript errors',
        steps: [],
        expected: 'No errors',
        status: 'fail',
        failureReason: `JavaScript errors detected: ${report.jsErrors.join('; ')}`,
      });
    }

    pipeline.setTestResults(testCases);

    const failures = testCases
      .filter((t) => t.status === 'fail')
      .map((t) => ({ id: t.id, reason: t.failureReason ?? t.description }));

    return {
      testCases,
      failures,
      needsIteration: !report.overallPass,
      screenshots: report.screenshots,
    };
  } catch (err) {
    console.error('Runtime tests failed:', err);
    return {
      testCases: [],
      failures: [],
      needsIteration: false,
      screenshots: {},
    };
  }
}

/**
 * Run a visual quality review by sending screenshots to the LLM vision model.
 * Returns improvement instructions if quality is below threshold.
 */
async function runVisualReview(
  apiKey: string,
  screenshots: { menuScreen?: string; gameplayScreen?: string },
  userPrompt: string
): Promise<{
  needsVisualFix: boolean;
  feedback: {
    scores: Record<string, { score: number; issue: string | null }>;
    improvements: string[];
    summary: string;
  } | null;
}> {
  const pipeline = usePipelineStore.getState();
  pipeline.setPhase('testing', 'Reviewing visual quality from screenshots...');

  // Build the message with images
  const hasMenu = !!screenshots.menuScreen;
  const hasGameplay = !!screenshots.gameplayScreen;

  if (!hasMenu && !hasGameplay) {
    // No screenshots captured — skip visual review
    return { needsVisualFix: false, feedback: null };
  }

  // Convert data URL screenshots to Anthropic's base64 image format
  function dataUrlToAnthropicImage(dataUrl: string): { type: 'image'; source: { type: 'base64'; media_type: string; data: string } } {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return { type: 'image', source: { type: 'base64', media_type: 'image/png', data: dataUrl } };
    return { type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } };
  }

  const content: Array<{ type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }> = [
    { type: 'text', text: visualReviewPrompt(userPrompt, hasMenu, hasGameplay) },
  ];

  if (hasMenu && screenshots.menuScreen) {
    content.push(dataUrlToAnthropicImage(screenshots.menuScreen));
  }
  if (hasGameplay && screenshots.gameplayScreen) {
    content.push(dataUrlToAnthropicImage(screenshots.gameplayScreen));
  }

  try {
    const result = await chatComplete(
      apiKey,
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content } as ChatMessage,
      ],
      { jsonMode: true, maxTokens: 4096 }
    );

    const parsed = JSON.parse(stripJsonFences(result));

    return {
      needsVisualFix: parsed.needsImprovement === true,
      feedback: {
        scores: parsed.scores ?? {},
        improvements: parsed.improvements ?? [],
        summary: parsed.summary ?? '',
      },
    };
  } catch (err) {
    console.error('Visual review failed:', err);
    return { needsVisualFix: false, feedback: null };
  }
}

/**
 * Run the clarification phase — returns questions for the user.
 */
export async function runClarification(
  apiKey: string,
  userPrompt: string
): Promise<ClarificationQuestion[]> {
  const store = usePipelineStore.getState();
  store.setPhase('clarifying', 'Analyzing your request...');

  try {
    const result = await chatComplete(
      apiKey,
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: clarificationPrompt(userPrompt) },
      ],
      { jsonMode: true }
    );

    const parsed = JSON.parse(stripJsonFences(result));
    store.setDetail('Questions ready');
    return parsed.questions ?? [];
  } catch (err) {
    console.error('Clarification failed:', err);
    return [];
  }
}

/**
 * Run the full generation pipeline (planning → designing → coding → testing → iterating).
 */
export async function runGeneration(
  apiKey: string,
  app: AppMetadata,
  clarifications: ClarificationAnswer[]
): Promise<void> {
  const pipeline = usePipelineStore.getState();
  const appStore = useAppStore.getState();

  try {
    // ── Phase: Planning ──
    pipeline.setPhase('planning', 'Creating detailed specification...');
    pipeline.setProgress(5);

    const planResult = await streamChat(
      apiKey,
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: planningPrompt(app.prompt, clarifications) },
      ],
      {
        onToken: (t) => usePipelineStore.getState().appendStreaming(t),
      },
      { jsonMode: true, model: MODEL_SMART, maxTokens: 8192 }
    );

    let spec: AppSpec;
    let appName = app.name;
    let appIcon = app.icon;
    let planJson = planResult;

    try {
      const parsed = JSON.parse(stripJsonFences(planResult));
      appName = parsed.name || appName;
      appIcon = parsed.icon || appIcon;
      spec = {
        screens: parsed.screens ?? [],
        flows: parsed.flows ?? [],
        designSystem: parsed.designSystem ?? {
          colorPalette: {},
          typography: { heading: 'system-ui', body: 'system-ui' },
          spacing: '8px',
          borderRadius: '8px',
          style: 'minimal',
        },
        testCases: (parsed.testCases ?? []).map((tc: TestCase) => ({
          ...tc,
          status: 'pending' as const,
        })),
      };
    } catch {
      spec = {
        screens: [{ id: 'main', name: 'Main', purpose: app.prompt, wireframe: '', components: [], interactions: [] }],
        flows: [],
        designSystem: {
          colorPalette: { primary: '#6366f1', background: '#0f172a', text: '#f8fafc' },
          typography: { heading: 'system-ui', body: 'system-ui' },
          spacing: '8px',
          borderRadius: '12px',
          style: 'minimal',
        },
        testCases: [],
      };
      planJson = JSON.stringify({ name: appName, description: app.prompt }, null, 2);
    }

    const updatedApp: AppMetadata = {
      ...app,
      name: appName,
      icon: appIcon,
      spec,
      updatedAt: Date.now(),
    };
    await appStore.updateApp(updatedApp);

    pipeline.setProgress(20);

    // ── Phase: Designing ──
    pipeline.setPhase('designing', 'Designing user experience...');
    await new Promise((r) => setTimeout(r, 500));
    pipeline.setProgress(30);

    // ── Phase: Coding ──
    pipeline.setPhase('coding', 'Writing code...');

    const streaming = createStreamingHandler();

    const codeResult = await streamChat(
      apiKey,
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: codingPrompt(app.prompt, spec, planJson) },
      ],
      { onToken: streaming.onToken },
      { maxTokens: 16384 }
    );

    let html = extractHtml(codeResult);
    if (html.length < 50) {
      html = codeResult.trim();
    }

    pipeline.setGeneratedHtml(html);
    pipeline.setProgress(60);

    // ── Phase: LLM Code Review (catch logic bugs before runtime tests) ──
    pipeline.setPhase('testing', 'Reviewing code for logic bugs...');
    try {
      const reviewResult = await chatComplete(
        apiKey,
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: codeReviewPrompt(html, app.prompt) },
        ],
        { jsonMode: true, maxTokens: 4096 }
      );

      const review = JSON.parse(stripJsonFences(reviewResult));
      if (review.hasCriticalBugs && review.bugs?.length > 0) {
        const criticalBugs = review.bugs
          .filter((b: { severity: string }) => b.severity === 'critical' || b.severity === 'major')
          .map((b: { category?: string; description: string; fix: string }) => ({ id: `review-${b.category || 'bug'}`, reason: `${b.description} — FIX: ${b.fix}` }));

        if (criticalBugs.length > 0) {
          pipeline.setPhase('iterating', 'Fixing critical bugs found in code review...');
          pipeline.incrementIteration();
          streaming.reset();

          const fixedCode = await streamChat(
            apiKey,
            [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: iterationPrompt(html, criticalBugs, spec) },
            ],
            { onToken: streaming.onToken },
            { maxTokens: 16384 }
          );

          html = extractHtml(fixedCode);
          if (html.length < 50) html = fixedCode.trim();
          pipeline.setGeneratedHtml(html);
        }
      }
    } catch (err) {
      console.error('Code review failed (non-fatal):', err);
    }

    pipeline.setProgress(65);

    // ── Phase: Runtime Testing ──
    let { failures, needsIteration, screenshots } = await runTestsOnHtml(html);

    pipeline.setProgress(70);

    // ── Phase: Iterating (fix runtime failures) ──
    let iterCount = 0;
    while (needsIteration && iterCount < MAX_ITERATIONS) {
      iterCount++;
      pipeline.setPhase('iterating', `Fixing issues (attempt ${iterCount}/${MAX_ITERATIONS})...`);
      pipeline.incrementIteration();

      streaming.reset();

      const fixedCode = await streamChat(
        apiKey,
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: iterationPrompt(html, failures, spec) },
        ],
        { onToken: streaming.onToken },
        { maxTokens: 16384 }
      );

      html = extractHtml(fixedCode);
      if (html.length < 50) html = fixedCode.trim();
      pipeline.setGeneratedHtml(html);

      // Re-run runtime tests
      const retest = await runTestsOnHtml(html);
      failures = retest.failures;
      needsIteration = retest.needsIteration;
      screenshots = retest.screenshots;
    }

    pipeline.setProgress(80);

    // ── Phase: Visual Quality Review (screenshot-based) ──
    const { needsVisualFix, feedback: visualFeedback } = await runVisualReview(
      apiKey, screenshots, app.prompt
    );

    if (needsVisualFix && visualFeedback) {
      pipeline.setPhase('iterating', 'Improving visual quality based on screenshot review...');
      pipeline.incrementIteration();
      pipeline.setDetail(`Visual score: ${visualFeedback.summary}`);

      streaming.reset();

      const visualFixCode = await streamChat(
        apiKey,
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: visualFixPrompt(html, visualFeedback) },
        ],
        { onToken: streaming.onToken },
        { maxTokens: 16384 }
      );

      html = extractHtml(visualFixCode);
      if (html.length < 50) html = visualFixCode.trim();
      pipeline.setGeneratedHtml(html);

      // Quick runtime re-test to make sure we didn't break anything
      const visualRetest = await runTestsOnHtml(html);
      if (visualRetest.needsIteration && visualRetest.failures.length > 0) {
        // Visual fix broke something — one quick recovery attempt
        pipeline.setPhase('iterating', 'Fixing issues after visual improvements...');
        streaming.reset();

        const recoveryCode = await streamChat(
          apiKey,
          [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: iterationPrompt(html, visualRetest.failures, spec) },
          ],
          { onToken: streaming.onToken },
          { maxTokens: 16384 }
        );

        html = extractHtml(recoveryCode);
        if (html.length < 50) html = recoveryCode.trim();
        pipeline.setGeneratedHtml(html);
      }
    }

    pipeline.setProgress(85);

    // ── Phase: Agent Testing (LLM-driven interactive testing) ──
    pipeline.setPhase('agent-testing', 'Agent is testing your app interactively...');

    try {
      const agentResult = await runAgentTest(apiKey, html, app.prompt, 30000);

      if (!agentResult.passed && agentResult.steps.length > 0) {
        // Convert agent test failures into iteration failures
        const agentFailures = agentResult.steps
          .filter((s) => s.result === 'fail')
          .map((s) => ({
            id: `agent-${s.action.replace(/\s+/g, '-').toLowerCase()}`,
            reason: `Agent test failed: ${s.action} — Expected: ${s.expectation}. Result: ${s.reasoning}`,
          }));

        if (agentFailures.length > 0) {
          pipeline.setPhase('iterating', 'Fixing issues found by agent testing...');
          pipeline.incrementIteration();
          streaming.reset();

          const fixedCode = await streamChat(
            apiKey,
            [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: iterationPrompt(html, agentFailures, spec) },
            ],
            { onToken: streaming.onToken },
            { maxTokens: 16384 }
          );

          html = extractHtml(fixedCode);
          if (html.length < 50) html = fixedCode.trim();
          pipeline.setGeneratedHtml(html);

          // Quick re-run of runtime tests to ensure fix didn't break anything
          const agentRetest = await runTestsOnHtml(html);
          if (agentRetest.needsIteration && agentRetest.failures.length > 0) {
            pipeline.setPhase('iterating', 'Fixing regression after agent test fix...');
            streaming.reset();

            const recoveryCode = await streamChat(
              apiKey,
              [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: iterationPrompt(html, agentRetest.failures, spec) },
              ],
              { onToken: streaming.onToken },
              { maxTokens: 16384 }
            );

            html = extractHtml(recoveryCode);
            if (html.length < 50) html = recoveryCode.trim();
            pipeline.setGeneratedHtml(html);
          }
        }
      }

      pipeline.setDetail(agentResult.summary);
    } catch (err) {
      console.error('Agent testing failed (non-fatal):', err);
      pipeline.setDetail('Agent testing skipped due to error');
    }

    pipeline.setProgress(95);

    // ── Save final code ──
    await saveAppCode({
      appId: app.id,
      html,
      version: app.version,
      sizeBytes: new Blob([html]).size,
    });

    const finalApp: AppMetadata = {
      ...updatedApp,
      status: 'ready',
      updatedAt: Date.now(),
    };
    await appStore.updateApp(finalApp);

    // ── Done ──
    pipeline.setPhase('done', 'Your app is ready!');
    pipeline.setProgress(100);
    pipeline.setGeneratedHtml(html);

    if (Notification.permission === 'granted') {
      new Notification('AppForge', {
        body: `"${finalApp.name}" is ready to use!`,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    pipeline.setError(message);

    const errorApp: AppMetadata = {
      ...app,
      status: 'error',
      errorMessage: message,
      updatedAt: Date.now(),
    };
    await appStore.updateApp(errorApp);
  }
}

/**
 * Run the refinement pipeline — modifies existing code based on user's edit instructions.
 */
export async function runRefinement(
  apiKey: string,
  app: AppMetadata,
  editInstructions: string
): Promise<void> {
  const pipeline = usePipelineStore.getState();
  const appStore = useAppStore.getState();

  try {
    const existingCode = await getAppCode(app.id);
    if (!existingCode?.html) {
      throw new Error('No existing code found — please regenerate from scratch.');
    }

    pipeline.setPhase('coding', 'Refining your app...');
    pipeline.setProgress(20);

    const streaming = createStreamingHandler();

    const codeResult = await streamChat(
      apiKey,
      [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: refinementPrompt(
            existingCode.html,
            app.prompt,
            editInstructions,
            app.spec
          ),
        },
      ],
      { onToken: streaming.onToken },
      { maxTokens: 16384 }
    );

    let html = extractHtml(codeResult);
    if (html.length < 50) {
      html = codeResult.trim();
    }

    pipeline.setGeneratedHtml(html);
    pipeline.setProgress(70);

    // ── Runtime tests ──
    const { failures, needsIteration, screenshots } = await runTestsOnHtml(html);

    // One quick iteration if runtime tests fail
    if (needsIteration && failures.length > 0) {
      pipeline.setPhase('iterating', 'Fixing runtime issues...');
      pipeline.incrementIteration();
      streaming.reset();

      const fixedCode = await streamChat(
        apiKey,
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: iterationPrompt(html, failures, app.spec ?? {
            screens: [], flows: [],
            designSystem: { colorPalette: {}, typography: { heading: 'system-ui', body: 'system-ui' }, spacing: '8px', borderRadius: '8px', style: 'minimal' },
            testCases: [],
          }) },
        ],
        { onToken: streaming.onToken },
        { maxTokens: 16384 }
      );

      html = extractHtml(fixedCode);
      if (html.length < 50) html = fixedCode.trim();
      pipeline.setGeneratedHtml(html);

      // Re-test
      await runTestsOnHtml(html);
    }

    pipeline.setProgress(85);

    // ── Visual quality review for refinements too ──
    const { needsVisualFix, feedback: visualFeedback } = await runVisualReview(
      apiKey, screenshots, `${app.prompt} — refined with: ${editInstructions}`
    );

    if (needsVisualFix && visualFeedback) {
      pipeline.setPhase('iterating', 'Improving visual quality...');
      streaming.reset();

      const visualFixCode = await streamChat(
        apiKey,
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: visualFixPrompt(html, visualFeedback) },
        ],
        { onToken: streaming.onToken },
        { maxTokens: 16384 }
      );

      html = extractHtml(visualFixCode);
      if (html.length < 50) html = visualFixCode.trim();
      pipeline.setGeneratedHtml(html);
    }

    pipeline.setProgress(85);

    // ── Phase: Agent Testing ──
    pipeline.setPhase('agent-testing', 'Agent is testing your app interactively...');

    try {
      const agentResult = await runAgentTest(apiKey, html, `${app.prompt} — refined with: ${editInstructions}`, 30000);

      if (!agentResult.passed && agentResult.steps.length > 0) {
        const agentFailures = agentResult.steps
          .filter((s) => s.result === 'fail')
          .map((s) => ({
            id: `agent-${s.action.replace(/\s+/g, '-').toLowerCase()}`,
            reason: `Agent test failed: ${s.action} — Expected: ${s.expectation}. Result: ${s.reasoning}`,
          }));

        if (agentFailures.length > 0) {
          pipeline.setPhase('iterating', 'Fixing issues found by agent testing...');
          pipeline.incrementIteration();
          streaming.reset();

          const fixedCode = await streamChat(
            apiKey,
            [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: iterationPrompt(html, agentFailures, app.spec ?? {
                screens: [], flows: [],
                designSystem: { colorPalette: {}, typography: { heading: 'system-ui', body: 'system-ui' }, spacing: '8px', borderRadius: '8px', style: 'minimal' },
                testCases: [],
              }) },
            ],
            { onToken: streaming.onToken },
            { maxTokens: 16384 }
          );

          html = extractHtml(fixedCode);
          if (html.length < 50) html = fixedCode.trim();
          pipeline.setGeneratedHtml(html);
        }
      }

      pipeline.setDetail(agentResult.summary);
    } catch (err) {
      console.error('Agent testing failed (non-fatal):', err);
      pipeline.setDetail('Agent testing skipped due to error');
    }

    pipeline.setProgress(95);

    await saveAppCode({
      appId: app.id,
      html,
      version: app.version + 1,
      sizeBytes: new Blob([html]).size,
    });

    const finalApp: AppMetadata = {
      ...app,
      status: 'ready',
      version: app.version + 1,
      updatedAt: Date.now(),
    };
    await appStore.updateApp(finalApp);

    pipeline.setPhase('done', 'Your app has been updated!');
    pipeline.setProgress(100);
    pipeline.setGeneratedHtml(html);

    if (Notification.permission === 'granted') {
      new Notification('AppForge', {
        body: `"${finalApp.name}" has been updated!`,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    pipeline.setError(message);

    const errorApp: AppMetadata = {
      ...app,
      status: 'error',
      errorMessage: message,
      updatedAt: Date.now(),
    };
    await appStore.updateApp(errorApp);
  }
}
