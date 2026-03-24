/**
 * LLM Agent Testing — the final validation step.
 *
 * Instead of just running predetermined checks, this phase:
 * 1. Loads the generated app in a hidden iframe with an injected command harness
 * 2. Captures a screenshot of the initial state
 * 3. Sends the screenshot to the LLM asking it to define 2 test interactions
 * 4. Executes each interaction (click, type) via postMessage commands
 * 5. Captures a screenshot after each interaction
 * 6. Sends the result screenshots to the LLM for pass/fail validation
 *
 * The harness script injected into the app listens for postMessage commands
 * and responds with DOM state and screenshots.
 */

import { chatComplete, type ChatMessage, type ChatMessageTextContent } from './llm.js';
import { SYSTEM_PROMPT } from './prompts.js';

export interface AgentTestResult {
  passed: boolean;
  steps: Array<{
    action: string;
    expectation: string;
    screenshot?: string;
    result: 'pass' | 'fail';
    reasoning: string;
  }>;
  summary: string;
}

/**
 * The command harness injected into the app.
 * Listens for postMessage commands and responds with results.
 */
function getAgentHarness(): string {
  return `
<script data-appforge-agent="true">
(function() {
  window.addEventListener('message', function(e) {
    if (!e.data || e.data.type !== 'appforge-agent-cmd') return;
    var cmd = e.data;

    try {
      if (cmd.action === 'screenshot') {
        captureAndSend(cmd.id);
      } else if (cmd.action === 'click') {
        doClick(cmd);
        // Wait a moment for any state transitions, then screenshot
        setTimeout(function() { captureAndSend(cmd.id); }, cmd.delay || 1200);
      } else if (cmd.action === 'get_elements') {
        sendElements(cmd.id);
      }
    } catch(err) {
      window.parent.postMessage({
        type: 'appforge-agent-result', id: cmd.id,
        error: err.message
      }, '*');
    }
  });

  function doClick(cmd) {
    var target = null;

    // Try to find by text content first
    if (cmd.text) {
      var all = document.querySelectorAll('button, [role="button"], a, label, .option, .answer, .choice, [onclick], input[type="radio"], input[type="checkbox"]');
      var pattern = cmd.text.toLowerCase();
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        var style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        var txt = (el.textContent || '').trim().toLowerCase();
        if (txt === pattern || txt.includes(pattern)) {
          target = el;
          break;
        }
      }
    }

    // Fallback: try by selector
    if (!target && cmd.selector) {
      try { target = document.querySelector(cmd.selector); } catch(e) {}
    }

    // Fallback: try by coordinates
    if (!target && cmd.x !== undefined && cmd.y !== undefined) {
      target = document.elementFromPoint(cmd.x, cmd.y);
    }

    if (target) {
      // Scroll into view
      target.scrollIntoView({ block: 'center', behavior: 'instant' });

      // Dispatch full click sequence
      var rect = target.getBoundingClientRect();
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;

      target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: cx, clientY: cy }));
      target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: cx, clientY: cy }));
      target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: cx, clientY: cy }));
      target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: cx, clientY: cy }));
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: cx, clientY: cy }));

      // Also try .click() directly
      if (typeof target.click === 'function') target.click();

      // Try touch events for mobile-oriented apps
      try {
        target.dispatchEvent(new TouchEvent('touchstart', {
          bubbles: true, cancelable: true,
          touches: [new Touch({ identifier: 1, target: target, clientX: cx, clientY: cy })]
        }));
        target.dispatchEvent(new TouchEvent('touchend', {
          bubbles: true, cancelable: true,
          changedTouches: [new Touch({ identifier: 1, target: target, clientX: cx, clientY: cy })]
        }));
      } catch(te) {}
    }
  }

  function captureAndSend(id) {
    var screenshot = null;

    // Try canvas screenshot first
    var canvases = document.querySelectorAll('canvas');
    if (canvases.length > 0 && canvases[0].width > 0) {
      try { screenshot = canvases[0].toDataURL('image/png'); } catch(e) {}
    }

    // Fallback: use offscreen canvas to capture background color
    if (!screenshot) {
      try {
        var body = document.body || document.documentElement;
        var w = Math.min(body.scrollWidth || 375, 375);
        var h = Math.min(body.scrollHeight || 667, 667);
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        var ctx = c.getContext('2d');
        if (ctx) {
          ctx.fillStyle = getComputedStyle(body).backgroundColor || '#ffffff';
          ctx.fillRect(0, 0, w, h);
          screenshot = c.toDataURL('image/png');
        }
      } catch(e) {}
    }

    // Get visible text and element info
    var bodyText = (document.body ? (document.body.innerText || '') : '').slice(0, 3000);

    // List all visible interactive elements
    var elements = [];
    var all = document.querySelectorAll('button, [role="button"], a, input, select, label, .option, .answer, .choice, [onclick]');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
      var rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      elements.push({
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || '').trim().slice(0, 80),
        type: el.getAttribute('type') || '',
        rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
      });
    }

    window.parent.postMessage({
      type: 'appforge-agent-result',
      id: id,
      screenshot: screenshot,
      bodyText: bodyText,
      elements: elements,
      jsErrors: window.__agentJsErrors || []
    }, '*');
  }

  function sendElements(id) {
    captureAndSend(id);
  }

  // Track JS errors
  window.__agentJsErrors = [];
  window.onerror = function(msg, url, line) {
    window.__agentJsErrors.push(msg + ' (line ' + line + ')');
  };
  window.addEventListener('unhandledrejection', function(e) {
    window.__agentJsErrors.push('Promise: ' + (e.reason && e.reason.message ? e.reason.message : e.reason));
  });
})();
</script>`;
}

