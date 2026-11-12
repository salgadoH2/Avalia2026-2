-- 0002 — índice para a limpeza de sessões expiradas.
-- Cada login executa `DELETE FROM sessoes WHERE expira_em < ?` (lib/session.js, criarSessao).
-- Sem índice em expira_em essa instrução varre a tabela inteira de sessões a cada login;
-- com o índice o SQLite localiza só as linhas vencidas. Mudança só aditiva: não altera dados.
CREATE INDEX IF NOT EXISTS idx_sessoes_expira ON sessoes(expira_em);
