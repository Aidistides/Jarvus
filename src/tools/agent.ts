import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { readFileSync } from 'fs';
import * as cfg from './config.js';
import { loadFacts, loadDecisions, loadLearnings, loadRecentTranscript } from './memory.js';
import { KnowledgeStore } from './knowledge.js';
import { allTools } from './tools/index.js';

function loadSystemPromptFile(): string {
  try {
    return readFileSync(cfg.SYSTEM_PROMPT_FILE, 'utf-8');
  } catch {
    return 'You are Root, the intelligence agent for Enotrium Syndicate.';
  }
}

function formatMemoryContext(): string {
  const sections: string[] = [];

  const decisions = loadDecisions();
  const active = decisions.filter(d => d.status === 'active');
  const recentDecisions = active
    .sort((a, b) => String(b.timestamp ?? '').localeCompare(String(a.timestamp ?? '')))
    .slice(0, cfg.MAX_DECISIONS_IN_PROMPT);
  if (recentDecisions.length) {
    const lines = recentDecisions.map(d =>
      `- ${d.decision} (by ${d.made_by}, ${String(d.timestamp).slice(0, 10)})`
    );
    sections.push('## Recent Decisions\n' + lines.join('\n'));
  }

  const learnings = loadLearnings();
  const topLearnings = learnings
    .sort((a, b) => -(Number(a.confidence ?? 0) - Number(b.confidence ?? 0)))
    .slice(0, cfg.MAX_LEARNINGS_IN_PROMPT);
  if (topLearnings.length) {
    const lines = topLearnings.map(l => `- ${l.content} (confidence: ${l.confidence})`);
    sections.push('## Key Learnings\n' + lines.join('\n'));
  }

  const facts = loadFacts();
  const recentFacts = facts
    .sort((a, b) => String(b.timestamp ?? '').localeCompare(String(a.timestamp ?? '')))
    .slice(0, cfg.MAX_FACTS_IN_PROMPT);
  if (recentFacts.length) {
    const lines = recentFacts.map(f => `- ${f.fact} (source: ${f.source})`);
    sections.push('## Key Facts\n' + lines.join('\n'));
  }

  return sections.join('\n\n');
}

async function formatRagContext(userMessage: string): Promise<string> {
  try {
    const store = new KnowledgeStore();
    const results = await store.query(userMessage, cfg.RAG_TOP_K);
    if (!results.length) return '';

    const chunks = results.map(r => {
      const source = r.metadata.source_file ?? 'unknown';
      return `[Source: ${source}]\n${r.text}`;
    });
    return '## Relevant Documents\n\n' + chunks.join('\n\n---\n\n');
  } catch (e) {
    console.warn(`RAG retrieval failed: ${e}`);
    return '';
  }
}

export async function buildSystemPrompt(userId: string, userMessage: string): Promise<string> {
  let systemPrompt = loadSystemPromptFile();

  const memoryContext = formatMemoryContext();
  if (memoryContext) systemPrompt += '\n\n' + memoryContext;

  const ragContext = await formatRagContext(userMessage);
  if (ragContext) systemPrompt += '\n\n' + ragContext;

  return systemPrompt;
}

export function formatToolStatus(toolCall: { toolName: string; args: Record<string, unknown> }): string {
  const { toolName, args } = toolCall;

  switch (toolName) {
    case 'github_list_repos':
      return `Listing repos for ${args.owner}...`;
    case 'github_list_directory':
      return `Browsing ${args.owner}/${args.repo}/${args.path || ''}...`;
    case 'github_read_file':
      return `Reading ${args.path} in ${args.owner}/${args.repo}...`;
    case 'github_search_code':
      return `Searching code: "${args.query}"${args.owner ? ` in ${args.owner}` : ''}...`;
    case 'github_get_commit_history':
      return `Viewing commits for ${args.owner}/${args.repo}${args.path ? `/${args.path}` : ''}...`;
    default:
      return `Running ${toolName}...`;
  }
}

export async function getResponse(
  userId: string,
  userName: string,
  userMessage: string,
  onStatusChange: (status: string) => Promise<void>,
): Promise<string> {
  const systemPrompt = await buildSystemPrompt(userId, userMessage);
  const history = loadRecentTranscript(userId, cfg.MAX_HISTORY_MESSAGES);

  const messages = history.map(m => ({
    role: m.role as 'user' | 'assistant',
    content: String(m.content),
  }));

  try {
    const result = await generateText({
      model: openai(cfg.CHAT_MODEL),
      system: systemPrompt,
      messages: [...messages, { role: 'user' as const, content: userMessage }],
      tools: allTools,
      maxSteps: cfg.MAX_STEPS,
      temperature: 0.7,
      providerOptions: {
        openai: { maxCompletionTokens: 2000 },
      },
      onStepFinish: async (stepResult) => {
        if (stepResult.toolCalls?.length) {
          const call = stepResult.toolCalls[0];
          await onStatusChange(formatToolStatus({
            toolName: call.toolName,
            args: call.args as Record<string, unknown>,
          }));
        }
      },
    });

    return result.text;
  } catch (e) {
    console.error(`Agent error: ${e}`);
    return `Sorry, I hit an error: ${e}`;
  }
}
