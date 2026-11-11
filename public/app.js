// Frontend da Fase 1 — JS puro, sem build. Todo texto entra via textContent (sem innerHTML).
const app = document.getElementById('app');
const state = { me: null, dev: false, timer: null };

const token = () => localStorage.getItem('token');
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) el.append(kid?.nodeType ? kid : document.createTextNode(kid ?? ''));
  return el;
};
const dinheiro = (c) => (c === 0 ? 'Grátis' : `R$ ${(c / 100).toFixed(2).replace('.', ',')}`);
const quando = (ms) => new Date(ms).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const hora = (ms) => new Date(ms).toLocaleTimeString('pt-BR', { timeStyle: 'short' });

async function api(method, path, body) {
  const r = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json', ...(token() && { authorization: `Bearer ${token()}` }) },
    body: body && JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && token()) sair();
    throw new Error(j.erro || 'Algo deu errado. Tente novamente.');
  }
  return j;
}

function sair() {
  localStorage.removeItem('token'); state.me = null; location.hash = '#/entrar'; route();
}

function mostra(titulo, ...conteudo) {
  clearInterval(state.timer);
  document.title = `${titulo} · Pelada`;
  const atual = location.hash;
  const link = (href, txt) => h('a', { href, 'aria-current': atual.startsWith(href) ? 'page' : null }, txt);
  const topo = h('div', { class: 'topo' }, h('div', { class: 'topo-in' },
    h('a', { class: 'marca', href: '#/peladas' }, 'Pelada'),
    state.me && h('nav', { class: 'menu', 'aria-label': 'Principal' },
      link('#/peladas', 'Peladas'), link('#/nova', 'Nova pelada'),
      h('button', { type: 'button', onclick: sair }, `Sair (${state.me.apelido})`))));
  const main = h('main', { tabindex: '-1' }, h('h1', {}, titulo), ...conteudo);
  app.replaceChildren(topo, main);
  main.focus({ preventScroll: true });
  return main;
}
const erro = (msg) => h('div', { class: 'aviso erro', role: 'alert' }, msg);
const ok = (msg) => h('div', { class: 'aviso ok', role: 'status' }, msg);

// Envia um formulário mostrando erro acima dos campos
function formulario(campos, rotuloBotao, enviar) {
  const aviso = h('div');
  const btn = h('button', { type: 'submit' }, rotuloBotao);
  const form = h('form', {
    novalidate: false,
    onsubmit: async (e) => {
      e.preventDefault(); btn.disabled = true; aviso.replaceChildren();
      try { await enviar(Object.fromEntries(new FormData(form))); }
      catch (err) { aviso.replaceChildren(erro(err.message)); btn.disabled = false; }
    },
  }, aviso, ...campos, btn);
  return form;
}
const campo = (rotulo, nome, attrs = {}) => h('label', {}, rotulo, h('input', { name: nome, ...attrs }));

// ---------- Telas ----------
function telaEntrar(cadastro = false) {
  const main = mostra(cadastro ? 'Criar conta' : 'Entrar',
    h('p', { class: 'sub' }, cadastro ? 'Cadastre-se para entrar nas peladas.' : 'Acesse para ver e entrar nas peladas.'));
  const campos = [
    ...(cadastro ? [
      campo('Nome completo', 'nome', { required: true, autocomplete: 'name' }),
      campo('Apelido', 'apelido', { required: true }),
      h('label', {}, 'Posição principal',
        h('select', { name: 'posicao_principal' }, h('option', { value: 'LINHA' }, 'Linha'), h('option', { value: 'GOLEIRO' }, 'Goleiro'))),
    ] : []),
    campo('E-mail', 'email', { type: 'email', required: true, autocomplete: 'email' }),
    campo('Senha', 'senha', { type: 'password', required: true, minlength: 6, autocomplete: cadastro ? 'new-password' : 'current-password' }),
  ];
  main.append(
    formulario(campos, cadastro ? 'Criar conta' : 'Entrar', async (d) => {
      const r = await api('POST', cadastro ? '/auth/register' : '/auth/login', d);
      localStorage.setItem('token', r.token); state.me = r.user; location.hash = '#/peladas'; route();
    }),
    h('p', { class: 'sub', style: 'margin-top:18px' }, cadastro ? 'Já tem conta? ' : 'Ainda não tem conta? ',
      h('a', { href: cadastro ? '#/entrar' : '#/cadastro' }, cadastro ? 'Entrar' : 'Criar conta')));
}

