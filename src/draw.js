// Algoritmos de sorteio. Jogador: { id, posicao: 'GOLEIRO'|'LINHA', nota }

export function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function embaralha(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const numeroDeTimes = (n, tamanho) => Math.max(2, Math.floor(n / tamanho));
export const somaNotas = (t) => t.jogadores.reduce((s, j) => s + j.nota, 0);
export const mediaTime = (t) => (t.jogadores.length ? somaNotas(t) / t.jogadores.length : 0);

function prepara(jogadores, tamanho, rng) {
  if (jogadores.length < 2) throw new Error('São necessários ao menos 2 jogadores confirmados');
  const k = numeroDeTimes(jogadores.length, tamanho);
  const times = Array.from({ length: k }, (_, i) => ({ indice: i, jogadores: [] }));
  const goleiros = embaralha(jogadores.filter((j) => j.posicao === 'GOLEIRO'), rng);
  // Fase goleiros: 1 por time; goleiros excedentes viram jogadores de linha
  goleiros.slice(0, k).forEach((g, i) => times[i].jogadores.push(g));
  const linha = [
    ...goleiros.slice(k),
    ...jogadores.filter((j) => j.posicao !== 'GOLEIRO'),
  ];
  return { times, linha };
}

export function sortearAleatorio(jogadores, tamanho, rng = Math.random) {
  const { times, linha } = prepara(jogadores, tamanho, rng);
  for (const j of embaralha(linha, rng)) {
    const alvo = times.reduce((m, t) => (t.jogadores.length < m.jogadores.length ? t : m));
    alvo.jogadores.push(j);
  }
  return times;
}

// Snake draft: ordena por nota (desc) e distribui em serpenteamento.
// A 1ª rodada começa pelos times mais fracos (soma menor, ex.: goleiro de nota baixa).
export function sortearPorNivel(jogadores, tamanho, rng = Math.random) {
  const { times, linha } = prepara(jogadores, tamanho, rng);
  const ordenada = embaralha(linha, rng).sort((a, b) => b.nota - a.nota); // empate = aleatório
  const base = [...times].sort((a, b) => somaNotas(a) - somaNotas(b));
  let i = 0;
  for (const j of ordenada) {
    const rodada = Math.floor(i / times.length);
    const pos = i % times.length;
    const t = rodada % 2 === 0 ? base[pos] : base[times.length - 1 - pos];
    t.jogadores.push(j);
    i++;
  }
  return times;
}

export function sortear(tipo, jogadores, tamanho, rng) {
  return tipo === 'NIVEL_TECNICO'
    ? sortearPorNivel(jogadores, tamanho, rng)
    : sortearAleatorio(jogadores, tamanho, rng);
}
