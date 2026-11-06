import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashSenha(senha) {
  const salt = randomBytes(16);
  const hash = scryptSync(senha, salt, 32);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verificaSenha(senha, armazenado) {
  const [saltHex, hashHex] = armazenado.split(':');
  const hash = scryptSync(senha, Buffer.from(saltHex, 'hex'), 32);
  const esperado = Buffer.from(hashHex, 'hex');
  return hash.length === esperado.length && timingSafeEqual(hash, esperado);
}

const b64 = (b) => Buffer.from(b).toString('base64url');

export function criaToken(userId, secret, ttlMs = 7 * 24 * 3600 * 1000, agora = Date.now()) {
  const corpo = b64(JSON.stringify({ sub: userId, exp: agora + ttlMs }));
  const sig = createHmac('sha256', secret).update(corpo).digest('base64url');
  return `${corpo}.${sig}`;
}

export function verificaToken(token, secret, agora = Date.now()) {
  if (!token || !token.includes('.')) return null;
  const [corpo, sig] = token.split('.');
  const esperado = createHmac('sha256', secret).update(corpo).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(esperado);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(corpo, 'base64url').toString());
    return p.exp > agora ? p : null;
  } catch { return null; }
}
