import { openDb } from './db.js';
import { criaGatewayPix } from './pix.js';
import { createApp } from './app.js';
import { sortearVencidas } from './services.js';

const db = openDb(process.env.DB_FILE || 'pelada.db');
const secret = process.env.AUTH_SECRET || 'dev-secret';
const app = createApp({
  db, pix: criaGatewayPix(), secret, devPay: (process.env.PIX_PROVIDER || 'mock') === 'mock',
  webhookSecret: process.env.PIX_WEBHOOK_SECRET || 'dev-webhook',
});

// Sorteio automático no horário limite (verifica a cada 30s)
setInterval(() => {
  for (const r of sortearVencidas(db, Date.now())) console.log('[sorteio-auto]', r);
}, 30_000);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Pelada API em http://localhost:${port}`));
