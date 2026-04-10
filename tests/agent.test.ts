import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';

const TMP_DIR = join(process.cwd(), '.test-tmp-agent');

beforeEach(async () => {
  mkdirSync(join(TMP_DIR, 'memory', 'transcripts'), { recursive: true });
  mkdirSync(join(TMP_DIR, 'knowledge', 'chroma'), { recursive: true });
  writeFileSync(join(TMP_DIR, 'system-prompt.md'), 'You are Root, Enotrium\'s intelligence agent.');
  writeFileSync(join(TMP_DIR, 'memory', 'facts.json'), '[]');
  writeFileSync(join(TMP_DIR, 'memory', 'decisions.json'), '[]');
  writeFileSync(join(TMP_DIR, 'memory', 'learnings.json'), '[]');
  writeFileSync(join(TMP_DIR, 'knowledge', 'registry.json'), '[]');

  const cfg = await import('../src/config.js');
  (cfg as any).DATA_DIR = TMP_DIR;
  (cfg as any).SYSTEM_PROMPT_FILE = join(TMP_DIR, 'system-prompt.md');
  (cfg as any).FACTS_FILE = join(TMP_DIR, 'memory', 'facts.json');
  (cfg as any).DECISIONS_FILE = join(TMP_DIR, 'memory', 'decisions.json');
  (cfg as any).LEARNINGS_FILE = join(TMP_DIR, 'memory', 'learnings.json');
  (cfg as any).TRANSCRIPTS_DIR = join(TMP_DIR, 'memory', 'transcripts');
  (cfg as any).CHROMA_DIR = join(TMP_DIR, 'knowledge', 'chroma');
  (cfg as any).REGISTRY_FILE = join(TMP_DIR, 'knowledge', 'registry.json');
});

afterEach(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('buildSystemPrompt', () => {
  it('should include system prompt text', async () => {
    const { buildSystemPrompt } = await import('../src/agent.js');
    const prompt = await buildSystemPrompt('123', 'test question');
    expect(prompt).toContain('Root');
  });

  it('should include memory context when facts exist', async () => {
    const { appendFact } = await import('../src/memory.js');
    appendFact('Test fact about hemp', 'test');

    const { buildSystemPrompt } = await import('../src/agent.js');
    const prompt = await buildSystemPrompt('123', 'Tell me about decisions');
    expect(prompt).toContain('Test fact about hemp');
  });
});

describe('formatToolStatus', () => {
  it('should format github_read_file tool calls', async () => {
    const { formatToolStatus } = await import('../src/agent.js');
    const status = formatToolStatus({
      toolName: 'github_read_file',
      args: { owner: 'EnotriumSyndicate', repo: 'aip', path: 'src/main.py' },
    });
    expect(status).toContain('src/main.py');
  });

  it('should format github_list_repos tool calls', async () => {
    const { formatToolStatus } = await import('../src/agent.js');
    const status = formatToolStatus({
      toolName: 'github_list_repos',
      args: { owner: 'EnotriumSyndicate' },
    });
    expect(status).toContain('EnotriumSyndicate');
  });

  it('should format github_search_code tool calls', async () => {
    const { formatToolStatus } = await import('../src/agent.js');
    const status = formatToolStatus({
      toolName: 'github_search_code',
      args: { query: 'import flask', owner: 'EnotriumSyndicate' },
    });
    expect(status).toContain('import flask');
  });

  it('should handle unknown tool names', async () => {
    const { formatToolStatus } = await import('../src/agent.js');
    const status = formatToolStatus({
      toolName: 'some_future_tool',
      args: {},
    });
    expect(status).toContain('some_future_tool');
  });
});
