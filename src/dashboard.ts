import { Router, Request, Response } from 'express';
import * as cfg from './config.js';
import { readFileSync, existsSync } from 'fs';

/**
 * Runtime-tunable config keys and their metadata.
 * Only settings that are safe to change at runtime are exposed.
 */
interface ConfigField {
  key: string;
  label: string;
  group: string;
  type: 'number' | 'string' | 'readonly';
  description: string;
}

const CONFIG_FIELDS: ConfigField[] = [
  // Models
  { key: 'CHAT_MODEL', label: 'Chat Model', group: 'Models', type: 'string', description: 'LLM model used for agent responses' },
  { key: 'EMBEDDING_MODEL', label: 'Embedding Model', group: 'Models', type: 'string', description: 'Model used for document embeddings' },

  // RAG
  { key: 'CHUNK_SIZE', label: 'Chunk Size (tokens)', group: 'RAG / Ingestion', type: 'number', description: 'Token count per document chunk (char size = tokens * 4)' },
  { key: 'CHUNK_OVERLAP', label: 'Chunk Overlap (tokens)', group: 'RAG / Ingestion', type: 'number', description: 'Token overlap between consecutive chunks' },
  { key: 'RAG_TOP_K', label: 'RAG Top-K', group: 'RAG / Ingestion', type: 'number', description: 'Max document chunks returned from vector search' },

  // Conversation
  { key: 'MAX_HISTORY_MESSAGES', label: 'Max History Messages', group: 'Conversation', type: 'number', description: 'Max conversation messages sent to the agent' },
  { key: 'MAX_STEPS', label: 'Max Steps', group: 'Conversation', type: 'number', description: 'Max tool-use loop iterations per request' },

  // Memory in prompt
  { key: 'MAX_DECISIONS_IN_PROMPT', label: 'Max Decisions in Prompt', group: 'Memory Limits', type: 'number', description: 'Max decisions included in agent system prompt' },
  { key: 'MAX_LEARNINGS_IN_PROMPT', label: 'Max Learnings in Prompt', group: 'Memory Limits', type: 'number', description: 'Max learnings included in agent system prompt' },
  { key: 'MAX_FACTS_IN_PROMPT', label: 'Max Facts in Prompt', group: 'Memory Limits', type: 'number', description: 'Max facts included in agent system prompt' },

  // Paths (read-only — informational)
  { key: 'DATA_DIR', label: 'Data Directory', group: 'Paths', type: 'readonly', description: 'Root directory for all data storage' },
  { key: 'CHROMA_URL', label: 'ChromaDB URL', group: 'Paths', type: 'readonly', description: 'ChromaDB server URL for vector embeddings' },

  // Secrets (read-only — show set/unset status)
  { key: 'OPENAI_API_KEY', label: 'OpenAI API Key', group: 'Secrets', type: 'readonly', description: 'Required for LLM and embedding calls' },
  { key: 'TELEGRAM_BOT_TOKEN', label: 'Telegram Bot Token', group: 'Secrets', type: 'readonly', description: 'Required for Telegram bot' },
  { key: 'GITHUB_TOKEN', label: 'GitHub Token', group: 'Secrets', type: 'readonly', description: 'Required for GitHub tool authentication' },
  { key: 'WEBHOOK_URL', label: 'Webhook URL', group: 'Secrets', type: 'readonly', description: 'Telegram webhook URL' },
];

function getConfigValue(key: string): unknown {
  return (cfg as Record<string, unknown>)[key];
}

function maskSecret(key: string, value: unknown): string {
  const secretKeys = ['OPENAI_API_KEY', 'TELEGRAM_BOT_TOKEN', 'GITHUB_TOKEN'];
  if (secretKeys.includes(key)) {
    const strVal = String(value ?? '');
    if (!strVal) return '(not set)';
    return strVal.slice(0, 4) + '****' + strVal.slice(-4);
  }
  return String(value ?? '');
}

function getAllConfig(): Array<ConfigField & { value: string }> {
  return CONFIG_FIELDS.map(field => ({
    ...field,
    value: field.group === 'Secrets'
      ? maskSecret(field.key, getConfigValue(field.key))
      : String(getConfigValue(field.key) ?? ''),
  }));
}

