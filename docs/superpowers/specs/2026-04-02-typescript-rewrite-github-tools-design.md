# Enotrium AI Agent — TypeScript Rewrite with GitHub Tools

## Overview

Full rewrite of the Enotrium AI agent from Python to TypeScript, using the Vercel AI SDK for tool-calling loops, adding GitHub code exploration tools, and implementing a Telegram status message UX pattern.

## Stack

- **Runtime:** Node 20 + TypeScript (tsx)
- **AI SDK:** `ai` + `@ai-sdk/openai` (Vercel AI SDK)
- **Model:** `gpt-5.4` via `openai('gpt-5.4')`
- **Telegram:** `telegraf`
- **Vector Store:** `chromadb` (JS client, PersistentClient)
- **GitHub:** `@octokit/rest`
- **HTTP Server:** `express`
- **Document Parsing:** `pdfjs-dist` (PDF), `xlsx` (Excel/CSV)
- **Schemas:** `zod`
- **Testing:** `vitest`
- **Deployment:** Fly.io (same config, Node base image)

## Project Structure

```
src/
├── index.ts          # Express server, webhook route
├── bot.ts            # Telegram bot setup, message handlers, status message UX
├── agent.ts          # Vercel AI SDK loop — prompt building, tool dispatch
├── tools/
│   ├── github.ts     # GitHub tools: list repos, browse dirs, read files, search code
│   └── index.ts      # Tool registry — exports all tools
├── memory.ts         # Transcript saving, structured memory (facts/decisions/learnings)
├── knowledge.ts      # ChromaDB JS client — embed, store, query
├── ingestion.ts      # Document processing — PDF, Excel, CSV, text → chunks → ChromaDB
├── extraction.ts     # Post-conversation LLM call to extract facts/decisions/learnings
└── config.ts         # Constants, env vars, allowed users
```

## Agent Core (agent.ts)

Uses `generateText` from the Vercel AI SDK with `maxSteps` for autonomous multi-step tool use.

```typescript
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { allTools } from './tools';

async function getResponse(
  userId: string,
  userName: string,
  message: string,
  onStatusChange: (status: string) => Promise<void>
): Promise<string> {
  const systemPrompt = await buildSystemPrompt(userId, message);
  const history = await loadTranscript(userId);

  const result = await generateText({
    model: openai('gpt-5.4'),
    system: systemPrompt,
    messages: [...history, { role: 'user', content: message }],
    tools: allTools,
    maxSteps: 15,
    onStepFinish: async (stepResult) => {
      if (stepResult.toolCalls?.length) {
        await onStatusChange(formatToolStatus(stepResult.toolCalls[0]));
      }
    },
  });

  return result.text;
}
```

**Key design decisions:**
- `maxSteps: 15` — allows deep autonomous exploration (list repos → browse dirs → read files → search code)
- `onStepFinish` callback connects tool execution to Telegram status message editing
- `onStatusChange` callback is injected from `bot.ts`
- System prompt is built the same way as the Python version: static prompt + structured memory + RAG context

### System Prompt Construction

Same as Python version:
1. Load `data/system-prompt.md` (company context, personality)
2. Append structured memory (recent decisions, learnings, facts)
3. Append RAG context (top-10 chunks from ChromaDB matching the user message)
4. Prepend conversation history (last 20 messages)

## GitHub Tools (tools/github.ts)

Five tools, all using `@octokit/rest` initialized with `GITHUB_TOKEN`:

### github_list_repos
- **Purpose:** List repositories in an org or for a user
- **Params:** `owner` (string), `type` (optional: "org" | "user", default "org")
- **Returns:** `{ name, description, language, updated_at }[]`

### github_list_directory
- **Purpose:** List files/folders at a path in a repo
- **Params:** `owner` (string), `repo` (string), `path` (string, default: "")
- **Returns:** `{ name, type, path }[]` (type = "file" | "dir")

### github_read_file
- **Purpose:** Read a file's contents (decoded from base64)
- **Params:** `owner` (string), `repo` (string), `path` (string)
- **Returns:** `{ content, size, sha }`

### github_search_code
- **Purpose:** Search code across repos using GitHub code search API
- **Params:** `query` (string), `owner` (optional, scopes search to org/user)
- **Returns:** `{ repo, path, matches }[]` (snippet excerpts around matches)

