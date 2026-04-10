FROM node:20-slim

# Install Python + ChromaDB server
RUN apt-get update && apt-get install -y python3 python3-pip python3-venv curl && \
    python3 -m venv /opt/chroma-venv && \
    /opt/chroma-venv/bin/pip install chromadb && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src/ src/
COPY tsconfig.json ./
COPY start.sh ./

RUN chmod +x start.sh

ENV DATA_DIR=/data
ENV CHROMA_URL=http://localhost:8000

EXPOSE 8080

CMD ["./start.sh"]