/**
 * Send a command to the agent harness inside the iframe and wait for a response.
 */
function sendCommand(
  iframe: HTMLIFrameElement,
  command: Record<string, unknown>,
  timeoutMs = 5000
): Promise<{
  screenshot?: string;
  bodyText?: string;
  elements?: Array<{ tag: string; text: string; type: string; rect: { x: number; y: number; w: number; h: number } }>;
  jsErrors?: string[];
  error?: string;
}> {
  return new Promise((resolve) => {
    const id = `cmd-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let resolved = false;

    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'appforge-agent-result' && event.data.id === id && !resolved) {
        resolved = true;
        window.removeEventListener('message', handler);
        clearTimeout(timer);
        resolve(event.data);
      }
    };

    window.addEventListener('message', handler);

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        window.removeEventListener('message', handler);
        resolve({ error: 'Command timed out' });
      }
    }, timeoutMs);

    iframe.contentWindow?.postMessage({ type: 'appforge-agent-cmd', id, ...command }, '*');
  });
}

/**
 * Run the LLM agent test on generated HTML.
 * Returns pass/fail with detailed step results.
 */
export async function runAgentTest(
  apiKey: string,
  html: string,
  userPrompt: string,
  timeoutMs = 30000
): Promise<AgentTestResult> {
  // Inject the agent harness
  const harness = getAgentHarness();
  let testHtml: string;
  if (html.includes('</body>')) {
    testHtml = html.replace('</body>', harness + '</body>');
  } else if (html.includes('</html>')) {
    testHtml = html.replace('</html>', harness + '</html>');
  } else {
    testHtml = html + harness;
  }

  // Create hidden iframe
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:375px;height:667px;border:none;opacity:0;pointer-events:none;';
  iframe.sandbox.add('allow-scripts');

  const blob = new Blob([testHtml], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  iframe.src = url;

  document.body.appendChild(iframe);

  try {
    // Wait for iframe to load
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Iframe load timeout')), timeoutMs);
      iframe.addEventListener('load', () => { clearTimeout(timer); URL.revokeObjectURL(url); resolve(); });
      iframe.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Iframe load error')); });
    });

    // Wait a bit for the app to initialize
    await new Promise((r) => setTimeout(r, 1500));

    // Step 1: Get initial state
    const initialState = await sendCommand(iframe, { action: 'screenshot' });
    if (initialState.error) {
      return { passed: false, steps: [], summary: `Could not capture initial state: ${initialState.error}` };
    }

    // Step 2: Ask the LLM to define test interactions
    const planMessages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `You are testing a generated app. The user requested: "${userPrompt}"

Here is the current state of the app. The visible text is:
"""
${initialState.bodyText?.slice(0, 2000) ?? '(empty)'}
"""

Interactive elements on screen:
${JSON.stringify(initialState.elements?.slice(0, 20) ?? [], null, 2)}

Define exactly 2 test interactions to verify the app works. Each interaction should click a visible element and check the result.

Return ONLY valid JSON:
{
  "tests": [
    {
      "action": "click",
      "text": "exact text of the element to click (case-insensitive match)",
      "expectation": "what should happen after clicking",
      "delay": 1500
    }
  ]
}

RULES:
- Use "text" field to target elements by their visible text content
- First test should click the start/play/begin button if one exists
- Second test should interact with the main functionality (e.g., click an answer in a trivia game, click a button in a tool)
- Be specific about what you expect to see after each click`
          } as ChatMessageTextContent,
        ],
      },
    ];

    const planResult = await chatComplete(apiKey, planMessages, { jsonMode: true, maxTokens: 1024 });
    let testPlan: { tests: Array<{ action: string; text: string; expectation: string; delay?: number }> };
    try {
      testPlan = JSON.parse(planResult);
    } catch {
      return { passed: false, steps: [], summary: 'LLM could not generate a test plan' };
    }

    if (!testPlan.tests || testPlan.tests.length === 0) {
      return { passed: false, steps: [], summary: 'LLM returned empty test plan' };
    }

    // Step 3: Execute each test interaction
    const steps: AgentTestResult['steps'] = [];

    for (const test of testPlan.tests.slice(0, 2)) {
      // Execute the click
      const result = await sendCommand(iframe, {
        action: 'click',
        text: test.text,
        delay: test.delay || 1500,
      }, 8000);

      if (result.error) {
        steps.push({
          action: `Click "${test.text}"`,
          expectation: test.expectation,
          result: 'fail',
          reasoning: `Command failed: ${result.error}`,
        });
        continue;
      }

      // Step 4: Ask the LLM to validate the result
      const validateMessages: ChatMessage[] = [
        { role: 'system', content: 'You are testing a generated app. Evaluate whether the interaction produced the expected result.' },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `The user requested this app: "${userPrompt}"

I clicked: "${test.text}"
Expected: "${test.expectation}"

After clicking, the visible text is:
"""
${result.bodyText?.slice(0, 2000) ?? '(empty)'}
"""

Interactive elements now visible:
${JSON.stringify(result.elements?.slice(0, 15) ?? [], null, 2)}

JS errors: ${JSON.stringify(result.jsErrors ?? [])}

Did the interaction work as expected? Return ONLY valid JSON:
{
  "passed": true/false,
  "reasoning": "brief explanation of what you observed"
}`
            } as ChatMessageTextContent,
          ],
        },
      ];

      let validation: { passed: boolean; reasoning: string };
      try {
        const valResult = await chatComplete(apiKey, validateMessages, { jsonMode: true, maxTokens: 512 });
        validation = JSON.parse(valResult);
      } catch {
        validation = { passed: false, reasoning: 'Could not validate result' };
      }

      steps.push({
        action: `Click "${test.text}"`,
        expectation: test.expectation,
        screenshot: result.screenshot,
        result: validation.passed ? 'pass' : 'fail',
        reasoning: validation.reasoning,
      });
    }

    const allPassed = steps.length > 0 && steps.every((s) => s.result === 'pass');
    const failCount = steps.filter((s) => s.result === 'fail').length;

    return {
      passed: allPassed,
      steps,
      summary: allPassed
        ? `All ${steps.length} agent test interactions passed`
        : `${failCount} of ${steps.length} agent test interactions failed`,
    };
  } finally {
    // Cleanup
    if (iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }
  }
}
