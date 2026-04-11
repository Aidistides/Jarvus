import "dotenv/config";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

// Environment
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
export const WEBHOOK_URL = process.env.WEBHOOK_URL ?? "";
export const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? "";
export const CHROMA_URL = process.env.CHROMA_URL ?? "http://localhost:8000";
export let DATA_DIR = process.env.DATA_DIR ?? "./data";

// Paths
export const MEMORY_DIR = join(DATA_DIR, "memory");
export const KNOWLEDGE_DIR = join(DATA_DIR, "knowledge");
export let CHROMA_DIR = join(KNOWLEDGE_DIR, "chroma");
export const SOURCES_DIR = join(KNOWLEDGE_DIR, "sources");
export const PROCESSED_DIR = join(KNOWLEDGE_DIR, "processed");
export let TRANSCRIPTS_DIR = join(MEMORY_DIR, "transcripts");

export let LEARNINGS_FILE = join(MEMORY_DIR, "learnings.json");
export let DECISIONS_FILE = join(MEMORY_DIR, "decisions.json");
export let FACTS_FILE = join(MEMORY_DIR, "facts.json");
export let REGISTRY_FILE = join(KNOWLEDGE_DIR, "registry.json");
export let SYSTEM_PROMPT_FILE = join(DATA_DIR, "system-prompt.md");

// Models
export let CHAT_MODEL = "gpt-5.4";
export let EMBEDDING_MODEL = "text-embedding-3-small";

// RAG
export let CHUNK_SIZE = 500;
export let CHUNK_OVERLAP = 50;
export let RAG_TOP_K = 10;

// Conversation
export let MAX_HISTORY_MESSAGES = 20;
export let MAX_STEPS = 500;

// Memory in prompt
export let MAX_DECISIONS_IN_PROMPT = 10;
export let MAX_LEARNINGS_IN_PROMPT = 10;
export let MAX_FACTS_IN_PROMPT = 10;

// Allowed users: telegram username -> display name
export const ALLOWED_USERS: Record<string, string> = {
  aidistides: "aiden",
  tn_0123: "tanay",
  machineelf2: "david",
};

export function ensureDirs(): void {
  const dirs = [
    MEMORY_DIR,
    TRANSCRIPTS_DIR,
    KNOWLEDGE_DIR,
    SOURCES_DIR,
    PROCESSED_DIR,
  ];
  for (const d of dirs) {
    mkdirSync(d, { recursive: true });
  }
  const jsonFiles = [LEARNINGS_FILE, DECISIONS_FILE, FACTS_FILE, REGISTRY_FILE];
  for (const f of jsonFiles) {
    if (!existsSync(f)) {
      writeFileSync(f, "[]");
    }
  }
}
