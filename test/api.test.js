import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { MockPix } from '../src/pix.js';
import { createApp } from '../src/app.js';
import { sortearVencidas } from '../src/services.js';

const H = 3600_000;
async function setup() {
  let t = Date.parse('2026-11-06T12:00:00Z');
  const db = openDb();
  const app = createApp({ db, pix: new MockPix(), secret: 's', webhookSecret: 'w', now: () => t });
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (method, path, body, token, headers = {}) => {
    const r = await fetch(base + path, {
      method, headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }), ...headers },
      body: body && JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  };
  return { db, call, srv, avanca: (ms) => (t += ms), agora: () => t };
}

async function cadastra(call, n, gk = false) {
  const r = await call('POST', '/auth/register', {
    email: `j${n}@x.com`, senha: '123456', nome: `Jogador ${n}`, apelido: `J${n}`,
    posicao_principal: gk ? 'GOLEIRO' : 'LINHA',
  });
  assert.equal(r.status, 201);
  return r.body;
}

test('fluxo completo: pelada -> PIX -> webhook -> sorteio -> times', async () => {
  const { db, call, srv, agora } = await setup();
  const org = await cadastra(call, 0, true);
  const p = (await call('POST', '/peladas', {
    local: 'Quadra X', data_hora: new Date(agora() + 5 * H).toISOString(),
    limite_sorteio: new Date(agora() + 2 * H).toISOString(),
    valor_centavos: 2000, tamanho_time: 3, vagas: 6, tipo_sorteio: 'NIVEL_TECNICO',
  }, org.token)).body;

  const jogadores = [org];
  for (let n = 1; n < 6; n++) jogadores.push(await cadastra(call, n, n === 1));

  for (const j of jogadores) {
    const ins = await call('POST', `/peladas/${p.id}/inscricao`, {}, j.token);
    assert.equal(ins.status, 201);
    const txid = db.prepare('SELECT pix_txid FROM inscricoes WHERE user_id=? AND pelada_id=?').get(j.user.id, p.id).pix_txid;
    assert.equal((await call('POST', '/webhooks/pix', { txid, status: 'PAGO' }, null, { 'x-webhook-secret': 'errado' })).status, 401);
    assert.equal((await call('POST', '/webhooks/pix', { txid, status: 'PAGO' }, null, { 'x-webhook-secret': 'w' })).status, 200);
  }
  assert.equal((await call('GET', `/peladas/${p.id}`, null, org.token)).body.vagas_restantes, 0);
  const extra = await cadastra(call, 9);
  assert.equal((await call('POST', `/peladas/${p.id}/inscricao`, {}, extra.token)).status, 409);

  assert.equal((await call('POST', `/peladas/${p.id}/sorteio`, {}, jogadores[1].token)).status, 403);
  const sorteio = await call('POST', `/peladas/${p.id}/sorteio`, {}, org.token);
  assert.equal(sorteio.status, 200);
  assert.equal(sorteio.body.length, 2);
  assert.ok(sorteio.body.every((t) => t.jogadores.length === 3));
  const r = await call('GET', `/peladas/${p.id}/times`, null, org.token);
  assert.match(r.body.texto_whatsapp, /Time A/);
  srv.closeAllConnections(); srv.close();
});

test('PIX pendente expira em 15 min e libera a vaga', async () => {
  const { call, srv, avanca, agora } = await setup();
  const org = await cadastra(call, 0);
  const p = (await call('POST', '/peladas', {
    local: 'Q', data_hora: new Date(agora() + 5 * H).toISOString(), limite_sorteio: new Date(agora() + 4 * H).toISOString(),
    valor_centavos: 1000, tamanho_time: 2, vagas: 1, tipo_sorteio: 'ALEATORIO',
  }, org.token)).body;
  const a = await cadastra(call, 1), b = await cadastra(call, 2);
  assert.equal((await call('POST', `/peladas/${p.id}/inscricao`, {}, a.token)).status, 201);
  assert.equal((await call('POST', `/peladas/${p.id}/inscricao`, {}, b.token)).status, 409);
  avanca(16 * 60_000);
  assert.equal((await call('POST', `/peladas/${p.id}/inscricao`, {}, b.token)).status, 201);
  srv.closeAllConnections(); srv.close();
});

test('sorteio automático no horário limite', async () => {
  const { db, call, srv, avanca, agora } = await setup();
  const org = await cadastra(call, 0);
  const p = (await call('POST', '/peladas', {
    local: 'Q', data_hora: new Date(agora() + 5 * H).toISOString(), limite_sorteio: new Date(agora() + 1 * H).toISOString(),
    valor_centavos: 0, tamanho_time: 2, vagas: 4, tipo_sorteio: 'ALEATORIO',
  }, org.token)).body;
  for (let n = 1; n <= 4; n++) {
    const j = await cadastra(call, n);
    await call('POST', `/peladas/${p.id}/inscricao`, {}, j.token);
    const txid = db.prepare('SELECT pix_txid FROM inscricoes WHERE user_id=?').get(j.user.id).pix_txid;
    await call('POST', '/webhooks/pix', { txid, status: 'PAGO' }, null, { 'x-webhook-secret': 'w' });
  }
  assert.equal(sortearVencidas(db, agora()).length, 0);
  avanca(2 * H);
  assert.deepEqual(sortearVencidas(db, agora()), [{ id: p.id, ok: true }]);
  assert.equal(db.prepare('SELECT status FROM peladas WHERE id=?').get(p.id).status, 'SORTEADA');
  srv.closeAllConnections(); srv.close();
});
