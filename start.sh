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

# Fail if ChromaDB didn't start
if ! curl -s http://localhost:8000/api/v1/heartbeat > /dev/null 2>&1; then
  echo "ChromaDB failed to start within 30 seconds"
  exit 1
fi

# Start Node app
exec npx tsx src/index.ts
