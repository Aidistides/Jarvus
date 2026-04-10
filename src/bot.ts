import { Telegraf, Context } from 'telegraf';
import { message } from 'telegraf/filters';
import { writeFileSync } from 'fs';
import { join } from 'path';
import * as cfg from './config.js';
import { getResponse, formatToolStatus } from './agent.js';
import { saveTranscript, loadRecentTranscript } from './memory.js';
import { extractFromConversation } from './extraction.js';
import { ingestDocument } from './ingestion.js';

function identifyUser(from: { id: number; username?: string }): { userId: string; userName: string } | null {
  if (from.username) {
    const normalized = from.username.toLowerCase().replace(/^@/, '');
    if (normalized in cfg.ALLOWED_USERS) {
      return { userId: String(from.id), userName: cfg.ALLOWED_USERS[normalized] };
    }
  }
  const idStr = String(from.id);
  if (idStr in cfg.ALLOWED_USERS) {
    return { userId: idStr, userName: cfg.ALLOWED_USERS[idStr] };
  }
  return null;
}

export function createBot(): Telegraf {
  const bot = new Telegraf(cfg.TELEGRAM_BOT_TOKEN, {
    handlerTimeout: 10 * 60 * 1000, // 10 minutes — needed for long-running agent tasks (e.g. agentvibe conversations)
  });

  bot.start(async (ctx) => {
    const identity = identifyUser(ctx.from);
    if (identity) {
      await ctx.reply(
        `Hey ${identity.userName}! I'm Root, Enotrium's intelligence agent. ` +
        `Send me a message or upload a document to get started.`
      );
    } else {
      await ctx.reply(
        `Hey! Your Telegram user ID is \`${ctx.from.id}\`. ` +
        `Ask Tanay to add this to Root's allowlist in config.ts.`,
        { parse_mode: 'Markdown' },
      );
    }
  });

  bot.on(message('text'), async (ctx) => {
    const identity = identifyUser(ctx.from);
    if (!identity) {
      await ctx.reply(
        `Hey — I don't recognize you yet. Your Telegram user ID is \`${ctx.from.id}\`. ` +
        `Ask Tanay to add you to Root's allowlist.`,
        { parse_mode: 'Markdown' },
      );
      return;
    }

    const { userId, userName } = identity;
    const userMessage = ctx.message.text;
    if (!userMessage) return;

    console.log(`Message from ${userName} (${userId}): ${userMessage.slice(0, 100)}`);

    // Save user message to transcript
    saveTranscript(userId, 'user', userMessage);

    // Status message tracking
    let statusMessageId: number | null = null;

    const onStatusChange = async (status: string) => {
      try {
        if (statusMessageId === null) {
          const sent = await ctx.reply(status);
          statusMessageId = sent.message_id;
        } else {
          await ctx.telegram.editMessageText(
            ctx.chat.id, statusMessageId, undefined, status,
          );
        }
      } catch (e) {
        console.warn(`Failed to update status message: ${e}`);
      }
    };

    // Get agent response
    const responseText = await getResponse(userId, userName, userMessage, onStatusChange);

    // Delete status message
    if (statusMessageId !== null) {
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, statusMessageId);
      } catch (e) {
        console.warn(`Failed to delete status message: ${e}`);
      }
    }

    // Save assistant response to transcript
    saveTranscript(userId, 'assistant', responseText);

    // Send response (split if >4096 chars, guard against empty)
    const finalText = responseText || 'I explored the code but ran out of steps before summarizing. Try asking a more specific question.';
    if (finalText.length <= 4096) {
      await ctx.reply(finalText);
    } else {
      for (let i = 0; i < finalText.length; i += 4096) {
        await ctx.reply(finalText.slice(i, i + 4096));
      }
    }

    // Run extraction in background (fire-and-forget)
    const recent = loadRecentTranscript(userId, 10);
    extractFromConversation(
      recent.map(m => ({ role: String(m.role), content: String(m.content) })),
      userName,
    ).catch(e => console.error(`Extraction error: ${e}`));
  });

  bot.on(message('document'), async (ctx) => {
    const identity = identifyUser(ctx.from);
    if (!identity) {
      await ctx.reply("I don't recognize you. Ask Tanay to add you to Root's allowlist.");
      return;
    }

    const { userName } = identity;
    const document = ctx.message.document;
    if (!document) return;

    const fileName = document.file_name ?? 'unknown';
    console.log(`File from ${userName}: ${fileName}`);
    await ctx.reply(`Got it — processing \`${fileName}\`...`, { parse_mode: 'Markdown' });

    // Download file
    const fileLink = await ctx.telegram.getFileLink(document.file_id);
    const response = await fetch(fileLink.href);
    const buffer = Buffer.from(await response.arrayBuffer());
    const savePath = join(cfg.SOURCES_DIR, fileName);
    writeFileSync(savePath, buffer);

    // Ingest
    const result = await ingestDocument(savePath, userName);

    if (result.error) {
      await ctx.reply(`Had trouble with \`${fileName}\`: ${result.error}`);
    } else {
      await ctx.reply(
        `Ingested \`${fileName}\` — ${result.chunk_count} chunks indexed. ` +
        `I can now answer questions about this document.`,
        { parse_mode: 'Markdown' },
      );
    }
  });

  return bot;
}
