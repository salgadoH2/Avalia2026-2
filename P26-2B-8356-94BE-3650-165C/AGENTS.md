# Engenharia de Agentes e Harness — P26-2B-8356-94BE-3650-165C

## 1. Harness utilizado

- **Harness:** Claude Code (aplicativo desktop Claude, aba Code, Windows 11), com ferramentas de leitura/escrita de arquivos, terminal (PowerShell/Git Bash), navegador embutido para pré-visualização e criação de subagentes.
- **Modelo base:** Claude Opus 5.5 (`claude-opus-5-5`) em todos os agentes.
- **Coordenação:** um agente orquestrador (sessão principal) atuou em dois papéis especializados — backend e interface — cada um guiado por sua skill; o agente de teste e validação rodou como **subagente separado, com contexto próprio e somente leitura**, para não "confirmar" o próprio trabalho. Os achados dele voltaram ao orquestrador, que aplicou as correções e reexecutou os testes.

```
Orquestrador (Claude Code)
 ├── Agente 1 — Backend serverless  ── skills/serverless-d1-discord
 ├── Agente 2 — Interface vanilla   ── skills/vanilla-dom-ui
 └── Agente 3 — Teste e validação   ── skills/teste-validacao   (subagente isolado, read-only)
        └─ relatório → correções pelos Agentes 1/2 → testes reexecutados (14/14)
```

---

## 2. Agentes

### Agente 1: Arquiteto Serverless, Cloudflare D1 e Discord OAuth2
- **Papel:** modelagem do banco D1, fluxo OAuth2 do Discord, sessões e regras de negócio no servidor.
- **Skill:** [`skills/serverless-d1-discord/SKILL.md`](./skills/serverless-d1-discord/SKILL.md)
- **Entregas:**
  - `migrations/0001_init.sql` — tabelas `usuarios`, `sessoes`, `disciplinas`, `avaliacoes` com chaves estrangeiras, `ON DELETE CASCADE` e `CHECK` de faixas.
  - `functions/api/auth/*` — login Discord com `state` anti-CSRF, importação de `user_id`, nome e avatar, sessão com token de 256 bits (só o hash SHA-256 no banco).
  - `functions/api/disciplinas/*`, `functions/api/avaliacoes/[id].js` — CRUD sempre filtrado pelo usuário da sessão.
  - `lib/validacao.js` — validação de todas as entradas (notas, pesos, tipos, coerência das médias, limites).
  - Reuso de `public/js/calc.js` no servidor para devolver o resumo com a mesma regra do cliente.

### Agente 2: Especialista em Interface Web Vanilla (HTML5, CSS3 e DOM)
- **Papel:** interface responsiva e acessível sem frameworks, cálculo instantâneo e salvamento automático.
- **Skill:** [`skills/vanilla-dom-ui/SKILL.md`](./skills/vanilla-dom-ui/SKILL.md)
- **Entregas:**
  - `public/js/calc.js` — motor da média ponderada e da nota mínima necessária (aprovação direta, evitar reprovação, exame final).
  - `public/js/app.js` — DOM montado com `createElement`/`textContent` (sem `innerHTML`), recálculo a cada tecla, salvamento com debounce, editor da fórmula em `<dialog>`.
  - `public/styles.css` — layout em grid, modo claro/escuro, versões para celular.
  - Cabeçalho com avatar, nome e ID do Discord; rodapé com a Chave Única.
  - Verificação visual no navegador embutido (desktop 800 px e celular 375 px) com API simulada.

### Agente 3: Agente de Teste, Auditoria de Segurança e Validação (obrigatório)
- **Papel:** verificação independente — executado como subagente separado do Claude Code, **sem permissão de editar**, com a instrução de auditar autorização, OAuth/sessão, XSS, validação no servidor, uso da API do D1/Pages, matemática e rubrica.
- **Skill:** [`skills/teste-validacao/SKILL.md`](./skills/teste-validacao/SKILL.md)
- **Resultado da auditoria** (nenhum problema crítico ou alto):

| # | Achado | Gravidade | Correção aplicada |
|---|---|---|---|
| 1 | `database_id` de exemplo no `wrangler.jsonc` | Média | Documentado: preencher após `wrangler d1 create` |
| 2 | Faltava `.gitignore` — risco de commitar `.dev.vars` com o segredo do Discord | Média | `.gitignore` criado |
| 3 | Validação arredondava depois de checar a faixa (peso 0,001 virava 0 e gerava erro 500) | Baixa | Arredonda antes de validar → 400 |
| 4 | Strings como `""` ou `"0x10"` eram convertidas em número | Baixa | Aceita só número ou texto decimal |
| 5 | Corpo JSON não-objeto no PATCH gerava 500 | Baixa | Checagem de tipo → 400 |
| 6 | Cookie malformado (`%E0`) gerava 500 | Baixa | `try/catch` → tratado como sem sessão |
| 7 | Classificação usava média arredondada (6,995 → aprovado) e a nota mínima não | Baixa | Classificação usa a média exata + novo teste |
| 8 | Editar a fórmula numa aba antiga podia sobrescrever notas mais novas | Baixa | `PUT` não altera mais notas existentes |

- **Confirmado pela auditoria:** todas as consultas filtradas por `user_id`; SQL sempre parametrizado; `state` do OAuth conferido; cookies `HttpOnly`/`SameSite=Lax`/`Secure`; nenhum `innerHTML`; chave no rodapé; nenhum framework.
- **Testes automatizados:** `tests/calc.test.mjs` — **14/14 passando** após as correções (executados no navegador por `tests/index.html`; no laboratório: `node tests/calc.test.mjs`).
- **Pendente para o estudante após o deploy:** testes de API com `curl` descritos na skill e `node validar-local.mjs P26-2B-8356-94BE-3650-165C`.
