import test from 'node:test';
import assert from 'node:assert/strict';
import { sortearAleatorio, sortearPorNivel, mulberry32, somaNotas } from '../src/draw.js';

const mk = (n, gks = 2) =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1, posicao: i < gks ? 'GOLEIRO' : 'LINHA', nota: 1 + ((i * 7) % 5),
  }));

test('1 goleiro por time e nenhum jogador repetido', () => {
  for (const fn of [sortearAleatorio, sortearPorNivel]) {
    const times = fn(mk(12), 6, mulberry32(1));
    assert.equal(times.length, 2);
    for (const t of times) assert.equal(t.jogadores.filter((j) => j.posicao === 'GOLEIRO').length, 1);
    const ids = times.flatMap((t) => t.jogadores.map((j) => j.id));
    assert.equal(new Set(ids).size, 12);
  }
});

test('goleiros excedentes entram como linha', () => {
  const times = sortearAleatorio(mk(12, 5), 6, mulberry32(2));
  assert.equal(times.flatMap((t) => t.jogadores).length, 12);
});

test('snake draft equilibra notas', () => {
  const js = [5, 5, 4, 4, 3, 3, 2, 2].map((nota, i) => ({ id: i, posicao: 'LINHA', nota }));
  const [a, b] = sortearPorNivel(js, 4, mulberry32(3));
  assert.ok(Math.abs(somaNotas(a) - somaNotas(b)) <= 1);
});

test('mais de 2 times quando há jogadores suficientes', () => {
  assert.equal(sortearPorNivel(mk(18), 6, mulberry32(4)).length, 3);
});

test('exige mínimo de 2 jogadores', () => {
  assert.throws(() => sortearAleatorio(mk(1), 5));
});
