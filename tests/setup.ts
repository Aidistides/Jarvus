import * as cfg from '../src/config.js';

// Make the mutable path exports patchable from tests.
// Vitest compiles `export let X` into getter-only accessors on the module namespace.
// Since they are configurable, we can redefine them as writable data properties.
const patchableKeys = ['DATA_DIR', 'SYSTEM_PROMPT_FILE', 'CHROMA_DIR', 'FACTS_FILE', 'DECISIONS_FILE', 'LEARNINGS_FILE', 'TRANSCRIPTS_DIR', 'REGISTRY_FILE'] as const;
for (const key of patchableKeys) {
  const currentValue = (cfg as any)[key];
  Object.defineProperty(cfg, key, {
    get() { return (cfg as any)[`_${key}`] ?? currentValue; },
    set(v: string) { (cfg as any)[`_${key}`] = v; },
    configurable: true,
    enumerable: true,
  });
}