async function telaLista() {
  const main = mostra('Peladas', h('p', { class: 'sub' }, 'Escolha uma pelada para ver os detalhes e garantir sua vaga.'));
  try {
    const lista = await api('GET', '/peladas');
    if (!lista.length) return main.append(h('p', { class: 'vazio' }, 'Nenhuma pelada marcada ainda. Crie a primeira em “Nova pelada”.'));
    for (const p of lista) main.append(h('a', { class: 'cartao', href: `#/pelada/${p.id}` },
      h('div', { class: 'linha1' }, h('strong', {}, p.local),
        h('span', { class: p.status === 'ABERTA' ? 'etq' : 'etq pend' }, p.status === 'ABERTA' ? 'Aberta' : 'Times sorteados')),
      h('div', { class: 'meta' }, quando(p.data_hora)),
      h('div', { class: 'meta' }, `${dinheiro(p.valor_centavos)} · ${p.vagas_restantes} de ${p.vagas} vagas livres`)));
  } catch (e) { main.append(erro(e.message)); }
}

function telaNova() {
  const main = mostra('Nova pelada', h('p', { class: 'sub' }, 'O sorteio roda sozinho no horário limite.'));
  main.append(formulario([
    campo('Local', 'local', { required: true }),
    h('div', { class: 'dupla' },
      campo('Data e hora do jogo', 'data_hora', { type: 'datetime-local', required: true }),
      campo('Limite para pagar e sortear', 'limite_sorteio', { type: 'datetime-local', required: true })),
    h('div', { class: 'dupla' },
      campo('Valor por jogador (R$)', 'valor', { inputmode: 'decimal', required: true, placeholder: '20,00' }),
      campo('Jogadores por time', 'tamanho_time', { type: 'number', min: 2, value: 5, required: true })),
    campo('Total de vagas (opcional)', 'vagas', { type: 'number', min: 1, placeholder: 'Padrão: dois times cheios' }),
    h('label', {}, 'Tipo de sorteio', h('select', { name: 'tipo_sorteio' },
      h('option', { value: 'NIVEL_TECNICO' }, 'Equilibrado por nível'), h('option', { value: 'ALEATORIO' }, 'Aleatório'))),
  ], 'Criar pelada', async (d) => {
    const valor = Math.round(parseFloat(String(d.valor).replace(',', '.')) * 100);
    if (Number.isNaN(valor) || valor < 0) throw new Error('Informe um valor válido, como 20,00.');
    const tamanho = Number(d.tamanho_time);
    const p = await api('POST', '/peladas', {
      local: d.local, data_hora: new Date(d.data_hora).toISOString(), limite_sorteio: new Date(d.limite_sorteio).toISOString(),
      valor_centavos: valor, tamanho_time: tamanho, vagas: d.vagas ? Number(d.vagas) : tamanho * 2, tipo_sorteio: d.tipo_sorteio,
    });
    location.hash = `#/pelada/${p.id}`;
  }));
}

async function telaPelada(id) {
  const main = mostra('Pelada');
  const corpo = h('div'); main.append(corpo);
  const recarrega = async () => {
    try {
      const p = await api('GET', `/peladas/${id}`);
      const novo = h('div', {}, await detalhe(p, recarrega));
      corpo.replaceChildren(novo);
      main.querySelector('h1').textContent = p.local;
      clearInterval(state.timer);
      if (p.minha_inscricao?.status === 'PENDENTE_PAGAMENTO' || (p.status === 'ABERTA' && !p.sou_organizador))
        state.timer = setInterval(() => { if (document.activeElement?.tagName !== 'INPUT') recarrega(); }, 5000);
    } catch (e) { corpo.replaceChildren(erro(e.message)); }
  };
  recarrega();
}

