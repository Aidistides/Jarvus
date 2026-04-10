import { describe, it, expect } from 'vitest';
import { parseExtractionResponse } from '../src/extraction.js';

describe('parseExtractionResponse', () => {
  it('should parse valid JSON response', () => {
    const raw = JSON.stringify({
      facts: [{ fact: 'BBI has 76 employees', source: 'conversation' }],
      decisions: [{ decision: 'Use hemp fiber for Q3', made_by: 'aiden', context: 'strategy call' }],
      learnings: [{ content: 'ISO cert takes 6 months', confidence: 0.85 }],
    });
    const result = parseExtractionResponse(raw);
    expect(result.facts).toHaveLength(1);
    expect(result.decisions).toHaveLength(1);
    expect(result.learnings).toHaveLength(1);
  });

  it('should handle empty arrays', () => {
    const raw = JSON.stringify({ facts: [], decisions: [], learnings: [] });
    const result = parseExtractionResponse(raw);
    expect(result.facts).toHaveLength(0);
  });

  it('should handle invalid JSON gracefully', () => {
    const result = parseExtractionResponse('not json at all');
    expect(result.facts).toEqual([]);
    expect(result.decisions).toEqual([]);
    expect(result.learnings).toEqual([]);
  });

  it('should handle markdown-wrapped JSON', () => {
    const raw = '```json\n{"facts": [{"fact": "test", "source": "x"}], "decisions": [], "learnings": []}\n```';
    const result = parseExtractionResponse(raw);
    expect(result.facts).toHaveLength(1);
  });
});