/** Get memory stats: counts of facts, decisions, learnings, registry entries */
function getMemoryStats(): Record<string, number> {
  const stats: Record<string, number> = {};
  const files: Record<string, string> = {
    facts: cfg.FACTS_FILE,
    decisions: cfg.DECISIONS_FILE,
    learnings: cfg.LEARNINGS_FILE,
    registry: cfg.REGISTRY_FILE,
  };
  for (const [name, path] of Object.entries(files)) {
    try {
      if (existsSync(path)) {
        const data = JSON.parse(readFileSync(path, 'utf-8'));
        stats[name] = Array.isArray(data) ? data.length : 0;
      } else {
        stats[name] = 0;
      }
    } catch {
      stats[name] = 0;
    }
  }
  return stats;
}

/** Get allowed users list */
function getAllowedUsers(): Record<string, string> {
  return cfg.ALLOWED_USERS;
}

export function createDashboardRouter(): Router {
  const router = Router();

  // --- API endpoints ---

  router.get('/api/config', (_req: Request, res: Response) => {
    res.json({
      config: getAllConfig(),
      memory: getMemoryStats(),
      allowedUsers: getAllowedUsers(),
    });
  });

  router.post('/api/config', (req: Request, res: Response) => {
    const updates = req.body as Record<string, string | number>;
    const results: Array<{ key: string; success: boolean; error?: string }> = [];

    for (const [key, value] of Object.entries(updates)) {
      const field = CONFIG_FIELDS.find(f => f.key === key);
      if (!field) {
        results.push({ key, success: false, error: 'Unknown config key' });
        continue;
      }
      if (field.type === 'readonly') {
        results.push({ key, success: false, error: 'Read-only setting' });
        continue;
      }

      try {
        if (field.type === 'number') {
          const num = Number(value);
          if (isNaN(num) || num < 0) {
            results.push({ key, success: false, error: 'Must be a non-negative number' });
            continue;
          }
          (cfg as Record<string, unknown>)[key] = num;
        } else {
          (cfg as Record<string, unknown>)[key] = String(value);
        }
        results.push({ key, success: true });
      } catch (e) {
        results.push({ key, success: false, error: String(e) });
      }
    }

    res.json({ results, config: getAllConfig() });
  });

  // --- Dashboard HTML ---

  router.get('/', (_req: Request, res: Response) => {
    res.type('html').send(dashboardHtml());
  });

  return router;
}

function dashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Jarvus Config Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f0f0f;
      color: #e0e0e0;
      min-height: 100vh;
    }
    .header {
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      padding: 24px 32px;
      border-bottom: 1px solid #2a2a4a;
    }
    .header h1 {
      font-size: 24px;
      font-weight: 600;
      color: #fff;
    }
    .header p {
      font-size: 14px;
      color: #888;
      margin-top: 4px;
    }
    .container {
      max-width: 960px;
      margin: 0 auto;
      padding: 24px 16px;
    }
    .stats-bar {
      display: flex;
      gap: 16px;
      margin-bottom: 24px;
      flex-wrap: wrap;
    }
    .stat-card {
      background: #1a1a2e;
      border: 1px solid #2a2a4a;
      border-radius: 8px;
      padding: 16px 20px;
      flex: 1;
      min-width: 140px;
    }
    .stat-card .label { font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
    .stat-card .value { font-size: 28px; font-weight: 700; color: #4fc3f7; margin-top: 4px; }
    .group {
      background: #1a1a1a;
      border: 1px solid #2a2a2a;
      border-radius: 8px;
      margin-bottom: 16px;
      overflow: hidden;
    }
    .group-header {
      background: #1a1a2e;
      padding: 12px 20px;
      font-size: 14px;
      font-weight: 600;
      color: #4fc3f7;
      border-bottom: 1px solid #2a2a4a;
      cursor: pointer;
      user-select: none;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .group-header:hover { background: #1e1e38; }
    .group-header .arrow { transition: transform 0.2s; }
    .group-header.collapsed .arrow { transform: rotate(-90deg); }
    .group-body { padding: 0; }
    .group-body.hidden { display: none; }
    .config-row {
      display: flex;
      align-items: center;
      padding: 12px 20px;
      border-bottom: 1px solid #1f1f1f;
      gap: 16px;
    }
    .config-row:last-child { border-bottom: none; }
    .config-row .info { flex: 1; min-width: 0; }
    .config-row .info .name { font-size: 14px; font-weight: 500; color: #e0e0e0; }
    .config-row .info .desc { font-size: 12px; color: #666; margin-top: 2px; }
    .config-row input {
      width: 200px;
      padding: 6px 10px;
      border: 1px solid #333;
      border-radius: 4px;
      background: #111;
      color: #e0e0e0;
      font-size: 14px;
      font-family: 'SF Mono', Monaco, monospace;
    }
    .config-row input:focus { outline: none; border-color: #4fc3f7; }
    .config-row input[readonly] {
      background: #0a0a0a;
      color: #666;
      border-color: #222;
    }
    .config-row .badge {
      display: inline-block;
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 3px;
      margin-left: 8px;
    }
    .badge-set { background: #1b5e20; color: #81c784; }
    .badge-unset { background: #4a1c1c; color: #ef9a9a; }
    .badge-readonly { background: #333; color: #999; }
    .save-bar {
      position: sticky;
      bottom: 0;
      background: #1a1a2e;
      border-top: 1px solid #2a2a4a;
      padding: 12px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      opacity: 0;
      transform: translateY(100%);
      transition: all 0.3s;
    }
    .save-bar.visible { opacity: 1; transform: translateY(0); }
    .save-bar .status { font-size: 14px; color: #888; }
    .save-bar button {
      padding: 8px 24px;
      background: #4fc3f7;
      color: #000;
      border: none;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }
    .save-bar button:hover { background: #29b6f6; }
    .save-bar button:disabled { background: #333; color: #666; cursor: not-allowed; }
    .toast {
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 6px;
      font-size: 14px;
      opacity: 0;
      transition: opacity 0.3s;
      z-index: 100;
    }
    .toast.show { opacity: 1; }
    .toast.success { background: #1b5e20; color: #81c784; }
    .toast.error { background: #4a1c1c; color: #ef9a9a; }
    .users-section {
      background: #1a1a1a;
      border: 1px solid #2a2a2a;
      border-radius: 8px;
      margin-bottom: 16px;
      overflow: hidden;
    }
    .users-section .group-header { background: #1a1a2e; }
    .user-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 20px;
      border-bottom: 1px solid #1f1f1f;
      font-size: 14px;
    }
    .user-row:last-child { border-bottom: none; }
    .user-row .username { color: #4fc3f7; font-family: 'SF Mono', Monaco, monospace; }
    .user-row .displayname { color: #888; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Jarvus Config Dashboard</h1>
    <p>View and tune runtime configuration for Root, the Enotrium intelligence agent</p>
  </div>

  <div class="container">
    <div class="stats-bar" id="stats-bar"></div>
    <div id="config-groups"></div>
    <div class="users-section" id="users-section"></div>
  </div>

  <div class="save-bar" id="save-bar">
    <span class="status" id="save-status">Unsaved changes</span>
    <button id="save-btn" onclick="saveConfig()">Save Changes</button>
  </div>

  <div class="toast" id="toast"></div>

  <script>
    let originalValues = {};
    let currentValues = {};
    let configData = [];

    async function loadConfig() {
      const resp = await fetch('/dashboard/api/config');
      const data = await resp.json();
      configData = data.config;
      renderStats(data.memory);
      renderConfig(data.config);
      renderUsers(data.allowedUsers);
    }

    function renderStats(memory) {
      const bar = document.getElementById('stats-bar');
      bar.innerHTML = [
        { label: 'Facts', value: memory.facts },
        { label: 'Decisions', value: memory.decisions },
        { label: 'Learnings', value: memory.learnings },
        { label: 'Registry Entries', value: memory.registry },
      ].map(s => '<div class="stat-card"><div class="label">' + s.label + '</div><div class="value">' + s.value + '</div></div>').join('');
    }

    function renderConfig(fields) {
      const groups = {};
      fields.forEach(f => {
        if (!groups[f.group]) groups[f.group] = [];
        groups[f.group].push(f);
      });

      const container = document.getElementById('config-groups');
      container.innerHTML = '';

      for (const [groupName, groupFields] of Object.entries(groups)) {
        const group = document.createElement('div');
        group.className = 'group';

        const header = document.createElement('div');
        header.className = 'group-header';
        header.innerHTML = groupName + ' <span class="arrow">&#9660;</span>';
        header.onclick = function() {
          header.classList.toggle('collapsed');
          body.classList.toggle('hidden');
        };

        const body = document.createElement('div');
        body.className = 'group-body';

        groupFields.forEach(field => {
          originalValues[field.key] = field.value;
          currentValues[field.key] = field.value;

          const row = document.createElement('div');
          row.className = 'config-row';

          let inputHtml;
          if (field.type === 'readonly') {
            let badge = '';
            if (field.group === 'Secrets') {
              const isSet = field.value && field.value !== '(not set)';
              badge = isSet
                ? '<span class="badge badge-set">SET</span>'
                : '<span class="badge badge-unset">NOT SET</span>';
            } else {
              badge = '<span class="badge badge-readonly">read-only</span>';
            }
            inputHtml = '<input type="text" value="' + escapeAttr(field.value) + '" readonly />' + badge;
          } else {
            inputHtml = '<input type="' + (field.type === 'number' ? 'number' : 'text') + '" ' +
              'value="' + escapeAttr(field.value) + '" ' +
              'data-key="' + field.key + '" ' +
              'onchange="onFieldChange(this)" oninput="onFieldChange(this)" />';
          }

          row.innerHTML = '<div class="info"><div class="name">' + field.key + '</div>' +
            '<div class="desc">' + field.description + '</div></div>' + inputHtml;
          body.appendChild(row);
        });

        group.appendChild(header);
        group.appendChild(body);
        container.appendChild(group);
      }
    }

    function renderUsers(users) {
      const section = document.getElementById('users-section');
      let rows = '';
      for (const [username, displayName] of Object.entries(users)) {
        rows += '<div class="user-row"><span class="username">@' + username + '</span><span class="displayname">' + displayName + '</span></div>';
      }
      section.innerHTML = '<div class="group-header" onclick="this.classList.toggle(\'collapsed\');this.nextElementSibling.classList.toggle(\'hidden\')">Allowed Users <span class="arrow">&#9660;</span></div><div class="group-body">' + rows + '</div>';
    }

    function onFieldChange(input) {
      const key = input.dataset.key;
      currentValues[key] = input.value;
      checkDirty();
    }

    function checkDirty() {
      let dirty = false;
      for (const key of Object.keys(currentValues)) {
        if (currentValues[key] !== originalValues[key]) {
          dirty = true;
          break;
        }
      }
      const bar = document.getElementById('save-bar');
      if (dirty) {
        bar.classList.add('visible');
      } else {
        bar.classList.remove('visible');
      }
    }

    async function saveConfig() {
      const btn = document.getElementById('save-btn');
      btn.disabled = true;
      btn.textContent = 'Saving...';

      const updates = {};
      for (const key of Object.keys(currentValues)) {
        if (currentValues[key] !== originalValues[key]) {
          const field = configData.find(f => f.key === key);
          updates[key] = field && field.type === 'number' ? Number(currentValues[key]) : currentValues[key];
        }
      }

      try {
        const resp = await fetch('/dashboard/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });
        const data = await resp.json();

        const failed = data.results.filter(r => !r.success);
        if (failed.length) {
          showToast('Some settings failed: ' + failed.map(f => f.key + ': ' + f.error).join(', '), 'error');
        } else {
          showToast('Config updated successfully!', 'success');
        }

        // Refresh
        configData = data.config;
        renderConfig(data.config);
        document.getElementById('save-bar').classList.remove('visible');

        // Reload stats
        const statsResp = await fetch('/dashboard/api/config');
        const statsData = await statsResp.json();
        renderStats(statsData.memory);
      } catch (e) {
        showToast('Failed to save: ' + e.message, 'error');
      }

      btn.disabled = false;
      btn.textContent = 'Save Changes';
    }

    function showToast(msg, type) {
      const toast = document.getElementById('toast');
      toast.textContent = msg;
      toast.className = 'toast show ' + type;
      setTimeout(() => { toast.className = 'toast'; }, 3000);
    }

    function escapeAttr(str) {
      return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    loadConfig();
  </script>
</body>
</html>`;
}
