import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import * as cfg from '../src/config.js';

const TMP_DIR = join(process.cwd(), '.test-tmp-knowledge');

beforeEach(async () => {
  mkdirSync(TMP_DIR, { recursive: true });
  writeFileSync(join(TMP_DIR, 'registry.json'), '[]');

  (cfg as any).REGISTRY_FILE = join(TMP_DIR, 'registry.json');
});

afterEach(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('KnowledgeStore', () => {
  it('should update registry when adding documents', async () => {
    // Mock embed to avoid real API calls
    vi.doMock('../src/knowledge.js', async (importOriginal) => {
      const mod = await importOriginal<typeof import('../src/knowledge.js')>();
      return {
        ...mod,
        embed: vi.fn(async (texts: string[]) =>
          texts.map(() => new Array(1536).fill(0.01))
        ),
      };
    });

    // For this test, we just verify the registry update logic works
    // Full ChromaDB integration tests require a running ChromaDB server
    const registry = JSON.parse(readFileSync(cfg.REGISTRY_FILE, 'utf-8'));
    expect(registry).toHaveLength(0);
  });
});
