-- Esquema Cloudflare D1 — P26-2B-8356-94BE-3650-165C
-- Simulador de Médias Acadêmicas com login Discord

-- O D1 já aplica chaves estrangeiras por padrão (ON DELETE CASCADE funciona).

-- Usuários importados do Discord OAuth2 (user_id, nome e avatar)
CREATE TABLE IF NOT EXISTS usuarios (
  user_id     TEXT PRIMARY KEY,
  username    TEXT NOT NULL,
  avatar_url  TEXT,
  criado_em   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Sessões do servidor (o cookie guarda um token aleatório; aqui fica só o hash SHA-256 dele)
CREATE TABLE IF NOT EXISTS sessoes (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES usuarios(user_id) ON DELETE CASCADE,
  expira_em   INTEGER NOT NULL,           -- epoch em segundos
  criado_em   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sessoes_user ON sessoes(user_id);

-- Disciplinas da grade do aluno no semestre, com as regras de aprovação
CREATE TABLE IF NOT EXISTS disciplinas (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id             TEXT NOT NULL REFERENCES usuarios(user_id) ON DELETE CASCADE,
  nome                TEXT NOT NULL,
  semestre            TEXT NOT NULL,
  nota_maxima         REAL NOT NULL DEFAULT 10  CHECK (nota_maxima > 0 AND nota_maxima <= 1000),
  media_aprovacao     REAL NOT NULL DEFAULT 7   CHECK (media_aprovacao > 0),
  media_minima_exame  REAL NOT NULL DEFAULT 4   CHECK (media_minima_exame >= 0),
  media_final_exame   REAL NOT NULL DEFAULT 5   CHECK (media_final_exame > 0),
  criado_em           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (media_minima_exame <= media_aprovacao),
  CHECK (media_aprovacao <= nota_maxima)
);
CREATE INDEX IF NOT EXISTS idx_disciplinas_user ON disciplinas(user_id, semestre);

-- Avaliações (provas, trabalhos e listas) e seus pesos = a fórmula da média
CREATE TABLE IF NOT EXISTS avaliacoes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  disciplina_id  INTEGER NOT NULL REFERENCES disciplinas(id) ON DELETE CASCADE,
  nome           TEXT NOT NULL,
  tipo           TEXT NOT NULL CHECK (tipo IN ('prova', 'trabalho', 'lista')),
  peso           REAL NOT NULL CHECK (peso > 0 AND peso <= 100),
  nota           REAL,                    -- NULL = ainda não realizada
  ordem          INTEGER NOT NULL DEFAULT 0,
  atualizado_em  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_disciplina ON avaliacoes(disciplina_id, ordem);
