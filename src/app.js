import express from 'express';
import { randomBytes } from 'node:crypto';
import { hashSenha, verificaSenha, criaToken, verificaToken } from './auth.js';
import {
  HttpError, PIX_TTL_MS, expirarPendentes, vagasOcupadas, realizarSorteio, escalacao, textoWhatsApp,
} from './services.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const exige = (cond, msg, status = 400) => { if (!cond) throw new HttpError(status, msg); };
const pub = ({ senha_hash, ...u }) => ({ ...u, posicoes_secundarias: JSON.parse(u.posicoes_secundarias) });

export function createApp({ db, pix, secret, webhookSecret, now = () => Date.now() }) {
  const app = express();
  app.use(express.json());

  const auth = (req, _res, next) => {
    const p = verificaToken((req.headers.authorization || '').replace('Bearer ', ''), secret, now());
    if (!p) return next(new HttpError(401, 'Não autenticado'));
    req.userId = p.sub; next();
  };
  const getPelada = (id) => {
    const p = db.prepare('SELECT * FROM peladas WHERE id=?').get(id);
    exige(p, 'Pelada não encontrada', 404); return p;
  };
  const soOrganizador = (p, userId) => exige(p.organizador_id === userId, 'Apenas o organizador', 403);

  // ---- Módulo 1: autenticação & perfil ----
  app.post('/auth/register', wrap((req, res) => {
    const { email, senha, nome, apelido, posicao_principal = 'LINHA', posicoes_secundarias = [] } = req.body;
    exige(email && /\S+@\S+\.\S+/.test(email), 'E-mail inválido');
    exige(senha && senha.length >= 6, 'Senha deve ter ao menos 6 caracteres');
    exige(nome && apelido, 'Nome e apelido são obrigatórios');
    exige(['GOLEIRO', 'LINHA'].includes(posicao_principal), 'Posição inválida');
    exige(!db.prepare('SELECT 1 FROM users WHERE email=?').get(email), 'E-mail já cadastrado', 409);
    const { lastInsertRowid: id } = db.prepare(
      'INSERT INTO users (email,senha_hash,nome,apelido,posicao_principal,posicoes_secundarias) VALUES (?,?,?,?,?,?)')
      .run(email, hashSenha(senha), nome, apelido, posicao_principal, JSON.stringify(posicoes_secundarias));
    res.status(201).json({ token: criaToken(id, secret, undefined, now()), user: pub(db.prepare('SELECT * FROM users WHERE id=?').get(id)) });
  }));

  app.post('/auth/login', wrap((req, res) => {
    const u = db.prepare('SELECT * FROM users WHERE email=?').get(req.body.email);
    exige(u && verificaSenha(req.body.senha || '', u.senha_hash), 'Credenciais inválidas', 401);
    res.json({ token: criaToken(u.id, secret, undefined, now()), user: pub(u) });
  }));

  app.get('/me', auth, wrap((req, res) => res.json(pub(db.prepare('SELECT * FROM users WHERE id=?').get(req.userId)))));

  // ---- Módulo 2: criação de peladas ----
  app.post('/peladas', auth, wrap((req, res) => {
    const b = req.body;
    const data = Date.parse(b.data_hora), limite = Date.parse(b.limite_sorteio);
    exige(b.local, 'Local obrigatório');
    exige(!isNaN(data) && !isNaN(limite), 'Datas inválidas (use ISO 8601)');
    exige(limite <= data, 'O horário limite deve ser anterior ao jogo');
    exige(Number.isInteger(b.valor_centavos) && b.valor_centavos >= 0, 'valor_centavos inválido');
    exige(Number.isInteger(b.tamanho_time) && b.tamanho_time >= 2, 'tamanho_time inválido');
    exige(['ALEATORIO', 'NIVEL_TECNICO'].includes(b.tipo_sorteio), 'tipo_sorteio inválido');
    const vagas = b.vagas ?? b.tamanho_time * 2;
    exige(Number.isInteger(vagas) && vagas >= 2, 'vagas inválido');
    const { lastInsertRowid: id } = db.prepare(`INSERT INTO peladas
      (organizador_id,local,data_hora,limite_sorteio,valor_centavos,tamanho_time,vagas,tipo_sorteio)
      VALUES (?,?,?,?,?,?,?,?)`).run(req.userId, b.local, data, limite, b.valor_centavos, b.tamanho_time, vagas, b.tipo_sorteio);
    res.status(201).json(getPelada(id));
  }));

  // ---- Módulo 3: detalhes, inscrição e pagamento ----
  app.get('/peladas/:id', auth, wrap((req, res) => {
    const p = getPelada(req.params.id);
    expirarPendentes(db, p.id, now());
    res.json({ ...p, vagas_restantes: p.vagas - vagasOcupadas(db, p.id) });
  }));

  app.post('/peladas/:id/inscricao', auth, wrap(async (req, res) => {
    const p = getPelada(req.params.id);
    const agora = now();
    expirarPendentes(db, p.id, agora);
    exige(p.status === 'ABERTA' && agora < p.limite_sorteio, 'Inscrições encerradas', 409);
    const atual = db.prepare('SELECT * FROM inscricoes WHERE pelada_id=? AND user_id=?').get(p.id, req.userId);
    exige(!atual || atual.status !== 'CONFIRMADO', 'Você já está confirmado', 409);
    if (atual?.status === 'PENDENTE_PAGAMENTO')
      return res.json({ status: atual.status, pix_copia_cola: atual.pix_copia_cola, expira_em: atual.pix_expira_em });
    exige(vagasOcupadas(db, p.id) < p.vagas, 'Sem vagas disponíveis', 409);

    const txid = randomBytes(13).toString('hex');
    const cobranca = await pix.createCharge({ txid, valorCentavos: p.valor_centavos, descricao: `Pelada #${p.id}` });
    const expira = agora + PIX_TTL_MS;
    if (atual) db.prepare(`UPDATE inscricoes SET status='PENDENTE_PAGAMENTO', pix_txid=?, pix_copia_cola=?, pix_expira_em=? WHERE id=?`)
      .run(txid, cobranca.copiaECola, expira, atual.id);
    else db.prepare(`INSERT INTO inscricoes (pelada_id,user_id,status,pix_txid,pix_copia_cola,pix_expira_em)
      VALUES (?,?, 'PENDENTE_PAGAMENTO',?,?,?)`).run(p.id, req.userId, txid, cobranca.copiaECola, expira);
    res.status(201).json({ status: 'PENDENTE_PAGAMENTO', pix_copia_cola: cobranca.copiaECola, expira_em: expira });
  }));

  // Webhook chamado pelo gateway quando o PIX é liquidado
  app.post('/webhooks/pix', wrap((req, res) => {
    exige(req.headers['x-webhook-secret'] === webhookSecret, 'Webhook não autorizado', 401);
    const { txid, status } = req.body;
    const i = db.prepare('SELECT * FROM inscricoes WHERE pix_txid=?').get(txid);
    exige(i, 'Cobrança desconhecida', 404);
    if (status === 'PAGO' && i.status !== 'CONFIRMADO') {
      const p = getPelada(i.pelada_id);
      const livre = i.status === 'PENDENTE_PAGAMENTO' || vagasOcupadas(db, p.id) < p.vagas;
      // Pagou após expirar e a vaga já foi tomada => marcar para reembolso
      const novo = p.status !== 'ABERTA' || !livre ? 'REEMBOLSAR' : 'CONFIRMADO';
      db.prepare('UPDATE inscricoes SET status=? WHERE id=?').run(novo, i.id);
    }
    res.json({ ok: true });
  }));

  app.patch('/peladas/:id/jogadores/:userId/nivel', auth, wrap((req, res) => {
    const p = getPelada(req.params.id); soOrganizador(p, req.userId);
    const nivel = Number(req.body.nivel);
    exige(nivel >= 1 && nivel <= 5, 'nivel deve estar entre 1 e 5');
    const r = db.prepare('UPDATE inscricoes SET nivel_organizador=? WHERE pelada_id=? AND user_id=?').run(nivel, p.id, req.params.userId);
    exige(r.changes, 'Jogador não inscrito', 404);
    res.json({ ok: true });
  }));

  // ---- Módulo 4: sorteio ----
  app.post('/peladas/:id/sorteio', auth, wrap((req, res) => {
    const p = getPelada(req.params.id); soOrganizador(p, req.userId);
    res.json(realizarSorteio(db, p.id, now()));
  }));

  app.get('/peladas/:id/times', auth, wrap((req, res) => {
    const p = getPelada(req.params.id);
    exige(p.status !== 'ABERTA', 'Sorteio ainda não realizado', 409);
    const times = escalacao(db, p.id);
    res.json({ times, texto_whatsapp: textoWhatsApp(p, times) });
  }));

  app.use((err, _req, res, _next) => {
    if (!(err instanceof HttpError)) console.error(err);
    res.status(err.status || 500).json({ erro: err.status ? err.message : 'Erro interno' });
  });
  return app;
}
