# TypeScript Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the Enotrium AI agent from Python to TypeScript using the Vercel AI SDK, adding GitHub code exploration tools and a Telegram status message UX.

**Architecture:** Monolith mirror of the existing Python structure. Express server handles Telegram webhooks, Vercel AI SDK's `generateText` with `maxSteps` drives an autonomous tool-calling loop, Telegraf manages bot interactions with editable status messages, and ChromaDB JS client handles RAG. **Note:** ChromaDB's JS client only supports HTTP client mode (no embedded PersistentClient like Python), so ChromaDB runs as a sidecar server in the same container.

**Tech Stack:** Node 20, TypeScript (tsx), ai + @ai-sdk/openai, telegraf, chromadb, @octokit/rest, express, pdfjs-dist, xlsx, zod, vitest

---

## File Map

| File | Responsibility |
|------|----------------|
| `package.json` | Dependencies, scripts |
| `tsconfig.json` | TypeScript config |
| `src/config.ts` | Env vars, constants, directory setup |
| `src/memory.ts` | JSON-file transcript + structured memory (facts/decisions/learnings) |
| `src/knowledge.ts` | ChromaDB embedding store + query |
| `src/ingestion.ts` | Document text extraction, chunking, ingestion pipeline |
| `src/extraction.ts` | Post-conversation LLM extraction of facts/decisions/learnings |
| `src/tools/github.ts` | GitHub tool definitions (list repos, browse, read, search, commits) |
| `src/tools/index.ts` | Tool registry exporting all tools |
| `src/agent.ts` | System prompt construction, generateText loop with tools |
| `src/bot.ts` | Telegraf bot handlers, status message UX |
| `src/index.ts` | Express server, webhook route, startup |
| `Dockerfile` | Multi-stage: Node 20 + ChromaDB server |
| `start.sh` | Startup script: launches ChromaDB server then Node app |
| `tests/*.test.ts` | Vitest test files |

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.env.example` (update)

- [ ] **Step 1: Initialize package.json**

```bash
cd /Users/tanaynaik/Desktop/enotrium-ai
```

Create `package.json`:

```json
{
  "name": "enotrium-root",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "ai": "^4",
    "@ai-sdk/openai": "^1",
    "telegraf": "^4",
    "chromadb": "^1",
    "@octokit/rest": "^21",
    "express": "^5",
    "pdfjs-dist": "^4",
    "xlsx": "^0.18",
    "zod": "^3",
    "dotenv": "^16"
  },
  "devDependencies": {
    "@types/express": "^5",
    "@types/node": "^22",
    "tsx": "^4",
    "typescript": "^5",
    "vitest": "^3"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "resolveJsonModule": true,
    "declaration": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Install dependencies**

Run: `npm install`

- [ ] **Step 4: Commit**

```bash
git add package.json tsconfig.json package-lock.json
git commit -m "chore: scaffold TypeScript project with dependencies"
```

---

### Task 2: Config Module

**Files:**
- Create: `src/config.ts`
- Test: `tests/config.test.ts`

- [ ] **Step 1: Write the test**

Create `tests/config.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('config', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('should export required constants', async () => {
    const cfg = await import('../src/config.js');
    expect(cfg.CHAT_MODEL).toBe('gpt-5.4');
    expect(cfg.EMBEDDING_MODEL).toBe('text-embedding-3-small');
    expect(cfg.CHUNK_SIZE).toBe(500);
    expect(cfg.CHUNK_OVERLAP).toBe(50);
    expect(cfg.RAG_TOP_K).toBe(10);
    expect(cfg.MAX_HISTORY_MESSAGES).toBe(20);
    expect(cfg.MAX_STEPS).toBe(15);
  });

  it('should have allowed users', async () => {
    const cfg = await import('../src/config.js');
    expect(cfg.ALLOWED_USERS['aidistides']).toBe('aiden');
    expect(cfg.ALLOWED_USERS['tn_0123']).toBe('tanay');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write config.ts**

Create `src/config.ts`:

```typescript
import 'dotenv/config';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

// Environment
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';
export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
export const WEBHOOK_URL = process.env.WEBHOOK_URL ?? '';
export const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? '';
export const CHROMA_URL = process.env.CHROMA_URL ?? 'http://localhost:8000';
export const DATA_DIR = process.env.DATA_DIR ?? './data';

// Paths
export const MEMORY_DIR = join(DATA_DIR, 'memory');
export const KNOWLEDGE_DIR = join(DATA_DIR, 'knowledge');
export const CHROMA_DIR = join(KNOWLEDGE_DIR, 'chroma');
export const SOURCES_DIR = join(KNOWLEDGE_DIR, 'sources');
export const PROCESSED_DIR = join(KNOWLEDGE_DIR, 'processed');
export const TRANSCRIPTS_DIR = join(MEMORY_DIR, 'transcripts');

export const LEARNINGS_FILE = join(MEMORY_DIR, 'learnings.json');
export const DECISIONS_FILE = join(MEMORY_DIR, 'decisions.json');
export const FACTS_FILE = join(MEMORY_DIR, 'facts.json');
export const REGISTRY_FILE = join(KNOWLEDGE_DIR, 'registry.json');
export const SYSTEM_PROMPT_FILE = join(DATA_DIR, 'system-prompt.md');

// Models
export const CHAT_MODEL = 'gpt-5.4';
export const EMBEDDING_MODEL = 'text-embedding-3-small';

// RAG
export const CHUNK_SIZE = 500;
export const CHUNK_OVERLAP = 50;
export const RAG_TOP_K = 10;

// Conversation
export const MAX_HISTORY_MESSAGES = 20;
export const MAX_STEPS = 15;

// Memory in prompt
export const MAX_DECISIONS_IN_PROMPT = 10;
export const MAX_LEARNINGS_IN_PROMPT = 10;
export const MAX_FACTS_IN_PROMPT = 10;

// Allowed users: telegram username -> display name
export const ALLOWED_USERS: Record<string, string> = {
  aidistides: 'aiden',
  tn_0123: 'tanay',
};

export function ensureDirs(): void {
  const dirs = [MEMORY_DIR, TRANSCRIPTS_DIR, KNOWLEDGE_DIR, SOURCES_DIR, PROCESSED_DIR];
  for (const d of dirs) {
    mkdirSync(d, { recursive: true });
  }
  const jsonFiles = [LEARNINGS_FILE, DECISIONS_FILE, FACTS_FILE, REGISTRY_FILE];
  for (const f of jsonFiles) {
    if (!existsSync(f)) {
      writeFileSync(f, '[]');
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/config.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: add config module"
```

---

### Task 3: Memory Module

**Files:**
- Create: `src/memory.ts`
- Test: `tests/memory.test.ts`

- [ ] **Step 1: Write the tests**

Create `tests/memory.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import {
  loadFacts, appendFact,
  loadDecisions, appendDecision,
  loadLearnings, appendLearning,
  saveTranscript, loadRecentTranscript,
} from '../src/memory.js';
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
  it('should append and load facts', () => {
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
  it('should append and load decisions', () => {
    appendDecision('Price stays at $X until Q3', 'aiden', 'pricing discussion');
    const decisions = loadDecisions();
    expect(decisions).toHaveLength(1);
    expect(decisions[0].made_by).toBe('aiden');
    expect(decisions[0].status).toBe('active');
  });
});

describe('learnings', () => {
  it('should append and load learnings', () => {
    appendLearning('BBI ISO cert completed Aug 2023', 'convo', 0.9);
    const learnings = loadLearnings();
    expect(learnings).toHaveLength(1);
    expect(learnings[0].confidence).toBe(0.9);
  });
});

describe('transcripts', () => {
  it('should save and load transcript', () => {
    saveTranscript('123', 'user', 'Hello Root');
    saveTranscript('123', 'assistant', 'Hey!');
    const history = loadRecentTranscript('123', 10);
    expect(history).toHaveLength(2);
    expect(history[0].role).toBe('user');
    expect(history[1].role).toBe('assistant');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/memory.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write memory.ts**

Create `src/memory.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/memory.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/memory.ts tests/memory.test.ts
git commit -m "feat: add memory module (facts, decisions, learnings, transcripts)"
```

---

### Task 4: Knowledge Store

**Files:**
- Create: `src/knowledge.ts`
- Test: `tests/knowledge.test.ts`

- [ ] **Step 1: Write the tests**

Create `tests/knowledge.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';

const TMP_DIR = join(process.cwd(), '.test-tmp-knowledge');

beforeEach(async () => {
  mkdirSync(join(TMP_DIR, 'chroma'), { recursive: true });
  writeFileSync(join(TMP_DIR, 'registry.json'), '[]');

  const cfg = await import('../src/config.js');
  (cfg as any).CHROMA_DIR = join(TMP_DIR, 'chroma');
  (cfg as any).REGISTRY_FILE = join(TMP_DIR, 'registry.json');
});

afterEach(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

vi.mock('../src/knowledge.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/knowledge.js')>();
  return {
    ...mod,
    embed: vi.fn(async (texts: string[]) =>
      texts.map(() => new Array(1536).fill(0.01))
    ),
  };
});

describe('KnowledgeStore', () => {
  it('should add and query chunks', async () => {
    const { KnowledgeStore } = await import('../src/knowledge.js');
    const store = new KnowledgeStore();

    await store.addDocument('test.pdf', [
      'Enotrium builds hemp supply chain intelligence',
      '2,008 verified entities in the graph',
    ], { source_type: 'pdf', uploaded_by: 'tanay' });

    const results = await store.query('hemp supply chain', 2);
    expect(results.length).toBeGreaterThan(0);
  });

  it('should update registry', async () => {
    const { KnowledgeStore } = await import('../src/knowledge.js');
    const store = new KnowledgeStore();

    await store.addDocument('report.pdf', ['chunk one'], {
      source_type: 'pdf', uploaded_by: 'aiden',
    });

    const cfg = await import('../src/config.js');
    const registry = JSON.parse(readFileSync(cfg.REGISTRY_FILE, 'utf-8'));
    expect(registry).toHaveLength(1);
    expect(registry[0].source_file).toBe('report.pdf');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/knowledge.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write knowledge.ts**

Create `src/knowledge.ts`:

```typescript
import { readFileSync, writeFileSync } from 'fs';
import OpenAI from 'openai';
import { ChromaClient } from 'chromadb';
import * as cfg from './config.js';

const openai = new OpenAI({ apiKey: cfg.OPENAI_API_KEY });

// ChromaDB JS client connects over HTTP — requires ChromaDB server running
// In production, ChromaDB runs as a sidecar in the same container (see start.sh)
// CHROMA_URL defaults to http://localhost:8000
const chromaClient = new ChromaClient({ path: cfg.CHROMA_URL });

export async function embed(texts: string[]): Promise<number[][]> {
  const response = await openai.embeddings.create({
    model: cfg.EMBEDDING_MODEL,
    input: texts,
  });
  return response.data.map(item => item.embedding);
}

export class KnowledgeStore {
  private collectionName = 'enotrium_knowledge';

  private async getCollection() {
    return chromaClient.getOrCreateCollection({
      name: this.collectionName,
      metadata: { 'hnsw:space': 'cosine' },
    });
  }

  async addDocument(sourceFile: string, chunks: string[], metadata: Record<string, string>): Promise<void> {
    if (!chunks.length) return;

    const collection = await this.getCollection();
    const embeddings = await embed(chunks);
    const ids = chunks.map((_, i) => `${sourceFile}_${i}`);
    const metadatas = chunks.map((_, i) => ({
      source_file: sourceFile,
      source_type: metadata.source_type ?? 'text',
      uploaded_by: metadata.uploaded_by ?? 'unknown',
      uploaded_at: new Date().toISOString(),
      chunk_index: i.toString(),
    }));

    await collection.upsert({ ids, embeddings, documents: chunks, metadatas });
    this.updateRegistry(sourceFile, metadata, chunks.length);
  }

  async query(text: string, topK = 10): Promise<Array<{ id: string; text: string; metadata: Record<string, string>; distance: number | null }>> {
    const collection = await this.getCollection();
    const count = await collection.count();
    if (count === 0) return [];

    const embedding = (await embed([text]))[0];
    const results = await collection.query({
      queryEmbeddings: [embedding],
      nResults: Math.min(topK, count),
    });

    const output: Array<{ id: string; text: string; metadata: Record<string, string>; distance: number | null }> = [];
    const ids = results.ids[0];
    for (let i = 0; i < ids.length; i++) {
      output.push({
        id: ids[i],
        text: results.documents[0][i] ?? '',
        metadata: (results.metadatas?.[0]?.[i] as Record<string, string>) ?? {},
        distance: results.distances?.[0]?.[i] ?? null,
      });
    }
    return output;
  }

  async sourceCount(): Promise<number> {
    const registry = JSON.parse(readFileSync(cfg.REGISTRY_FILE, 'utf-8'));
    return registry.length;
  }

  private updateRegistry(sourceFile: string, metadata: Record<string, string>, chunkCount: number): void {
    const registry = JSON.parse(readFileSync(cfg.REGISTRY_FILE, 'utf-8'));
    registry.push({
      source_file: sourceFile,
      source_type: metadata.source_type ?? 'text',
      uploaded_by: metadata.uploaded_by ?? 'unknown',
      uploaded_at: new Date().toISOString(),
      chunk_count: chunkCount,
    });
    writeFileSync(cfg.REGISTRY_FILE, JSON.stringify(registry, null, 2));
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/knowledge.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/knowledge.ts tests/knowledge.test.ts
git commit -m "feat: add ChromaDB knowledge store"
```

---

### Task 5: Ingestion Pipeline

**Files:**
- Create: `src/ingestion.ts`
- Test: `tests/ingestion.test.ts`

- [ ] **Step 1: Write the tests**

Create `tests/ingestion.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { chunkText } from '../src/ingestion.js';

describe('chunkText', () => {
  it('should split long text into overlapping chunks', () => {
    const text = 'word '.repeat(600);
    const chunks = chunkText(text, 500, 50);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(2500);
    }
  });

  it('should return single chunk for short text', () => {
    const chunks = chunkText('hello world', 500, 50);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe('hello world');
  });

  it('should return empty array for empty text', () => {
    const chunks = chunkText('   ', 500, 50);
    expect(chunks).toHaveLength(0);
  });
});

describe('extractText', () => {
  it('should extract text from a .txt file', async () => {
    const { extractText } = await import('../src/ingestion.js');
    const { writeFileSync, mkdirSync, rmSync } = await import('fs');
    const { join } = await import('path');

    const tmpDir = join(process.cwd(), '.test-tmp-ingestion');
    mkdirSync(tmpDir, { recursive: true });
    const filePath = join(tmpDir, 'test.txt');
    writeFileSync(filePath, 'Hello, this is a test document about Enotrium.');

    const text = await extractText(filePath);
    expect(text).toContain('Enotrium');

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should extract text from a .csv file', async () => {
    const { extractText } = await import('../src/ingestion.js');
    const { writeFileSync, mkdirSync, rmSync } = await import('fs');
    const { join } = await import('path');

    const tmpDir = join(process.cwd(), '.test-tmp-ingestion-csv');
    mkdirSync(tmpDir, { recursive: true });
    const filePath = join(tmpDir, 'test.csv');
    writeFileSync(filePath, 'name,value\nhemp,100\nbamboo,200\n');

    const text = await extractText(filePath);
    expect(text).toContain('hemp');
    expect(text).toContain('bamboo');

    rmSync(tmpDir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/ingestion.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write ingestion.ts**

Create `src/ingestion.ts`:

```typescript
import { readFileSync, writeFileSync } from 'fs';
import { extname, basename, join } from 'path';
import { read, utils } from 'xlsx';
import * as cfg from './config.js';
import { KnowledgeStore } from './knowledge.js';

export async function extractText(filePath: string): Promise<string> {
  const ext = extname(filePath).toLowerCase();

  if (ext === '.pdf') {
    return extractPdf(filePath);
  } else if (['.xlsx', '.xls', '.xlt'].includes(ext)) {
    return extractSpreadsheet(filePath);
  } else if (ext === '.csv') {
    return extractCsv(filePath);
  } else {
    try {
      return readFileSync(filePath, 'utf-8');
    } catch {
      return '';
    }
  }
}

async function extractPdf(filePath: string): Promise<string> {
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const data = new Uint8Array(readFileSync(filePath));
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();
      const text = textContent.items.map((item: any) => item.str).join(' ');
      if (text.trim()) pages.push(text);
    }
    return pages.join('\n\n');
  } catch {
    return '';
  }
}

function extractSpreadsheet(filePath: string): string {
  try {
    const workbook = read(readFileSync(filePath));
    const parts: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = utils.sheet_to_csv(sheet);
      parts.push(`## Sheet: ${sheetName}\n${csv}`);
    }
    return parts.join('\n\n');
  } catch {
    return '';
  }
}

function extractCsv(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

export function chunkText(text: string, chunkSize = 500, overlap = 50): string[] {
  const charSize = chunkSize * 4;
  const charOverlap = overlap * 4;

  if (text.trim().length === 0) return [];
  if (text.length <= charSize) return [text];

  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = start + charSize;
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    start = end - charOverlap;
  }
  return chunks;
}

export async function ingestDocument(
  filePath: string,
  uploadedBy: string
): Promise<{ source_file: string; chunk_count: number; text_length?: number; error?: string }> {
  const text = await extractText(filePath);
  if (!text.trim()) {
    return { source_file: basename(filePath), chunk_count: 0, error: 'No text extracted' };
  }

  // Save processed text
  const processedFile = join(cfg.PROCESSED_DIR, `${basename(filePath, extname(filePath))}.txt`);
  writeFileSync(processedFile, text);

  const chunks = chunkText(text);
  if (!chunks.length) {
    return { source_file: basename(filePath), chunk_count: 0, error: 'No chunks generated' };
  }

  const store = new KnowledgeStore();
  let sourceType = extname(filePath).slice(1).toLowerCase();
  if (['xls', 'xlt'].includes(sourceType)) sourceType = 'xlsx';

  await store.addDocument(basename(filePath), chunks, {
    source_type: sourceType,
    uploaded_by: uploadedBy,
  });

  return {
    source_file: basename(filePath),
    chunk_count: chunks.length,
    text_length: text.length,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/ingestion.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ingestion.ts tests/ingestion.test.ts
git commit -m "feat: add document ingestion pipeline"
```

---

### Task 6: Extraction Module

**Files:**
- Create: `src/extraction.ts`
- Test: `tests/extraction.test.ts`

- [ ] **Step 1: Write the tests**

Create `tests/extraction.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/extraction.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write extraction.ts**

Create `src/extraction.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/extraction.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/extraction.ts tests/extraction.test.ts
git commit -m "feat: add post-conversation extraction module"
```

---

### Task 7: GitHub Tools

**Files:**
- Create: `src/tools/github.ts`
- Create: `src/tools/index.ts`
- Test: `tests/github-tools.test.ts`

- [ ] **Step 1: Write the tests**

Create `tests/github-tools.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('GitHub tools', () => {
  it('should export all five tools', async () => {
    const { githubTools } = await import('../src/tools/github.js');
    expect(githubTools.github_list_repos).toBeDefined();
    expect(githubTools.github_list_directory).toBeDefined();
    expect(githubTools.github_read_file).toBeDefined();
    expect(githubTools.github_search_code).toBeDefined();
    expect(githubTools.github_get_commit_history).toBeDefined();
  });

  it('should export combined allTools from index', async () => {
    const { allTools } = await import('../src/tools/index.js');
    expect(allTools.github_list_repos).toBeDefined();
    expect(allTools.github_read_file).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/github-tools.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write tools/github.ts**

Create `src/tools/github.ts`:

```typescript
import { tool } from 'ai';
import { z } from 'zod';
import { Octokit } from '@octokit/rest';
import * as cfg from '../config.js';

const octokit = new Octokit({ auth: cfg.GITHUB_TOKEN });

export const githubTools = {
  github_list_repos: tool({
    description: 'List repositories in a GitHub organization or for a user. Defaults to org type. Use this to discover what repos exist.',
    parameters: z.object({
      owner: z.string().describe('GitHub org or username'),
      type: z.enum(['org', 'user']).default('org').describe('Whether owner is an org or user'),
    }),
    execute: async ({ owner, type }) => {
      if (type === 'org') {
        const { data } = await octokit.repos.listForOrg({ org: owner, per_page: 100, sort: 'updated' });
        return data.map(r => ({
          name: r.name,
          description: r.description,
          language: r.language,
          updated_at: r.updated_at,
        }));
      } else {
        const { data } = await octokit.repos.listForUser({ username: owner, per_page: 100, sort: 'updated' });
        return data.map(r => ({
          name: r.name,
          description: r.description,
          language: r.language,
          updated_at: r.updated_at,
        }));
      }
    },
  }),

  github_list_directory: tool({
    description: 'List files and folders at a path in a GitHub repo. Use path "" for root. Shows file names, types (file/dir), and paths.',
    parameters: z.object({
      owner: z.string().describe('Repo owner (org or user)'),
      repo: z.string().describe('Repository name'),
      path: z.string().default('').describe('Path within repo (empty string for root)'),
    }),
    execute: async ({ owner, repo, path }) => {
      const { data } = await octokit.repos.getContent({ owner, repo, path });
      if (!Array.isArray(data)) {
        return [{ name: data.name, type: data.type, path: data.path }];
      }
      return data.map(item => ({
        name: item.name,
        type: item.type,
        path: item.path,
      }));
    },
  }),

  github_read_file: tool({
    description: 'Read the contents of a file from a GitHub repo. Returns decoded text content, size, and SHA.',
    parameters: z.object({
      owner: z.string().describe('Repo owner (org or user)'),
      repo: z.string().describe('Repository name'),
      path: z.string().describe('File path within the repo'),
    }),
    execute: async ({ owner, repo, path }) => {
      const { data } = await octokit.repos.getContent({ owner, repo, path });
      if (Array.isArray(data) || data.type !== 'file') {
        return { error: `${path} is a directory, not a file` };
      }
      const content = Buffer.from(data.content, 'base64').toString('utf-8');
      return { content, size: data.size, sha: data.sha };
    },
  }),

  github_search_code: tool({
    description: 'Search for code across GitHub repos using the code search API. Optionally scope to an org/user.',
    parameters: z.object({
      query: z.string().describe('Search query (code search syntax)'),
      owner: z.string().optional().describe('Optional: scope search to this org or user'),
    }),
    execute: async ({ query, owner }) => {
      const q = owner ? `${query} org:${owner}` : query;
      const { data } = await octokit.search.code({ q, per_page: 20 });
      return data.items.map(item => ({
        repo: item.repository.full_name,
        path: item.path,
        url: item.html_url,
      }));
    },
  }),

  github_get_commit_history: tool({
    description: 'View recent commits on a branch or for a specific file in a GitHub repo.',
    parameters: z.object({
      owner: z.string().describe('Repo owner (org or user)'),
      repo: z.string().describe('Repository name'),
      path: z.string().optional().describe('Optional: filter commits to this file path'),
      branch: z.string().default('main').describe('Branch name (default: main)'),
    }),
    execute: async ({ owner, repo, path, branch }) => {
      const { data } = await octokit.repos.listCommits({
        owner, repo, sha: branch, path, per_page: 20,
      });
      return data.map(c => ({
        sha: c.sha.slice(0, 7),
        message: c.commit.message.split('\n')[0],
        author: c.commit.author?.name ?? 'unknown',
        date: c.commit.author?.date ?? '',
      }));
    },
  }),
};
```

- [ ] **Step 4: Write tools/index.ts**

Create `src/tools/index.ts`:

```typescript
import { githubTools } from './github.js';

export const allTools = {
  ...githubTools,
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/github-tools.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/tools/github.ts src/tools/index.ts tests/github-tools.test.ts
git commit -m "feat: add GitHub exploration tools (list repos, browse, read, search, commits)"
```

---

### Task 8: Agent Core

**Files:**
- Create: `src/agent.ts`
- Test: `tests/agent.test.ts`

- [ ] **Step 1: Write the tests**

Create `tests/agent.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
  it('should format github tool calls for status display', async () => {
    const { formatToolStatus } = await import('../src/agent.js');
    const status = formatToolStatus({
      toolName: 'github_read_file',
      args: { owner: 'EnotriumSyndicate', repo: 'aip', path: 'src/main.py' },
    });
    expect(status).toContain('src/main.py');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/agent.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write agent.ts**

Create `src/agent.ts`:

```typescript
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
      maxTokens: 2000,
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/agent.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/agent.ts tests/agent.test.ts
git commit -m "feat: add agent core with Vercel AI SDK tool-calling loop"
```

---

### Task 9: Telegram Bot

**Files:**
- Create: `src/bot.ts`

- [ ] **Step 1: Write bot.ts**

Create `src/bot.ts`:

```typescript
import { Telegraf, Context } from 'telegraf';
import { message } from 'telegraf/filters';
import { writeFileSync } from 'fs';
import { join } from 'path';
import * as cfg from './config.js';
import { getResponse, formatToolStatus } from './agent.js';
import { saveTranscript, loadRecentTranscript } from './memory.js';
import { extractFromConversation } from './extraction.js';
import { ingestDocument } from './ingestion.js';

function identifyUser(from: { id: number; username?: string }): { userId: string; userName: string } | null {
  if (from.username) {
    const normalized = from.username.toLowerCase().replace(/^@/, '');
    if (normalized in cfg.ALLOWED_USERS) {
      return { userId: String(from.id), userName: cfg.ALLOWED_USERS[normalized] };
    }
  }
  const idStr = String(from.id);
  if (idStr in cfg.ALLOWED_USERS) {
    return { userId: idStr, userName: cfg.ALLOWED_USERS[idStr] };
  }
  return null;
}

export function createBot(): Telegraf {
  const bot = new Telegraf(cfg.TELEGRAM_BOT_TOKEN);

  bot.start(async (ctx) => {
    const identity = identifyUser(ctx.from);
    if (identity) {
      await ctx.reply(
        `Hey ${identity.userName}! I'm Root, Enotrium's intelligence agent. ` +
        `Send me a message or upload a document to get started.`
      );
    } else {
      await ctx.reply(
        `Hey! Your Telegram user ID is \`${ctx.from.id}\`. ` +
        `Ask Tanay to add this to Root's allowlist in config.ts.`,
        { parse_mode: 'Markdown' },
      );
    }
  });

  bot.on(message('text'), async (ctx) => {
    const identity = identifyUser(ctx.from);
    if (!identity) {
      await ctx.reply(
        `Hey — I don't recognize you yet. Your Telegram user ID is \`${ctx.from.id}\`. ` +
        `Ask Tanay to add you to Root's allowlist.`,
        { parse_mode: 'Markdown' },
      );
      return;
    }

    const { userId, userName } = identity;
    const userMessage = ctx.message.text;
    if (!userMessage) return;

    console.log(`Message from ${userName} (${userId}): ${userMessage.slice(0, 100)}`);

    // Save user message to transcript
    saveTranscript(userId, 'user', userMessage);

    // Status message tracking
    let statusMessageId: number | null = null;

    const onStatusChange = async (status: string) => {
      try {
        if (statusMessageId === null) {
          const sent = await ctx.reply(status);
          statusMessageId = sent.message_id;
        } else {
          await ctx.telegram.editMessageText(
            ctx.chat.id, statusMessageId, undefined, status,
          );
        }
      } catch (e) {
        console.warn(`Failed to update status message: ${e}`);
      }
    };

    // Get agent response
    const responseText = await getResponse(userId, userName, userMessage, onStatusChange);

    // Delete status message
    if (statusMessageId !== null) {
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, statusMessageId);
      } catch (e) {
        console.warn(`Failed to delete status message: ${e}`);
      }
    }

    // Save assistant response to transcript
    saveTranscript(userId, 'assistant', responseText);

    // Send response (split if >4096 chars)
    if (responseText.length <= 4096) {
      await ctx.reply(responseText);
    } else {
      for (let i = 0; i < responseText.length; i += 4096) {
        await ctx.reply(responseText.slice(i, i + 4096));
      }
    }

    // Run extraction in background
    const recent = loadRecentTranscript(userId, 10);
    try {
      await extractFromConversation(
        recent.map(m => ({ role: String(m.role), content: String(m.content) })),
        userName,
      );
    } catch (e) {
      console.error(`Extraction error: ${e}`);
    }
  });

  bot.on(message('document'), async (ctx) => {
    const identity = identifyUser(ctx.from);
    if (!identity) {
      await ctx.reply("I don't recognize you. Ask Tanay to add you to Root's allowlist.");
      return;
    }

    const { userName } = identity;
    const document = ctx.message.document;
    if (!document) return;

    const fileName = document.file_name ?? 'unknown';
    console.log(`File from ${userName}: ${fileName}`);
    await ctx.reply(`Got it — processing \`${fileName}\`...`, { parse_mode: 'Markdown' });

    // Download file
    const fileLink = await ctx.telegram.getFileLink(document.file_id);
    const response = await fetch(fileLink.href);
    const buffer = Buffer.from(await response.arrayBuffer());
    const savePath = join(cfg.SOURCES_DIR, fileName);
    writeFileSync(savePath, buffer);

    // Ingest
    const result = await ingestDocument(savePath, userName);

    if (result.error) {
      await ctx.reply(`Had trouble with \`${fileName}\`: ${result.error}`);
    } else {
      await ctx.reply(
        `Ingested \`${fileName}\` — ${result.chunk_count} chunks indexed. ` +
        `I can now answer questions about this document.`,
        { parse_mode: 'Markdown' },
      );
    }
  });

  return bot;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/bot.ts
git commit -m "feat: add Telegram bot with status message UX"
```

---

### Task 10: Entry Point (Express Server)

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Write index.ts**

Create `src/index.ts`:

```typescript
import express from 'express';
import { createBot } from './bot.js';
import { ensureDirs, WEBHOOK_URL } from './config.js';

const app = express();
app.use(express.json());

const bot = createBot();

app.post('/webhook', (req, res) => {
  bot.handleUpdate(req.body);
  res.sendStatus(200);
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'root' });
});

const PORT = process.env.PORT ?? 8080;

async function start() {
  ensureDirs();

  if (WEBHOOK_URL) {
    const webhookUrl = `${WEBHOOK_URL}/webhook`;
    await bot.telegram.setWebhook(webhookUrl);
    console.log(`Webhook set to ${webhookUrl}`);
  } else {
    console.warn('No WEBHOOK_URL set — bot won\'t receive messages via webhook');
  }

  app.listen(PORT, () => {
    console.log(`Root is listening on port ${PORT}`);
  });
}

start().catch(console.error);
```

- [ ] **Step 2: Verify it starts**

Run: `npx tsx src/index.ts`
Expected: Server starts and logs "Root is listening on port 8080" (will fail to set webhook without valid URL, but the server should start)

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add Express entry point with webhook handler"
```

---

### Task 11: Dockerfile & Deployment

**Files:**
- Modify: `Dockerfile`
- Modify: `fly.toml` (minimal)

- [ ] **Step 1: Update Dockerfile**

ChromaDB JS client requires a running ChromaDB server. We run it as a sidecar in the same container using a startup script.

Replace `Dockerfile` contents:

```dockerfile
FROM node:20-slim

# Install Python + ChromaDB server
RUN apt-get update && apt-get install -y python3 python3-pip python3-venv && \
    python3 -m venv /opt/chroma-venv && \
    /opt/chroma-venv/bin/pip install chromadb && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production

COPY src/ src/
COPY tsconfig.json ./
COPY start.sh ./
COPY data/system-prompt.md data/system-prompt.md

RUN chmod +x start.sh

ENV DATA_DIR=/data
ENV CHROMA_URL=http://localhost:8000

EXPOSE 8080

CMD ["./start.sh"]
```

- [ ] **Step 2: Create start.sh**

Create `start.sh`:

```bash
#!/bin/bash
set -e

# Start ChromaDB server in background, persisting to /data/knowledge/chroma
mkdir -p /data/knowledge/chroma
/opt/chroma-venv/bin/chroma run --host 0.0.0.0 --port 8000 --path /data/knowledge/chroma &

# Wait for ChromaDB to be ready
echo "Waiting for ChromaDB..."
for i in $(seq 1 30); do
  if curl -s http://localhost:8000/api/v1/heartbeat > /dev/null 2>&1; then
    echo "ChromaDB is ready"
    break
  fi
  sleep 1
done

# Start Node app
exec npx tsx src/index.ts
```

- [ ] **Step 3: Verify fly.toml needs no changes**

The existing `fly.toml` already has the correct port (8080), volume mount (`/data`), and app name. No changes needed.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile start.sh
git commit -m "chore: update Dockerfile for Node.js with ChromaDB sidecar"
```

---

### Task 12: Run All Tests & Verify

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run the server locally**

Run: `npx tsx src/index.ts`
Expected: Server starts on port 8080, webhook warning if no valid URL

- [ ] **Step 3: Final commit with any fixes**

If any test fixes were needed:
```bash
git add -A
git commit -m "fix: resolve test issues from full suite run"
```