async function detalhe(p, recarrega) {
  const f = h('div');
  const acao = (rotulo, fn, cls = '') => {
    const b = h('button', { type: 'button', class: cls, onclick: async () => {
      b.disabled = true;
      try { await fn(); await recarrega(); } catch (e) { f.prepend(erro(e.message)); b.disabled = false; }
    } }, rotulo);
    return b;
  };

  f.append(
    h('p', { class: 'sub' }, `${quando(p.data_hora)} · ${dinheiro(p.valor_centavos)} · ${p.tipo_sorteio === 'NIVEL_TECNICO' ? 'times equilibrados por nível' : 'sorteio aleatório'}`),
    h('p', { class: 'meta' }, `Pagamento e sorteio até ${quando(p.limite_sorteio)}. ${p.vagas_restantes} de ${p.vagas} vagas livres.`));

  // --- Minha vaga ---
  const m = p.minha_inscricao;
  f.append(h('h2', {}, 'Sua vaga'));
  if (m?.status === 'CONFIRMADO') f.append(ok('Pagamento confirmado. Você está na pelada!'));
  else if (m?.status === 'REEMBOLSAR') f.append(erro('Seu pagamento chegou depois do prazo e não havia vaga. O organizador fará o reembolso.'));
  else if (m?.status === 'PENDENTE_PAGAMENTO') {
    const codigo = h('textarea', { readonly: true, rows: 3, 'aria-label': 'Código PIX copia e cola' }, m.pix_copia_cola);
    f.append(h('div', { class: 'pix' },
      h('span', { class: 'valor' }, dinheiro(p.valor_centavos)),
      h('p', {}, `Pague com PIX até ${hora(m.pix_expira_em)} para garantir a vaga. Depois disso ela volta para a lista.`),
      codigo,
      h('div', { class: 'acoes' },
        h('button', { type: 'button', onclick: async (e) => { await navigator.clipboard?.writeText(m.pix_copia_cola); e.target.textContent = 'Código copiado'; } }, 'Copiar código'),
        state.dev && acao('Simular pagamento (teste)', () => api('POST', '/dev/pagar', { pelada_id: p.id }), 'sec'))));
  } else if (p.status === 'ABERTA' && Date.now() < p.limite_sorteio) {
    if (m?.status === 'EXPIRADO') f.append(erro('Seu PIX anterior expirou. Gere um novo para tentar de novo.'));
    f.append(p.vagas_restantes > 0
      ? acao(`Entrar e pagar ${dinheiro(p.valor_centavos)}`, () => api('POST', `/peladas/${p.id}/inscricao`, {}))
      : h('p', { class: 'vazio' }, 'Todas as vagas estão ocupadas no momento. Volte mais tarde: vagas de PIX não pago voltam para a lista.'));
  } else f.append(h('p', { class: 'meta' }, 'As inscrições desta pelada estão encerradas.'));

  // --- Inscritos ---
  f.append(h('h2', {}, `Inscritos (${p.inscritos.length})`));
  if (!p.inscritos.length) f.append(h('p', { class: 'vazio' }, 'Ninguém entrou ainda.'));
  else f.append(h('ul', { class: 'lista' }, p.inscritos.map((i) => h('li', {},
    h('span', {}, i.apelido, ' ', i.posicao === 'GOLEIRO' ? h('span', { class: 'gk' }, 'goleiro') : ''),
    h('span', { class: i.status === 'CONFIRMADO' ? 'etq' : 'etq pend' }, i.status === 'CONFIRMADO' ? 'Pago' : 'Aguardando PIX'),
    p.sou_organizador && p.status === 'ABERTA' && p.tipo_sorteio === 'NIVEL_TECNICO' && nivelEditor(p, i)))));

  // --- Organizador ---
  if (p.sou_organizador && p.status === 'ABERTA') {
    f.append(h('h2', {}, 'Organização'),
      h('p', { class: 'meta' }, 'O sorteio acontece sozinho no horário limite. Só entram jogadores com pagamento confirmado.'),
      h('div', { class: 'acoes' }, acao('Sortear times agora', async () => {
        if (!confirm('Sortear agora? Pagamentos pendentes serão cancelados.')) throw new Error('Sorteio cancelado.');
        await api('POST', `/peladas/${p.id}/sorteio`, {});
      })));
  }

  // --- Times ---
  if (p.status !== 'ABERTA') {
    const { times, texto_whatsapp } = await api('GET', `/peladas/${p.id}/times`);
    f.append(h('h2', {}, 'Times'),
      h('div', { class: 'times' }, times.map((t) => h('section', { class: 'time', 'aria-label': t.nome },
        h('header', {}, h('strong', {}, t.nome), h('span', {}, `nível ${t.media.toFixed(1)}`)),
        h('ul', {}, t.jogadores.map((j) => h('li', {}, j.apelido, j.posicao === 'GOLEIRO' ? h('span', { class: 'gk' }, 'goleiro') : '')))))),
      h('div', { class: 'acoes' }, h('button', { type: 'button', onclick: async (e) => {
        await navigator.clipboard?.writeText(texto_whatsapp); e.target.textContent = 'Texto copiado';
      } }, 'Copiar para o WhatsApp')));
  }
  return f;
}

function nivelEditor(p, i) {
  const campoNivel = h('input', { type: 'number', min: 1, max: 5, step: 0.5, value: i.nivel_organizador ?? '', placeholder: String(i.nota_media), 'aria-label': `Nível de ${i.apelido} (1 a 5)` });
  const b = h('button', { type: 'button', class: 'sec', style: 'padding:6px 12px;font-size:16px', onclick: async () => {
    b.disabled = true;
    try { await api('PATCH', `/peladas/${p.id}/jogadores/${i.user_id}/nivel`, { nivel: Number(campoNivel.value) }); b.textContent = 'Salvo'; }
    catch (e) { alert(e.message); }
    b.disabled = false;
  } }, 'Salvar nível');
  return h('span', { style: 'display:flex;gap:6px' }, campoNivel, b);
}

// ---------- Roteamento ----------
function route() {
  const [, rota, arg] = location.hash.split('/');
  if (!state.me) return rota === 'cadastro' ? telaEntrar(true) : telaEntrar(false);
  if (rota === 'nova') return telaNova();
  if (rota === 'pelada' && arg) return telaPelada(arg);
  if (rota === 'entrar' || rota === 'cadastro' || !rota) { location.hash = '#/peladas'; return; }
  return telaLista();
}

(async function iniciar() {
  try { state.dev = (await (await fetch('/config')).json()).dev; } catch {}
  if (token()) { try { state.me = await api('GET', '/me'); } catch {} }
  window.addEventListener('hashchange', route);
  route();
})();
