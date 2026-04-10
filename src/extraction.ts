import OpenAI from 'openai';
import * as cfg from './config.js';
import { appendFact, appendDecision, appendLearning } from './memory.js';

const EXTRACTION_PROMPT = `Analyze this conversation and extract any new information. Return a JSON object with three arrays:

{
  "facts": [{"fact": "...", "source": "conversation with {user}"}],
  "decisions": [{"decision": "...", "made_by": "{user}", "context": "..."}],
  "learnings": [{"content": "...", "confidence": 0.0-1.0}]
}

Rules:
- Only extract genuinely new, specific information — not generic statements
- Facts are concrete data points (numbers, dates, names, statuses)
- Decisions are choices the team has made about what to do
- Learnings are insights that would inform future responses
- If nothing worth extracting, return empty arrays
- Return ONLY the JSON, no other text`;

interface ExtractionResult {
  facts: Array<{ fact: string; source?: string }>;
  decisions: Array<{ decision: string; made_by?: string; context?: string }>;
  learnings: Array<{ content: string; confidence?: number }>;
}

export function parseExtractionResponse(raw: string): ExtractionResult {
  try {
    let text = raw.trim();
    if (text.startsWith('```')) {
      text = text.split('\n').slice(1).join('\n');
      if (text.endsWith('```')) text = text.slice(0, -3);
      text = text.trim();
      if (text.startsWith('json')) text = text.slice(4).trim();
    }
    const data = JSON.parse(text);
    return {
      facts: data.facts ?? [],
      decisions: data.decisions ?? [],
      learnings: data.learnings ?? [],
    };
  } catch {
    return { facts: [], decisions: [], learnings: [] };
  }
}

export async function extractFromConversation(
  messages: Array<{ role: string; content: string }>,
  userName: string
): Promise<void> {
  if (messages.length < 2) return;

  const conversationText = messages
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n');

  const prompt = EXTRACTION_PROMPT.replace(/{user}/g, userName);

  try {
    const client = new OpenAI({ apiKey: cfg.OPENAI_API_KEY });
    const response = await client.chat.completions.create({
      model: cfg.CHAT_MODEL,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: conversationText },
      ],
      temperature: 0.1,
      max_completion_tokens: 1000,
    });

    const raw = response.choices[0].message.content ?? '';
    const extracted = parseExtractionResponse(raw);

    for (const fact of extracted.facts) {
      appendFact(fact.fact, fact.source ?? `conversation with ${userName}`);
    }
    for (const decision of extracted.decisions) {
      appendDecision(
        decision.decision,
        decision.made_by ?? userName,
        decision.context ?? '',
      );
    }
    for (const learning of extracted.learnings) {
      appendLearning(learning.content, `conversation with ${userName}`, learning.confidence ?? 0.8);
    }

    console.log(
      `Extracted ${extracted.facts.length} facts, ` +
      `${extracted.decisions.length} decisions, ` +
      `${extracted.learnings.length} learnings from conversation with ${userName}`
    );
  } catch (e) {
    console.error(`Extraction failed: ${e}`);
  }
}
