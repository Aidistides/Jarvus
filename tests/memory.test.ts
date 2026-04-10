import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import * as cfg from '../src/config.js';

const TMP_DIR = join(process.cwd(), '.test-tmp-memory');

beforeEach(() => {
  mkdirSync(join(TMP_DIR, 'memory', 'transcripts'), { recursive: true });
  writeFileSync(join(TMP_DIR, 'memory', 'facts.json'), '[]');
  writeFileSync(join(TMP_DIR, 'memory', 'decisions.json'), '[]');
  writeFileSync(join(TMP_DIR, 'memory', 'learnings.json'), '[]');

  // Override config paths
  (cfg as any).FACTS_FILE = join(TMP_DIR, 'memory', 'facts.json');
  (cfg as any).DECISIONS_FILE = join(TMP_DIR, 'memory', 'decisions.json');
  (cfg as any).LEARNINGS_FILE = join(TMP_DIR, 'memory', 'learnings.json');
  (cfg as any).TRANSCRIPTS_DIR = join(TMP_DIR, 'memory', 'transcripts');
});

afterEach(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('facts', () => {
  it('should append and load facts', async () => {
    const { appendFact, loadFacts } = await import('../src/memory.js');
    appendFact('Enotrium has 2,008 entities', 'test');
    const facts = loadFacts();
    expect(facts).toHaveLength(1);
    expect(facts[0].fact).toBe('Enotrium has 2,008 entities');
    expect(facts[0].source).toBe('test');
    expect(facts[0].id).toBeDefined();
    expect(facts[0].timestamp).toBeDefined();
  });
});

describe('decisions', () => {
  it('should append and load decisions', async () => {
    const { appendDecision, loadDecisions } = await import('../src/memory.js');
    appendDecision('Price stays at $X until Q3', 'aiden', 'pricing discussion');
    const decisions = loadDecisions();
    expect(decisions).toHaveLength(1);
    expect(decisions[0].made_by).toBe('aiden');
    expect(decisions[0].status).toBe('active');
  });
});

describe('learnings', () => {
  it('should append and load learnings', async () => {
    const { appendLearning, loadLearnings } = await import('../src/memory.js');
    appendLearning('BBI ISO cert completed Aug 2023', 'convo', 0.9);
    const learnings = loadLearnings();
    expect(learnings).toHaveLength(1);
    expect(learnings[0].confidence).toBe(0.9);
  });
});

describe('transcripts', () => {
  it('should save and load transcript', async () => {
    const { saveTranscript, loadRecentTranscript } = await import('../src/memory.js');
    saveTranscript('123', 'user', 'Hello Root');
    saveTranscript('123', 'assistant', 'Hey!');
    const history = loadRecentTranscript('123', 10);
    expect(history).toHaveLength(2);
    expect(history[0].role).toBe('user');
    expect(history[1].role).toBe('assistant');
  });
});
