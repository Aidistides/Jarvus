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
    expect(cfg.MAX_STEPS).toBe(500);
  });

  it('should have allowed users', async () => {
    const cfg = await import('../src/config.js');
    expect(cfg.ALLOWED_USERS['aidistides']).toBe('aiden');
    expect(cfg.ALLOWED_USERS['tn_0123']).toBe('tanay');
  });
});
