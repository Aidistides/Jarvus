import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import * as cfg from './config.js';

interface MemoryEntry {
  id: string;
  timestamp: string;
  [key: string]: unknown;
}

function loadJson(path: string): MemoryEntry[] {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return [];
  }
}

function saveJson(path: string, data: MemoryEntry[]): void {
  writeFileSync(path, JSON.stringify(data, null, 2));
}

function now(): string {
  return new Date().toISOString();
}

function shortId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 6)}`;
}

// --- Facts ---

export function loadFacts(): MemoryEntry[] {
  return loadJson(cfg.FACTS_FILE);
}

export function appendFact(fact: string, source: string): MemoryEntry {
  const facts = loadFacts();
  const entry: MemoryEntry = { id: shortId('f'), fact, source, timestamp: now() };
  facts.push(entry);
  saveJson(cfg.FACTS_FILE, facts);
  return entry;
}

// --- Decisions ---

export function loadDecisions(): MemoryEntry[] {
  return loadJson(cfg.DECISIONS_FILE);
}

export function appendDecision(
  decision: string, made_by: string, context: string, follow_up_date?: string
): MemoryEntry {
  const decisions = loadDecisions();
  const entry: MemoryEntry = {
    id: shortId('d'), decision, made_by, context,
    timestamp: now(), status: 'active', follow_up_date: follow_up_date ?? null,
  };
  decisions.push(entry);
  saveJson(cfg.DECISIONS_FILE, decisions);
  return entry;
}

// --- Learnings ---

export function loadLearnings(): MemoryEntry[] {
  return loadJson(cfg.LEARNINGS_FILE);
}

export function appendLearning(content: string, source: string, confidence = 0.8): MemoryEntry {
  const learnings = loadLearnings();
  const entry: MemoryEntry = { id: shortId('l'), content, source, timestamp: now(), confidence };
  learnings.push(entry);
  saveJson(cfg.LEARNINGS_FILE, learnings);
  return entry;
}

// --- Transcripts ---

export function saveTranscript(userId: string, role: string, content: string): void {
  const userDir = join(cfg.TRANSCRIPTS_DIR, userId);
  mkdirSync(userDir, { recursive: true });

  const today = new Date().toISOString().slice(0, 10);
  const filePath = join(userDir, `${today}.json`);

  const messages = loadJson(filePath);
  messages.push({ id: '', role, content, timestamp: now() });
  saveJson(filePath, messages);
}

export function loadRecentTranscript(userId: string, limit = 20): MemoryEntry[] {
  const userDir = join(cfg.TRANSCRIPTS_DIR, userId);
  if (!existsSync(userDir)) return [];

  const files = readdirSync(userDir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse();

  let allMessages: MemoryEntry[] = [];
  for (const f of files) {
    const messages = loadJson(join(userDir, f));
    allMessages = [...messages, ...allMessages];
    if (allMessages.length >= limit) break;
  }

  return allMessages.slice(-limit);
}
