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
