import { tool } from 'ai';
import { z } from 'zod';

const MAX_BODY_LENGTH = 10000;

export const httpTools = {
  http_request: tool({
    description:
      'Make an HTTP request to any URL. Use this to interact with external APIs, fetch documentation, or communicate with other agents.',
    parameters: z.object({
      url: z.string().describe('The full URL to send the request to'),
      method: z
        .enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])
        .describe('HTTP method (GET, POST, PUT, DELETE, PATCH)'),
      headers: z
        .string()
        .describe('Request headers as JSON string, e.g. {"Content-Type": "application/json", "Authorization": "Bearer tok"}. Pass "{}" if no headers needed'),
      body: z
        .string()
        .describe('Request body (for POST/PUT/PATCH). Pass empty string if not needed'),
    }),
    execute: async ({ url, method, headers: headersStr, body }) => {
      try {
        const headers = JSON.parse(headersStr || '{}');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout
        const res = await fetch(url, {
          method,
          headers,
          body: ['POST', 'PUT', 'PATCH'].includes(method) ? body : undefined,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        let responseBody = await res.text();
        const truncated = responseBody.length > MAX_BODY_LENGTH;
        if (truncated) {
          responseBody = responseBody.slice(0, MAX_BODY_LENGTH) + '\n... [truncated]';
        }

        const responseHeaders: Record<string, string> = {};
        res.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        return {
          status: res.status,
          statusText: res.statusText,
          headers: responseHeaders,
          body: responseBody,
          truncated,
        };
      } catch (e: any) {
        return { error: `HTTP request failed: ${e.message}` };
      }
    },
  }),
};
