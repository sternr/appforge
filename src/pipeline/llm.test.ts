import { describe, it, expect, vi, beforeEach } from 'vitest';
import { streamChat, chatComplete } from './llm.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function createAnthropicStreamResponse(tokens: string[]) {
  const chunks: string[] = [];

  // message_start
  chunks.push(`data: ${JSON.stringify({
    type: 'message_start',
    message: { id: 'msg_test', type: 'message', role: 'assistant', content: [], model: 'claude-haiku-4-5-20251001' },
  })}\n\n`);

  // content_block_start
  chunks.push(`data: ${JSON.stringify({
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'text', text: '' },
  })}\n\n`);

  // content_block_delta for each token
  for (const token of tokens) {
    chunks.push(`data: ${JSON.stringify({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: token },
    })}\n\n`);
  }

  // content_block_stop
  chunks.push(`data: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}\n\n`);

  // message_stop
  chunks.push(`data: ${JSON.stringify({ type: 'message_stop' })}\n\n`);

  const encoder = new TextEncoder();
  let index = 0;

  const stream = new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });

  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

function createAnthropicJsonResponse(text: string) {
  return new Response(JSON.stringify({
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text }],
    model: 'claude-haiku-4-5-20251001',
    stop_reason: 'end_turn',
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('LLM Client (Anthropic)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('streamChat', () => {
    it('should stream tokens and return full text', async () => {
      mockFetch.mockResolvedValue(createAnthropicStreamResponse(['Hello', ' ', 'World']));

      const tokens: string[] = [];
      const result = await streamChat(
        'sk-ant-test',
        [{ role: 'user', content: 'hi' }],
        { onToken: (t) => tokens.push(t) }
      );

      expect(result).toBe('Hello World');
      expect(tokens).toEqual(['Hello', ' ', 'World']);
    });

    it('should throw on API error', async () => {
      mockFetch.mockResolvedValue(new Response('Unauthorized', { status: 401 }));

      await expect(
        streamChat('sk-ant-bad', [{ role: 'user', content: 'hi' }])
      ).rejects.toThrow(/401/);
    });

    it('should call onDone with full text', async () => {
      mockFetch.mockResolvedValue(createAnthropicStreamResponse(['abc', 'def']));

      let doneText = '';
      await streamChat('sk-ant-test', [{ role: 'user', content: 'hi' }], {
        onDone: (text) => { doneText = text; },
      });

      expect(doneText).toBe('abcdef');
    });

    it('should use correct API URL and headers', async () => {
      mockFetch.mockResolvedValue(createAnthropicStreamResponse(['ok']));

      await streamChat('sk-ant-my-key', [{ role: 'user', content: 'test' }]);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': 'sk-ant-my-key',
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          }),
        })
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.stream).toBe(true);
    });

    it('should extract system message to top-level param', async () => {
      mockFetch.mockResolvedValue(createAnthropicStreamResponse(['ok']));

      await streamChat('sk-ant-key', [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'hi' },
      ]);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.system).toBe('You are helpful');
      expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
    });

    it('should use specified model', async () => {
      mockFetch.mockResolvedValue(createAnthropicStreamResponse(['ok']));

      await streamChat('sk-ant-key', [{ role: 'user', content: 'test' }], {}, { model: 'claude-sonnet-4-5-20250514' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.model).toBe('claude-sonnet-4-5-20250514');
    });
  });

  describe('chatComplete', () => {
    it('should return the complete response text', async () => {
      mockFetch.mockResolvedValue(createAnthropicJsonResponse('Hello back!'));

      const result = await chatComplete('sk-ant-test', [{ role: 'user', content: 'hi' }]);
      expect(result).toBe('Hello back!');
    });

    it('should handle multiple text blocks', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          content: [
            { type: 'text', text: 'Part 1' },
            { type: 'text', text: ' Part 2' },
          ],
          model: 'claude-haiku-4-5-20251001',
          stop_reason: 'end_turn',
        }), { status: 200 })
      );

      const result = await chatComplete('sk-ant-test', [{ role: 'user', content: 'hi' }]);
      expect(result).toBe('Part 1 Part 2');
    });

    it('should throw on API error', async () => {
      mockFetch.mockResolvedValue(new Response('Bad Request', { status: 400 }));

      await expect(
        chatComplete('sk-ant-test', [{ role: 'user', content: 'hi' }])
      ).rejects.toThrow(/400/);
    });
  });
});
