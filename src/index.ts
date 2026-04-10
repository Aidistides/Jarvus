import express from 'express';
import { createBot } from './bot.js';
import { ensureDirs, WEBHOOK_URL } from './config.js';

const app = express();
app.use(express.json());

const bot = createBot();

app.post('/webhook', (req, res) => {
  bot.handleUpdate(req.body);
  res.sendStatus(200);
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'root' });
});

const PORT = process.env.PORT ?? 8080;

async function start() {
  ensureDirs();

  if (WEBHOOK_URL) {
    const webhookUrl = `${WEBHOOK_URL}/webhook`;
    await bot.telegram.setWebhook(webhookUrl);
    console.log(`Webhook set to ${webhookUrl}`);
  } else {
    console.warn('No WEBHOOK_URL set — bot won\'t receive messages via webhook');
  }

  app.listen(PORT, () => {
    console.log(`Root is listening on port ${PORT}`);
  });
}

start().catch(console.error);
