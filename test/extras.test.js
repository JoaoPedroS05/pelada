import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, cadastra, H } from './helpers.js';

const nova = (agora, extra = {}) => ({
  local: 'Quadra Y', data_hora: new Date(agora + 5 * H).toISOString(), limite_sorteio: new Date(agora + 2 * H).toISOString(),
  valor_centavos: 1500, tamanho_time: 2, vagas: 4, tipo_sorteio: 'NIVEL_TECNICO', ...extra,
});

test('PATCH /me atualiza perfil e valida posição', async () => {
  const { call, fim } = await setup();
  const u = await cadastra(call, 1);
  const r = await call('PATCH', '/me', { apelido: 'Craque', posicoes_secundarias: ['ZAGA'] }, u.token);
  assert.equal(r.status, 200);
  assert.equal(r.body.apelido, 'Craque');
  assert.deepEqual(r.body.posicoes_secundarias, ['ZAGA']);
  assert.equal((await call('PATCH', '/me', { posicao_principal: 'ZAGUEIRO' }, u.token)).status, 400);
  fim();
});

test('listagem e detalhes: inscritos visíveis, nível só para o organizador', async () => {
  const { call, agora, fim } = await setup({ devPay: true });
  const org = await cadastra(call, 0), j = await cadastra(call, 1);
  const p = (await call('POST', '/peladas', nova(agora()), org.token)).body;
  assert.equal((await call('GET', '/peladas', null, j.token)).body.length, 1);
  await call('POST', `/peladas/${p.id}/inscricao`, {}, j.token);
  await call('PATCH', `/peladas/${p.id}/jogadores/${j.user.id}/nivel`, { nivel: 4 }, org.token);
  const doJogador = (await call('GET', `/peladas/${p.id}`, null, j.token)).body;
  assert.equal(doJogador.minha_inscricao.status, 'PENDENTE_PAGAMENTO');
  assert.equal(doJogador.sou_organizador, false);
  assert.equal('nivel_organizador' in doJogador.inscritos[0], false);
  const doOrg = (await call('GET', `/peladas/${p.id}`, null, org.token)).body;
  assert.equal(doOrg.inscritos[0].nivel_organizador, 4);
  assert.equal(doOrg.minha_inscricao, null);
  fim();
});

test('/dev/pagar confirma a inscrição apenas com devPay ligado', async () => {
  const dev = await setup({ devPay: true });
  const org = await cadastra(dev.call, 0), j = await cadastra(dev.call, 1);
  const p = (await dev.call('POST', '/peladas', nova(dev.agora()), org.token)).body;
  await dev.call('POST', `/peladas/${p.id}/inscricao`, {}, j.token);
  assert.equal((await dev.call('POST', '/dev/pagar', { pelada_id: p.id }, j.token)).status, 200);
  assert.equal((await dev.call('GET', `/peladas/${p.id}`, null, j.token)).body.minha_inscricao.status, 'CONFIRMADO');
  assert.equal((await dev.call('GET', '/config')).body.dev, true);
  dev.fim();

  const prod = await setup();
  const u = await cadastra(prod.call, 1);
  assert.equal((await prod.call('POST', '/dev/pagar', { pelada_id: 1 }, u.token)).status, 404);
  prod.fim();
});
