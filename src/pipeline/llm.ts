// ─── Anthropic Claude API ───

export interface ChatMessageTextContent {
  type: 'text';
  text: string;
}

export interface ChatMessageImageContent {
  type: 'image';
  source: { type: 'base64'; media_type: string; data: string };
}

export type ChatMessageContent = string | (ChatMessageTextContent | ChatMessageImageContent)[];

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: ChatMessageContent;
}

export interface StreamCallbacks {
  onToken?: (token: string) => void;
  onDone?: (fullText: string) => void;
  onError?: (error: Error) => void;
}

export interface ChatOptions {
  jsonMode?: boolean;
  model?: string;
  maxTokens?: number;
}

/** Model for planning — best reasoning to produce detailed, high-quality specs */
export const MODEL_SMART = 'claude-sonnet-4-20250514';
/** Model for everything else — code generation, iteration, review, clarification */
export const MODEL_FAST = 'claude-haiku-4-5-20251001';

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

/**
 * Convert our internal ChatMessage[] to Anthropic's format.
 * Anthropic uses a top-level `system` param instead of a system message.
 */
function prepareMessages(messages: ChatMessage[]): {
  system: string | undefined;
  messages: Array<{ role: 'user' | 'assistant'; content: ChatMessageContent }>;
} {
  let system: string | undefined;
  const filtered: Array<{ role: 'user' | 'assistant'; content: ChatMessageContent }> = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      system = typeof msg.content === 'string' ? msg.content : msg.content.map(c => c.type === 'text' ? c.text : '').join('\n');
    } else {
      filtered.push({ role: msg.role, content: msg.content });
    }
  }

  return { system, messages: filtered };
}

/**
 * Stream a chat completion from Anthropic Claude.
 * Yields tokens as they arrive.
 */
export async function streamChat(
  apiKey: string,
  messages: ChatMessage[],
  callbacks: StreamCallbacks = {},
  options: ChatOptions = {}
): Promise<string> {
  const { model = MODEL_FAST, maxTokens = 16384 } = options;
  const { system, messages: apiMessages } = prepareMessages(messages);

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages: apiMessages,
    stream: true,
  };

  if (system) {
    body.system = system;
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': API_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const err = new Error(`Claude API error ${response.status}: ${errorText}`);
    callbacks.onError?.(err);
    throw err;
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;

      try {
        const json = JSON.parse(trimmed.slice(6));

        // Anthropic SSE: content_block_delta has the text tokens
        if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
          const token = json.delta.text;
          if (token) {
            fullText += token;
            callbacks.onToken?.(token);
          }
        }
      } catch {
        // Skip malformed chunks
      }
    }
  }

  callbacks.onDone?.(fullText);
  return fullText;
}

/**
 * Non-streaming chat completion.
 */
export async function chatComplete(
  apiKey: string,
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<string> {
  const { model = MODEL_FAST, maxTokens = 4096 } = options;
  const { system, messages: apiMessages } = prepareMessages(messages);

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages: apiMessages,
  };

  if (system) {
    body.system = system;
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': API_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error ${response.status}: ${errorText}`);
  }

  const json = await response.json();
  // Anthropic returns content as an array of content blocks
  const textBlocks = json.content?.filter((b: { type: string }) => b.type === 'text') ?? [];
  return textBlocks.map((b: { text: string }) => b.text).join('');
}
