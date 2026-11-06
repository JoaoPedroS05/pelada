import Database from 'better-sqlite3';

export function openDb(file = ':memory:') {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      nome TEXT NOT NULL,
      apelido TEXT NOT NULL,
      posicao_principal TEXT NOT NULL DEFAULT 'LINHA' CHECK (posicao_principal IN ('GOLEIRO','LINHA')),
      posicoes_secundarias TEXT NOT NULL DEFAULT '[]',
      nota_media REAL NOT NULL DEFAULT 3.0,
      partidas INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS peladas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organizador_id INTEGER NOT NULL REFERENCES users(id),
      local TEXT NOT NULL,
      data_hora INTEGER NOT NULL,
      limite_sorteio INTEGER NOT NULL,
      valor_centavos INTEGER NOT NULL,
      tamanho_time INTEGER NOT NULL,
      vagas INTEGER NOT NULL,
      tipo_sorteio TEXT NOT NULL CHECK (tipo_sorteio IN ('ALEATORIO','NIVEL_TECNICO')),
      status TEXT NOT NULL DEFAULT 'ABERTA' CHECK (status IN ('ABERTA','SORTEADA','ENCERRADA'))
    );
    CREATE TABLE IF NOT EXISTS times (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pelada_id INTEGER NOT NULL REFERENCES peladas(id),
      nome TEXT NOT NULL,
      media REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS inscricoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pelada_id INTEGER NOT NULL REFERENCES peladas(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL CHECK (status IN ('PENDENTE_PAGAMENTO','CONFIRMADO','EXPIRADO','CANCELADO','REEMBOLSAR')),
      nivel_organizador REAL,
      time_id INTEGER REFERENCES times(id),
      pix_txid TEXT UNIQUE,
      pix_copia_cola TEXT,
      pix_expira_em INTEGER,
      UNIQUE (pelada_id, user_id)
    );
  `);
  return db;
}
