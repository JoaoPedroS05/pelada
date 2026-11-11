import { openDb } from '../src/db.js';
import { MockPix } from '../src/pix.js';
import { createApp } from '../src/app.js';

export const H = 3600_000;
export async function setup(opts = {}) {
  let t = Date.parse('2026-11-06T12:00:00Z');
  const db = openDb();
  const app = createApp({ db, pix: new MockPix(), secret: 's', webhookSecret: 'w', now: () => t, ...opts });
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (method, path, body, token) => {
    const r = await fetch(base + path, {
      method, headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
      body: body && JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  };
  return { db, call, base, agora: () => t, fim: () => { srv.closeAllConnections(); srv.close(); } };
}
export async function cadastra(call, n, gk = false) {
  const r = await call('POST', '/auth/register', {
    email: `j${n}@x.com`, senha: '123456', nome: `Jogador ${n}`, apelido: `J${n}`,
    posicao_principal: gk ? 'GOLEIRO' : 'LINHA',
  });
  return r.body;
}
