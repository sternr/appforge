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

/** Build a streaming SSE response body from a string, chunk by chunk */
function buildStreamBody(content: string): string {
  const chunks: string[] = [];
  // Split into ~80 char chunks to simulate token streaming
  for (let i = 0; i < content.length; i += 80) {
    const piece = content.slice(i, i + 80);
    chunks.push(`data: ${JSON.stringify({
      choices: [{ delta: { content: piece }, finish_reason: null }],
    })}\n\n`);
  }
  chunks.push(`data: ${JSON.stringify({
    choices: [{ delta: {}, finish_reason: 'stop' }],
  })}\n\n`);
  chunks.push('data: [DONE]\n\n');
  return chunks.join('');
}

/** Build a non-streaming JSON response */
function buildJsonResponse(content: string) {
  return JSON.stringify({
    choices: [{
      message: { role: 'assistant', content },
      finish_reason: 'stop',
    }],
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
 * Mock all OpenAI API calls with realistic responses for each pipeline phase.
 * Call order: clarification (JSON) → planning (streamed JSON) → coding (streamed HTML) → visual review (JSON)
 */
export async function mockOpenAIApi(page: Page) {
  // Mock /v1/models for onboarding validation
  await page.route('**/api.openai.com/v1/models', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [{ id: 'gpt-4o' }] }),
    });
  });

  // Mock /v1/chat/completions for all pipeline phases
  await page.route('**/api.openai.com/v1/chat/completions', (route: Route) => {
    const request = route.request();
    let body: string;
    try {
      body = request.postData() || '{}';
    } catch {
      body = '{}';
    }

    const isStreaming = body.includes('"stream":true') || body.includes('"stream": true');
    callCounter++;

    // Determine which phase based on call order and content
    const isJsonMode = body.includes('"response_format"') && body.includes('"json_object"');
    const hasImages = body.includes('"image_url"');

    if (hasImages) {
      // Visual review phase — return "looks good" so no extra iteration
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: buildJsonResponse(JSON.stringify({
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

    if (isJsonMode && !isStreaming) {
      // Non-streaming JSON = clarification phase
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: buildJsonResponse(JSON.stringify({
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

    if (isJsonMode && isStreaming) {
      // Streaming JSON = planning phase
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
        body: buildStreamBody(plan),
      });
      return;
    }

    if (isStreaming) {
      // Streaming non-JSON = coding phase (or iteration)
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: buildStreamBody(currentAppHtml),
      });
      return;
    }

    // Fallback
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: buildJsonResponse('OK'),
    });
  });
}
