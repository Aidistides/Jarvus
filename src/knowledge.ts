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
