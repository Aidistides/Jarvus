import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import * as cfg from '../src/config.js';

const TMP_DIR = join(process.cwd(), '.test-tmp-knowledge');

// --- Mocks for external services ---

const mockUpsert = vi.fn().mockResolvedValue(undefined);
const mockCount = vi.fn().mockResolvedValue(0);
const mockQuery = vi.fn().mockResolvedValue({
  ids: [[]],
  documents: [[]],
  metadatas: [[]],
  distances: [[]],
});
const mockGetOrCreateCollection = vi.fn().mockResolvedValue({
  upsert: mockUpsert,
  count: mockCount,
  query: mockQuery,
});

vi.mock('chromadb', () => ({
  ChromaClient: vi.fn().mockImplementation(() => ({
    getOrCreateCollection: mockGetOrCreateCollection,
  })),
}));

const mockEmbeddingsCreate = vi.fn().mockResolvedValue({
  data: [{ embedding: new Array(1536).fill(0.01) }],
});

vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      embeddings: { create: mockEmbeddingsCreate },
    })),
  };
});

// --- Setup & Teardown ---

beforeEach(() => {
  mkdirSync(TMP_DIR, { recursive: true });
  writeFileSync(join(TMP_DIR, 'registry.json'), '[]');
  (cfg as any).REGISTRY_FILE = join(TMP_DIR, 'registry.json');

  vi.clearAllMocks();
  // Re-apply default mock implementations after clearAllMocks
  mockGetOrCreateCollection.mockResolvedValue({
    upsert: mockUpsert,
    count: mockCount,
    query: mockQuery,
  });
  mockUpsert.mockResolvedValue(undefined);
  mockCount.mockResolvedValue(0);
  mockQuery.mockResolvedValue({
    ids: [[]],
    documents: [[]],
    metadatas: [[]],
    distances: [[]],
  });
  mockEmbeddingsCreate.mockResolvedValue({
    data: [{ embedding: new Array(1536).fill(0.01) }],
  });
});

afterEach(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

// --- Tests ---

describe('embed', () => {
  it('should return embeddings for a single text', async () => {
    const { embed } = await import('../src/knowledge.js');

    mockEmbeddingsCreate.mockResolvedValueOnce({
      data: [{ embedding: new Array(1536).fill(0.5) }],
    });

    const result = await embed(['hello world']);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(1536);
    expect(result[0][0]).toBe(0.5);
    expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
      model: cfg.EMBEDDING_MODEL,
      input: ['hello world'],
    });
  });

  it('should return embeddings for multiple texts', async () => {
    const { embed } = await import('../src/knowledge.js');

    mockEmbeddingsCreate.mockResolvedValueOnce({
      data: [
        { embedding: new Array(1536).fill(0.1) },
        { embedding: new Array(1536).fill(0.2) },
        { embedding: new Array(1536).fill(0.3) },
      ],
    });

    const result = await embed(['text one', 'text two', 'text three']);
    expect(result).toHaveLength(3);
    expect(result[0][0]).toBe(0.1);
    expect(result[1][0]).toBe(0.2);
    expect(result[2][0]).toBe(0.3);
  });
});