### github_get_commit_history
- **Purpose:** View recent commits on a branch or file
- **Params:** `owner` (string), `repo` (string), `path` (optional), `branch` (optional, default "main")
- **Returns:** `{ sha, message, author, date }[]`

All tools are defined using the AI SDK's `tool()` helper with Zod schemas. The agent can chain them freely.

## Telegram Status Message UX (bot.ts)

Three rules govern message behavior:

### Rule 1: Tool activity → single status message, edited in place
When the agent starts using tools, send one message and store its `message_id`. Each subsequent tool call edits that same message with the latest action only (e.g. "Reading `src/agent.py` on GitHub...").

### Rule 2: Final response → new message, status message deleted
When the agent produces its text response, the status message is deleted and the response is sent as a new message.

### Rule 3: After user message → fresh status message
The status `message_id` is reset per user message. A new user message always starts a fresh status message.

### Implementation

```typescript
async function handleMessage(ctx: Context) {
  const userId = String(ctx.from.id);
  const userName = identifyUser(ctx.from);
  const text = ctx.message.text;
  let statusMessageId: number | null = null;

  const onStatusChange = async (status: string) => {
    if (statusMessageId === null) {
      const sent = await ctx.reply(status);
      statusMessageId = sent.message_id;
    } else {
      await ctx.telegram.editMessageText(
        ctx.chat.id, statusMessageId, undefined, status
      );
    }
  };

  const response = await getResponse(userId, userName, text, onStatusChange);

  // Delete status message
  if (statusMessageId !== null) {
    await ctx.telegram.deleteMessage(ctx.chat.id, statusMessageId);
  }

  // Send final response as new message
  await ctx.reply(response);
}
```

## Memory (memory.ts)

1:1 port from Python. Same JSON file structure under `data/memory/`:

- **Transcripts:** Per-user, per-date JSON files with `{ role, content, timestamp }`
- **Facts:** `data/memory/facts.json` — `{ id, fact, source, timestamp }`
- **Decisions:** `data/memory/decisions.json` — `{ id, decision, made_by, context, timestamp, status, follow_up_date }`
- **Learnings:** `data/memory/learnings.json` — `{ id, content, source, timestamp, confidence }`

Functions: `saveTranscript()`, `loadRecentTranscript()`, `loadStructuredMemory()`

Existing data files are fully compatible — no migration needed.

## Knowledge Store (knowledge.ts)

ChromaDB JS client (`chromadb` npm package):

- `PersistentClient` pointing at `data/knowledge/chroma/`
- Single collection: `enotrium_knowledge`
- Embeddings via OpenAI `text-embedding-3-small`
- `addDocument(chunks, metadata)` — embed and store
- `query(text, topK=10)` — retrieve similar chunks by cosine similarity
- Metadata: `source_file`, `source_type`, `uploaded_by`, `uploaded_at`, `chunk_index`

## Document Ingestion (ingestion.ts)

Port from Python:

- **PDF:** `pdfjs-dist` for text extraction
- **Excel/CSV:** `xlsx` package
- **Text files:** direct read
- **Chunking:** ~500 token (2000 char) passages with 50 token overlap
- **Pipeline:** extract text → chunk → embed → store in ChromaDB → update `registry.json`

Telegram file upload handler: download file → save to `data/knowledge/sources/` → run ingestion.

## Extraction (extraction.ts)

Post-conversation structured extraction, ported from Python:

- Separate LLM call after each conversation turn (low temperature: 0.1)
- Extracts facts, decisions, learnings from the conversation
- Appends to respective JSON files
- Runs async after the response is sent (fire-and-forget)

## Config (config.ts)

```typescript
export const config = {
  chatModel: 'gpt-5.4',
  embeddingModel: 'text-embedding-3-small',
  chunkSize: 500,
  chunkOverlap: 50,
  ragTopK: 10,
  maxHistoryMessages: 20,
  maxSteps: 15,
  allowedUsers: {
    'aidistides': 'aiden',
    'tn_0123': 'tanay',
  } as Record<string, string>,
} as const;
```

**Environment variables:** `OPENAI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `WEBHOOK_URL`, `GITHUB_TOKEN`, `DATA_DIR`

## Deployment

- Same Fly.io setup
- Dockerfile: Node 20 base image instead of Python
- Same `/data` volume mount — existing data preserved
- `fly.toml`: minimal changes (build command)

## Testing

Port existing Python tests to Vitest with same test cases.
