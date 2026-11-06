import { sortear } from './draw.js';

export const PIX_TTL_MS = 15 * 60 * 1000;

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function expirarPendentes(db, peladaId, agora) {
  return db.prepare(`UPDATE inscricoes SET status='EXPIRADO'
    WHERE pelada_id=? AND status='PENDENTE_PAGAMENTO' AND pix_expira_em<=?`).run(peladaId, agora).changes;
}

export const vagasOcupadas = (db, peladaId) =>
  db.prepare(`SELECT COUNT(*) c FROM inscricoes WHERE pelada_id=? AND status IN ('CONFIRMADO','PENDENTE_PAGAMENTO')`)
    .get(peladaId).c;

export function realizarSorteio(db, peladaId, agora) {
  const p = db.prepare('SELECT * FROM peladas WHERE id=?').get(peladaId);
  if (!p) throw new HttpError(404, 'Pelada não encontrada');
  if (p.status !== 'ABERTA') throw new HttpError(409, 'Sorteio já realizado');
  expirarPendentes(db, p.id, agora);

  // Filtro automático: só CONFIRMADO entra no sorteio
  const jogadores = db.prepare(`SELECT u.id, u.posicao_principal posicao, u.nota_media, i.nivel_organizador
      FROM inscricoes i JOIN users u ON u.id=i.user_id
      WHERE i.pelada_id=? AND i.status='CONFIRMADO'`).all(p.id)
    .map((r) => ({ id: r.id, posicao: r.posicao, nota: r.nivel_organizador ?? r.nota_media }));

  let times;
  try { times = sortear(p.tipo_sorteio, jogadores, p.tamanho_time); }
  catch (e) { throw new HttpError(422, e.message); }

  db.transaction(() => {
    db.prepare(`UPDATE inscricoes SET status='CANCELADO' WHERE pelada_id=? AND status='PENDENTE_PAGAMENTO'`).run(p.id);
    times.forEach((t, i) => {
      const media = t.jogadores.reduce((s, j) => s + j.nota, 0) / t.jogadores.length;
      const { lastInsertRowid } = db.prepare('INSERT INTO times (pelada_id,nome,media) VALUES (?,?,?)')
        .run(p.id, `Time ${String.fromCharCode(65 + i)}`, media);
      for (const j of t.jogadores)
        db.prepare('UPDATE inscricoes SET time_id=? WHERE pelada_id=? AND user_id=?').run(lastInsertRowid, p.id, j.id);
    });
    db.prepare(`UPDATE peladas SET status='SORTEADA' WHERE id=?`).run(p.id);
  })();
  return escalacao(db, p.id);
}

export function escalacao(db, peladaId) {
  const times = db.prepare('SELECT * FROM times WHERE pelada_id=? ORDER BY id').all(peladaId);
  return times.map((t) => ({
    ...t,
    jogadores: db.prepare(`SELECT u.id, u.apelido, u.posicao_principal posicao, u.nota_media nota
      FROM inscricoes i JOIN users u ON u.id=i.user_id WHERE i.time_id=?
      ORDER BY (u.posicao_principal='GOLEIRO') DESC, u.apelido`).all(t.id),
  }));
}

export function textoWhatsApp(pelada, times) {
  const data = new Date(pelada.data_hora).toLocaleString('pt-BR', { timeZone: 'America/Recife' });
  const blocos = times.map((t) =>
    `*${t.nome}* (nível ${t.media.toFixed(1)})\n` +
    t.jogadores.map((j) => `${j.posicao === 'GOLEIRO' ? '🧤' : '⚽'} ${j.apelido}`).join('\n'));
  return `⚽ *Pelada - ${pelada.local}*\n📅 ${data}\n\n${blocos.join('\n\n')}`;
}

// Sorteia automaticamente peladas cujo horário limite passou
export function sortearVencidas(db, agora) {
  const ids = db.prepare(`SELECT id FROM peladas WHERE status='ABERTA' AND limite_sorteio<=?`).all(agora);
  const resultados = [];
  for (const { id } of ids) {
    try { realizarSorteio(db, id, agora); resultados.push({ id, ok: true }); }
    catch (e) { resultados.push({ id, ok: false, erro: e.message }); }
  }
  return resultados;
}