describe('KnowledgeStore', () => {
  describe('addDocument', () => {
    it('should skip processing when chunks array is empty', async () => {
      const { KnowledgeStore } = await import('../src/knowledge.js');
      const store = new KnowledgeStore();

      await store.addDocument('empty.txt', [], { source_type: 'text', uploaded_by: 'tester' });

      expect(mockGetOrCreateCollection).not.toHaveBeenCalled();
      expect(mockEmbeddingsCreate).not.toHaveBeenCalled();

      const registry = JSON.parse(readFileSync(cfg.REGISTRY_FILE, 'utf-8'));
      expect(registry).toHaveLength(0);
    });

    it('should upsert chunks into ChromaDB and update registry', async () => {
      const { KnowledgeStore } = await import('../src/knowledge.js');
      const store = new KnowledgeStore();

      const chunks = ['chunk one', 'chunk two'];
      mockEmbeddingsCreate.mockResolvedValueOnce({
        data: [
          { embedding: new Array(1536).fill(0.1) },
          { embedding: new Array(1536).fill(0.2) },
        ],
      });

      await store.addDocument('report.pdf', chunks, {
        source_type: 'pdf',
        uploaded_by: 'aiden',
      });

      // Verify ChromaDB collection was retrieved
      expect(mockGetOrCreateCollection).toHaveBeenCalledWith({
        name: 'enotrium_knowledge',
        metadata: { 'hnsw:space': 'cosine' },
      });

      // Verify upsert was called with correct structure
      expect(mockUpsert).toHaveBeenCalledTimes(1);
      const upsertCall = mockUpsert.mock.calls[0][0];
      expect(upsertCall.ids).toEqual(['report.pdf_0', 'report.pdf_1']);
      expect(upsertCall.documents).toEqual(chunks);
      expect(upsertCall.embeddings).toHaveLength(2);
      expect(upsertCall.metadatas).toHaveLength(2);
      expect(upsertCall.metadatas[0].source_file).toBe('report.pdf');
      expect(upsertCall.metadatas[0].source_type).toBe('pdf');
      expect(upsertCall.metadatas[0].uploaded_by).toBe('aiden');
      expect(upsertCall.metadatas[0].chunk_index).toBe('0');
      expect(upsertCall.metadatas[1].chunk_index).toBe('1');

      // Verify registry was updated
      const registry = JSON.parse(readFileSync(cfg.REGISTRY_FILE, 'utf-8'));
      expect(registry).toHaveLength(1);
      expect(registry[0].source_file).toBe('report.pdf');
      expect(registry[0].source_type).toBe('pdf');
      expect(registry[0].uploaded_by).toBe('aiden');
      expect(registry[0].chunk_count).toBe(2);
      expect(registry[0].uploaded_at).toBeDefined();
    });

    it('should use default metadata values when not provided', async () => {
      const { KnowledgeStore } = await import('../src/knowledge.js');
      const store = new KnowledgeStore();

      mockEmbeddingsCreate.mockResolvedValueOnce({
        data: [{ embedding: new Array(1536).fill(0.1) }],
      });

      await store.addDocument('notes.txt', ['some content'], {});

      const upsertCall = mockUpsert.mock.calls[0][0];
      expect(upsertCall.metadatas[0].source_type).toBe('text');
      expect(upsertCall.metadatas[0].uploaded_by).toBe('unknown');

      const registry = JSON.parse(readFileSync(cfg.REGISTRY_FILE, 'utf-8'));
      expect(registry[0].source_type).toBe('text');
      expect(registry[0].uploaded_by).toBe('unknown');
    });

    it('should append multiple documents to the registry', async () => {
      const { KnowledgeStore } = await import('../src/knowledge.js');
      const store = new KnowledgeStore();

      mockEmbeddingsCreate.mockResolvedValue({
        data: [{ embedding: new Array(1536).fill(0.1) }],
      });

      await store.addDocument('doc1.txt', ['chunk A'], { source_type: 'text', uploaded_by: 'alice' });
      await store.addDocument('doc2.csv', ['chunk B'], { source_type: 'csv', uploaded_by: 'bob' });

      const registry = JSON.parse(readFileSync(cfg.REGISTRY_FILE, 'utf-8'));
      expect(registry).toHaveLength(2);
      expect(registry[0].source_file).toBe('doc1.txt');
      expect(registry[1].source_file).toBe('doc2.csv');
      expect(registry[0].uploaded_by).toBe('alice');
      expect(registry[1].uploaded_by).toBe('bob');
    });

    it('should generate correct chunk IDs from source file name', async () => {
      const { KnowledgeStore } = await import('../src/knowledge.js');
      const store = new KnowledgeStore();

      const chunks = ['a', 'b', 'c'];
      mockEmbeddingsCreate.mockResolvedValueOnce({
        data: chunks.map(() => ({ embedding: new Array(1536).fill(0) })),
      });

      await store.addDocument('path/to/file.txt', chunks, { source_type: 'text' });

      const upsertCall = mockUpsert.mock.calls[0][0];
      expect(upsertCall.ids).toEqual([
        'path/to/file.txt_0',
        'path/to/file.txt_1',
        'path/to/file.txt_2',
      ]);
    });

    it('should include uploaded_at timestamp in metadata', async () => {
      const { KnowledgeStore } = await import('../src/knowledge.js');
      const store = new KnowledgeStore();

      mockEmbeddingsCreate.mockResolvedValueOnce({
        data: [{ embedding: new Array(1536).fill(0) }],
      });

      const beforeTime = new Date().toISOString();
      await store.addDocument('ts.txt', ['chunk'], { source_type: 'text' });
      const afterTime = new Date().toISOString();

      const upsertCall = mockUpsert.mock.calls[0][0];
      const uploadedAt = upsertCall.metadatas[0].uploaded_at;
      expect(uploadedAt >= beforeTime).toBe(true);
      expect(uploadedAt <= afterTime).toBe(true);
    });
  });

  describe('query', () => {
    it('should return empty array when collection is empty', async () => {
      const { KnowledgeStore } = await import('../src/knowledge.js');
      const store = new KnowledgeStore();

      mockCount.mockResolvedValueOnce(0);

      const results = await store.query('search term');
      expect(results).toEqual([]);
      expect(mockEmbeddingsCreate).not.toHaveBeenCalled();
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should return formatted results from ChromaDB query', async () => {
      const { KnowledgeStore } = await import('../src/knowledge.js');
      const store = new KnowledgeStore();

      mockCount.mockResolvedValueOnce(5);
      mockEmbeddingsCreate.mockResolvedValueOnce({
        data: [{ embedding: new Array(1536).fill(0.5) }],
      });
      mockQuery.mockResolvedValueOnce({
        ids: [['doc1_0', 'doc2_0']],
        documents: [['first document chunk', 'second document chunk']],
        metadatas: [[
          { source_file: 'doc1.txt', source_type: 'text', uploaded_by: 'alice' },
          { source_file: 'doc2.pdf', source_type: 'pdf', uploaded_by: 'bob' },
        ]],
        distances: [[0.1, 0.3]],
      });

      const results = await store.query('search term');

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        id: 'doc1_0',
        text: 'first document chunk',
        metadata: { source_file: 'doc1.txt', source_type: 'text', uploaded_by: 'alice' },
        distance: 0.1,
      });
      expect(results[1]).toEqual({
        id: 'doc2_0',
        text: 'second document chunk',
        metadata: { source_file: 'doc2.pdf', source_type: 'pdf', uploaded_by: 'bob' },
        distance: 0.3,
      });
    });

    it('should respect topK parameter', async () => {
      const { KnowledgeStore } = await import('../src/knowledge.js');
      const store = new KnowledgeStore();

      mockCount.mockResolvedValueOnce(100);
      mockEmbeddingsCreate.mockResolvedValueOnce({
        data: [{ embedding: new Array(1536).fill(0.5) }],
      });
      mockQuery.mockResolvedValueOnce({
        ids: [['id1', 'id2', 'id3']],
        documents: [['a', 'b', 'c']],
        metadatas: [[{}, {}, {}]],
        distances: [[0.1, 0.2, 0.3]],
      });

      await store.query('test', 3);

      expect(mockQuery).toHaveBeenCalledWith({
        queryEmbeddings: [expect.any(Array)],
        nResults: 3,
      });
    });

    it('should clamp nResults to collection count when topK exceeds it', async () => {
      const { KnowledgeStore } = await import('../src/knowledge.js');
      const store = new KnowledgeStore();

      mockCount.mockResolvedValueOnce(2);
      mockEmbeddingsCreate.mockResolvedValueOnce({
        data: [{ embedding: new Array(1536).fill(0.5) }],
      });
      mockQuery.mockResolvedValueOnce({
        ids: [['id1', 'id2']],
        documents: [['a', 'b']],
        metadatas: [[{}, {}]],
        distances: [[0.1, 0.2]],
      });

      await store.query('test', 50);

      expect(mockQuery).toHaveBeenCalledWith({
        queryEmbeddings: [expect.any(Array)],
        nResults: 2,
      });
    });

    it('should use default topK of 10', async () => {
      const { KnowledgeStore } = await import('../src/knowledge.js');
      const store = new KnowledgeStore();

      mockCount.mockResolvedValueOnce(100);
      mockEmbeddingsCreate.mockResolvedValueOnce({
        data: [{ embedding: new Array(1536).fill(0.5) }],
      });
      mockQuery.mockResolvedValueOnce({
        ids: [[]],
        documents: [[]],
        metadatas: [[]],
        distances: [[]],
      });

      await store.query('test');

      expect(mockQuery).toHaveBeenCalledWith({
        queryEmbeddings: [expect.any(Array)],
        nResults: 10,
      });
    });

    it('should handle missing documents gracefully with empty string fallback', async () => {
      const { KnowledgeStore } = await import('../src/knowledge.js');
      const store = new KnowledgeStore();

      mockCount.mockResolvedValueOnce(5);
      mockEmbeddingsCreate.mockResolvedValueOnce({
        data: [{ embedding: new Array(1536).fill(0.5) }],
      });
      mockQuery.mockResolvedValueOnce({
        ids: [['id1']],
        documents: [[null]],
        metadatas: [[null]],
        distances: [[null]],
      });

      const results = await store.query('test');

      expect(results).toHaveLength(1);
      expect(results[0].text).toBe('');
      expect(results[0].metadata).toEqual({});
      expect(results[0].distance).toBeNull();
    });

    it('should pass the embedded query vector to ChromaDB', async () => {
      const { KnowledgeStore } = await import('../src/knowledge.js');
      const store = new KnowledgeStore();

      const queryEmbedding = new Array(1536).fill(0.42);
      mockCount.mockResolvedValueOnce(5);
      mockEmbeddingsCreate.mockResolvedValueOnce({
        data: [{ embedding: queryEmbedding }],
      });
      mockQuery.mockResolvedValueOnce({
        ids: [[]],
        documents: [[]],
        metadatas: [[]],
        distances: [[]],
      });

      await store.query('my search');

      expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
        model: cfg.EMBEDDING_MODEL,
        input: ['my search'],
      });
      expect(mockQuery).toHaveBeenCalledWith({
        queryEmbeddings: [queryEmbedding],
        nResults: 5,
      });
    });
  });
});
