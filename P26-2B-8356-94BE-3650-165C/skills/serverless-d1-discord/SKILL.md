---
name: serverless-d1-discord
description: Como implementar e alterar o backend do Simulador de Médias — Cloudflare Pages Functions, banco D1 e login Discord OAuth2 — sem confiar no cliente.
---

# Skill: Backend Serverless (Pages Functions + D1 + Discord OAuth2)

## Estrutura
- `functions/api/**` — uma rota por arquivo; exporte `onRequestGet`, `onRequestPost`, `onRequestPut`, `onRequestPatch`, `onRequestDelete`. Parâmetros dinâmicos via `[id].js` → `context.params.id`.
- `lib/` — código compartilhado (fora de `functions/` para não virar rota): `http.js` (respostas JSON, `HttpError`, wrapper `rota`), `session.js`, `validacao.js`, `repositorio.js`.
- `public/js/calc.js` — regra de cálculo da média, importada **também** pelo servidor. Nunca duplique a fórmula.
- `migrations/` — esquema SQLite do D1. Toda mudança de esquema vira um novo arquivo `000N_*.sql`.

## Regras obrigatórias
1. **Toda rota de dados** começa com `exigirUsuario(env, request)` e toda consulta filtra por `user_id` da sessão (direto ou via `JOIN disciplinas`). Nunca aceite `user_id` vindo do corpo.
2. **Validação no servidor** em `lib/validacao.js` antes de qualquer escrita: tipos, faixas (nota entre 0 e `nota_maxima`, peso 0 < p ≤ 100, `media_minima_exame ≤ media_aprovacao ≤ nota_maxima`), tamanho de textos e limites de quantidade.
3. Escritas com várias instruções usam `env.DB.batch([...])` (transacional no D1).
4. Sempre `prepare(...).bind(...)` — nunca concatenar valores no SQL.
5. Corpos de escrita exigem `Content-Type: application/json` (`lerJson`) — junto com `SameSite=Lax` isso bloqueia CSRF por formulário.

## Discord OAuth2
- `/api/auth/discord`: gera `state` aleatório, grava em cookie `oauth_state` (10 min) e redireciona com `scope=identify`.
- `/api/auth/discord/callback`: compara `state`, troca `code` por token, lê `/users/@me`, faz upsert em `usuarios` (user_id, nome, avatar) e cria sessão.
- Sessão: token aleatório de 256 bits no cookie `sid` (HttpOnly, Secure, SameSite=Lax); no D1 só fica o SHA-256.
- Segredos (`DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`) só em variáveis do Cloudflare Pages ou `.dev.vars` — nunca no repositório.

## Checklist antes de entregar uma mudança
- [ ] Rota nova responde 401 sem cookie e 404 para recurso de outro usuário.
- [ ] Payload inválido → 400 com mensagem em português.
- [ ] `npx.cmd wrangler d1 migrations apply DB --remote` aplicado se houve migração nova.
