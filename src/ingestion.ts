import { readFileSync, writeFileSync } from 'fs';
import { extname, basename, join } from 'path';
import { read, utils } from 'xlsx';
import * as cfg from './config.js';
import { KnowledgeStore } from './knowledge.js';

export async function extractText(filePath: string): Promise<string> {
  const ext = extname(filePath).toLowerCase();

  if (ext === '.pdf') {
    return extractPdf(filePath);
  } else if (['.xlsx', '.xls', '.xlt'].includes(ext)) {
    return extractSpreadsheet(filePath);
  } else if (ext === '.csv') {
    return extractCsv(filePath);
  } else {
    try {
      return readFileSync(filePath, 'utf-8');
    } catch {
      return '';
    }
  }
}

async function extractPdf(filePath: string): Promise<string> {
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const data = new Uint8Array(readFileSync(filePath));
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();
      const text = textContent.items.map((item: any) => item.str).join(' ');
      if (text.trim()) pages.push(text);
    }
    return pages.join('\n\n');
  } catch {
    return '';
  }
}

function extractSpreadsheet(filePath: string): string {
  try {
    const workbook = read(readFileSync(filePath));
    const parts: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = utils.sheet_to_csv(sheet);
      parts.push(`## Sheet: ${sheetName}\n${csv}`);
    }
    return parts.join('\n\n');
  } catch {
    return '';
  }
}

function extractCsv(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

export function chunkText(text: string, chunkSize = 500, overlap = 50): string[] {
  const charSize = chunkSize * 4;
  const charOverlap = overlap * 4;

  if (text.trim().length === 0) return [];
  if (text.length <= charSize) return [text];

  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = start + charSize;
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    start = end - charOverlap;
  }
  return chunks;
}

export async function ingestDocument(
  filePath: string,
  uploadedBy: string
): Promise<{ source_file: string; chunk_count: number; text_length?: number; error?: string }> {
  const text = await extractText(filePath);
  if (!text.trim()) {
    return { source_file: basename(filePath), chunk_count: 0, error: 'No text extracted' };
  }

  // Save processed text
  const processedFile = join(cfg.PROCESSED_DIR, `${basename(filePath, extname(filePath))}.txt`);
  writeFileSync(processedFile, text);

  const chunks = chunkText(text);
  if (!chunks.length) {
    return { source_file: basename(filePath), chunk_count: 0, error: 'No chunks generated' };
  }

  const store = new KnowledgeStore();
  let sourceType = extname(filePath).slice(1).toLowerCase();
  if (['xls', 'xlt'].includes(sourceType)) sourceType = 'xlsx';

  await store.addDocument(basename(filePath), chunks, {
    source_type: sourceType,
    uploaded_by: uploadedBy,
  });

  return {
    source_file: basename(filePath),
    chunk_count: chunks.length,
    text_length: text.length,
  };
}
