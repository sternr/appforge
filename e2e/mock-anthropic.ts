import type { Page, Route } from '@playwright/test';

/**
 * A minimal but complete HTML app returned by the "coding" phase.
 * Must be a valid single-file HTML app so runtime tests pass.
 */
const COUNTER_APP_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Counter App</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
h1 { font-size: 2rem; margin-bottom: 1rem; }
.counter { font-size: 6rem; font-weight: bold; margin: 1rem 0; }
.buttons { display: flex; gap: 1rem; }
button { font-size: 2rem; width: 64px; height: 64px; border: none; border-radius: 50%; cursor: pointer; background: rgba(255,255,255,0.2); color: white; transition: background 0.2s; }
button:hover { background: rgba(255,255,255,0.4); }
</style>
</head>
<body>
<h1>Counter</h1>
<div class="counter" id="count">0</div>
<div class="buttons">
<button id="dec" onclick="update(-1)">−</button>
<button id="inc" onclick="update(1)">+</button>
</div>
<script>
let count = 0;
function update(d) { count += d; document.getElementById('count').textContent = count; }
</script>
</body>
</html>`;

const HELLO_WORLD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Hello World</title>
<style>
body { margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }
h1 { font-size: 4rem; color: white; font-family: system-ui; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); }
</style>
</head>
<body><h1>Hello World</h1></body>
</html>`;

/** Build a streaming SSE response body in Anthropic's format */
function buildAnthropicStreamBody(content: string): string {
  const chunks: string[] = [];

  // message_start
  chunks.push(`data: ${JSON.stringify({
    type: 'message_start',
    message: { id: 'msg_mock', type: 'message', role: 'assistant', content: [], model: 'claude-haiku-4-5-20251001' },
  })}\n\n`);

  // content_block_start
  chunks.push(`data: ${JSON.stringify({
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'text', text: '' },
  })}\n\n`);

  // Split into ~80 char chunks to simulate token streaming
  for (let i = 0; i < content.length; i += 80) {
    const piece = content.slice(i, i + 80);
    chunks.push(`data: ${JSON.stringify({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: piece },
    })}\n\n`);
  }

  // content_block_stop
  chunks.push(`data: ${JSON.stringify({
    type: 'content_block_stop',
    index: 0,
  })}\n\n`);

  // message_delta
  chunks.push(`data: ${JSON.stringify({
    type: 'message_delta',
    delta: { stop_reason: 'end_turn' },
  })}\n\n`);

  // message_stop
  chunks.push(`data: ${JSON.stringify({
    type: 'message_stop',
  })}\n\n`);

  return chunks.join('');
}

/** Build a non-streaming JSON response in Anthropic's format */
function buildAnthropicJsonResponse(content: string) {
  return JSON.stringify({
    id: 'msg_mock',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: content }],
    model: 'claude-haiku-4-5-20251001',
    stop_reason: 'end_turn',
  });
}

/** Track which call number we're on to return the right phase response */
let callCounter = 0;
let currentAppHtml = COUNTER_APP_HTML;

export function resetMockState(appType: 'counter' | 'hello' = 'counter') {
  callCounter = 0;
  currentAppHtml = appType === 'hello' ? HELLO_WORLD_HTML : COUNTER_APP_HTML;
}

/**
 * Mock all Anthropic API calls with realistic responses for each pipeline phase.
 * Call order: clarification (JSON) → planning (streamed JSON) → coding (streamed HTML) →
 *             code review (JSON) → visual review (JSON) → agent test plan (JSON) → agent validate (JSON)
 */
export async function mockAnthropicApi(page: Page) {
  // Mock /v1/messages for all pipeline phases
  await page.route('**/api.anthropic.com/v1/messages', (route: Route) => {
    const request = route.request();
    let body: string;
    try {
      body = request.postData() || '{}';
    } catch {
      body = '{}';
    }

    const isStreaming = body.includes('"stream":true') || body.includes('"stream": true');
    callCounter++;

    // Detect phase from request content
    const hasImages = body.includes('"type":"image"') || body.includes('"type": "image"');
    const hasClarification = body.includes('clarif') && body.includes('question');
    const hasCodeReview = body.includes('code review') || body.includes('review the following');
    const hasAgentTest = body.includes('appforge-agent') || body.includes('test interactions');
    const hasAgentValidate = body.includes('Did the interaction work');

    // Agent test validation — return pass
    if (hasAgentValidate) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: buildAnthropicJsonResponse(JSON.stringify({
          passed: true,
          reasoning: 'The interaction worked as expected',
        })),
      });
      return;
    }

    // Agent test plan — return 2 simple test cases
    if (hasAgentTest) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: buildAnthropicJsonResponse(JSON.stringify({
          tests: [
            { action: 'click', text: '+', expectation: 'Counter should increment to 1', delay: 1000 },
            { action: 'click', text: '−', expectation: 'Counter should decrement back to 0', delay: 1000 },
          ],
        })),
      });
      return;
    }

    // Visual review — return "looks good"
    if (hasImages) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: buildAnthropicJsonResponse(JSON.stringify({
          needsImprovement: false,
          scores: {
            character: { score: 8, issue: null },
            environment: { score: 8, issue: null },
            ui: { score: 9, issue: null },
            polish: { score: 8, issue: null },
            match: { score: 9, issue: null },
          },
          improvements: [],
          summary: 'Good quality, no improvements needed',
        })),
      });
      return;
    }

    // Code review — return no critical bugs
    if (hasCodeReview) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: buildAnthropicJsonResponse(JSON.stringify({
          hasCriticalBugs: false,
          bugs: [],
          summary: 'Code looks clean, no critical bugs found',
        })),
      });
      return;
    }

    // Non-streaming, non-image = clarification or misc JSON phase
    if (!isStreaming) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: buildAnthropicJsonResponse(JSON.stringify({
          questions: [
            {
              id: 'q1',
              question: 'What color scheme do you prefer?',
              options: ['Vibrant & colorful', 'Dark mode', 'Light & minimal'],
              default: 'Vibrant & colorful',
            },
          ],
        })),
      });
      return;
    }

    // Streaming — check if it's planning (uses smart model) or coding
    const isSmartModel = body.includes('claude-sonnet') || body.includes('claude-sonnet-4-5');

    if (isSmartModel) {
      // Planning phase — streamed JSON spec
      const plan = JSON.stringify({
        name: 'Counter App',
        icon: '🔢',
        description: 'A simple counter with increment and decrement',
        screens: [{ id: 'main', name: 'Main', purpose: 'Counter display', wireframe: '', components: ['counter', 'buttons'], interactions: ['tap +', 'tap -'] }],
        flows: [{ id: 'f1', name: 'Count', steps: ['tap button', 'update display'], fromScreen: 'main', toScreen: 'main' }],
        designSystem: {
          colorPalette: { primary: '#667eea', background: '#764ba2', text: '#ffffff' },
          typography: { heading: 'system-ui', body: 'system-ui' },
          spacing: '8px',
          borderRadius: '12px',
          style: 'gradient',
        },
        implementationNotes: 'Simple counter with CSS gradient background',
        testCases: [{ id: 't1', type: 'functional', description: 'Counter increments', steps: ['click +'], expected: 'counter shows 1', status: 'pending' }],
      });

      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: buildAnthropicStreamBody(plan),
      });
      return;
    }

    // Streaming non-smart model = coding phase (or iteration)
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: buildAnthropicStreamBody(currentAppHtml),
    });
  });
}
