# Segurança — Simulador de Médias (P26-2B-8356-94BE-3650-165C)

Documento produzido pelo **Agente 4 — Segurança de Aplicações Web**, seguindo `skills/seguranca-web/SKILL.md`.
Escopo auditado: `functions/api/**`, `lib/`, `migrations/0001_init.sql`, `public/`, `wrangler.jsonc`, `.gitignore`, `.dev.vars.example`.
Os números de linha valem para o estado do código em 12/11/2026 (o código continua sendo alterado por outros agentes).

---

## 1. Modelo de ameaças (resumo)

### Ativos
| Ativo | Onde fica | Por que importa |
|---|---|---|
| Notas, disciplinas e fórmulas de média do aluno | D1: `disciplinas`, `avaliacoes` | Dado acadêmico pessoal (LGPD) |
| Identidade Discord (ID, nome, URL do avatar) | D1: `usuarios` | Dado pessoal identificável |
| Sessão de login (cookie `sid`) | Navegador + hash SHA-256 em `sessoes` | Quem tem o token age como o aluno |
| `DISCORD_CLIENT_SECRET` | Variáveis do Cloudflare Pages / `.dev.vars` local | Permite se passar pelo app no Discord |

### Atores
- **Visitante anônimo**: só acessa `/`, `/api/status`, `/api/me` e o início do login.
- **Aluno autenticado**: tenta ler/alterar dados de **outro** aluno trocando ids (IDOR).
- **Site malicioso de terceiros**: tenta CSRF (forçar o navegador do aluno a gravar/excluir) ou clickjacking.
- **Atacante com acesso à cópia do banco**: tenta reaproveitar sessões a partir da tabela `sessoes`.

### Superfícies de ataque
- API JSON em `/api/*` (Pages Functions): `disciplinas`, `avaliacoes/:id`, `conta`, `conta/exportar`, `me`, `status`, `auth/*`.
- Fluxo OAuth2 (`/api/auth/discord` → Discord → `/api/auth/discord/callback`).
- Página estática (`public/index.html` + módulos JS) que exibe texto digitado pelo aluno.
- Repositório Git (risco de vazar segredos).

---

## 2. Controles implementados (com referência ao código)

### Cabeçalhos HTTP
- `public/_headers` (arquivos estáticos): CSP `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://cdn.discordapp.com; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self' https://discord.com; frame-ancestors 'none'`, mais `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (câmera, microfone, geolocalização, pagamento e USB desligados), `Strict-Transport-Security` e `Cross-Origin-Opener-Policy: same-origin`.
- **O Cloudflare Pages não aplica `_headers` às respostas das Functions** (verificado no `wrangler pages dev`: `/api/me` saiu sem CSP). Por isso a API define os próprios cabeçalhos: `Cache-Control: no-store` e `X-Content-Type-Options: nosniff` em `lib/http.js` (`CABECALHOS_API`, l. 9) e reforçados em **toda** resposta de `/api` por `functions/api/_middleware.js` (l. 33-35), inclusive redirecionamentos do OAuth.
- A CSP não exige `'unsafe-inline'`: o HTML não tem `<script>` nem `style=""` inline; os estilos dinâmicos são aplicados por CSSOM (`n.style.cssText`, `public/js/ui/dom.js` l. 19), permitido por `style-src 'self'`.

### Autenticação OAuth2 (Discord)
- `state` aleatório de 128 bits (`functions/api/auth/discord.js` l. 13) em cookie `HttpOnly; SameSite=Lax` de 10 min, comparado no callback (`callback.js` l. 28-33) e apagado em todas as saídas.
- Escopo mínimo `identify` (`discord.js` l. 19): só id, nome e avatar. O `access_token` do Discord não é gravado.
- Código de erro vindo do Discord só volta à URL se casar com `^[a-z_]{1,40}$` (`callback.js` l. 17-19); hash do avatar validado com `^(a_)?[0-9a-f]{32}$` (l. 63); `user_id` validado como numérico (l. 60).
- Ao concluir o login, a sessão anterior daquele navegador é apagada (`callback.js` l. 74).

### Sessão
- Token de 256 bits (`lib/session.js`, `tokenAleatorio`, l. 44-47); o banco guarda só o SHA-256 (l. 59-60), então vazar a tabela não permite sequestrar sessões.
- Cookie `HttpOnly; SameSite=Lax; Path=/` e `Secure` em HTTPS (`lib/session.js` l. 27-32).
- Expiração conferida no SQL (`s.expira_em > ?`, l. 72); formato do token validado antes da consulta (l. 41).
- Logout apaga a linha no D1 (`encerrarSessao`, l. 85-91; `functions/api/auth/logout.js`).

### Autorização (IDOR)
- Toda consulta filtra pelo `user_id` da sessão, inclusive avaliações via `JOIN disciplinas` (`lib/repositorio.js`: `obterDisciplina` l. 28-40, `buscarAvaliacaoDoUsuario` l. 116-124, `salvarNota` com filtro redundante l. 126-136, `UPDATE ... AND user_id = ?` l. 89).
- Recurso de outro usuário responde **404** (não revela existência). Verificado localmente com duas sessões: `GET/PUT/DELETE /api/disciplinas/1` e `PATCH /api/avaliacoes/1` do usuário B sobre dados do usuário A → 404.
- Em `PUT`, ids de avaliação que não pertencem à disciplina são recusados (`lib/repositorio.js` l. 78).

### Validação de entrada e SQL
- Todas as consultas usam `prepare().bind()`; não há SQL montado com dado do usuário (o único trecho interpolado, `COLS`, é constante).
- Corpo exige `Content-Type: application/json` e no máximo 20 000 bytes, lido em fluxo com corte (`lib/http.js` l. 6, 36-87).
- Tipos, faixas e tamanhos validados no servidor (`lib/validacao.js`): nomes 2-80 / 1-60 caracteres, remoção de caracteres de controle e bidi (l. 12-20), números sem notação exponencial, nota entre 0 e a nota máxima, ids inteiros seguros (l. 88-92), limites de 40 disciplinas e 30 avaliações. O banco repete as faixas com `CHECK` (`migrations/0001_init.sql`).
- Limite de disciplinas aplicado na própria instrução `INSERT ... SELECT ... WHERE COUNT < ?` (sem corrida, `lib/repositorio.js` l. 44-51).

### XSS
- A interface monta o DOM com `createElement`/`textContent` (`public/js/ui/dom.js`); não há `innerHTML`, `eval` ou `document.write` em `public/js`. Teste local: disciplina com nome `<img src=x onerror=alert(1)>` é gravada e devolvida como texto.
- A CSP sem `'unsafe-inline'` é a segunda barreira.

### CSRF e clickjacking
- `SameSite=Lax` no cookie + exigência de `application/json` (força preflight em pedidos de outra origem).
- `functions/api/_middleware.js` (l. 14-28) recusa com 403 métodos que alteram dados quando `Sec-Fetch-Site: cross-site` ou `Origin` diferente.
- `frame-ancestors 'none'` e `X-Frame-Options: DENY` na página.
- Exclusão da conta exige o corpo `{"confirmar":"EXCLUIR"}` (`lib/validacao.js` l. 101-107).

### LGPD
- Exportação dos dados (portabilidade): `GET /api/conta/exportar` (`functions/api/conta/exportar.js`), JSON com perfil e todas as disciplinas, `Cache-Control: no-store`.
- Exclusão da conta: `DELETE /api/conta` (`functions/api/conta/index.js`) apaga avaliações, disciplinas, sessões e usuário numa transação (`lib/repositorio.js` l. 160-169) e expira o cookie.
- Coleta mínima (escopo `identify`).

### Erros e segredos
- Exceções inesperadas viram `500` genérico em português, sem pilha (`lib/http.js` l. 118-121; `_middleware.js` l. 28-31).
- `/api/*` inexistente responde 404 JSON (`functions/api/[[rota]].js`), não o `index.html`.
- `.gitignore` exclui `.dev.vars`, `.wrangler/` e `node_modules/`; `.dev.vars.example` não contém valores. Nenhum segredo encontrado nos arquivos do projeto (o `database_id` do `wrangler.jsonc` é um identificador, não credencial).

---

## 3. Achados

> Os números de linha indicam onde cada problema estava **no momento da auditoria** (Agente 4, 12/11/2026). Os itens marcados como CORRIGIDO foram resolvidos depois pelo orquestrador e verificados pela suíte `tests/api.test.mjs` (30/30), por isso as linhas atuais podem ser outras. Os itens 2, 4, 6 e 10 continuam como riscos aceitos/recomendações.

| # | Achado | Arquivo:linha | Gravidade | Status | Correção sugerida |
|---|---|---|---|---|---|
| 1 | Produção ainda sem CSP, HSTS, `X-Frame-Options` e `Permissions-Policy` (só `nosniff` e `Referrer-Policy` padrão); `/api/rota-inexistente` devolve o `index.html` com 200 | `public/_headers:1` | média | CONFIRMADO — **CORRIGIDO e publicado** (12/11/2026: CSP, HSTS, XFO e 404 JSON verificados em produção) | Publicar a versão atual (inclui `_headers` e `[[rota]].js`) |
| 2 | Sem limitação de taxa nas rotas de escrita e no início do login; um script com sessão válida pode gerar escrita contínua no D1 | `functions/api/_middleware.js:22` | baixa | PLAUSÍVEL | Regra de *Rate Limiting* do Cloudflare para `/api/*` (ex.: 60 req/min por IP) |
| 3 | Sessão de 30 dias sem expiração por inatividade nem renovação | `lib/session.js:9` | baixa | **CORRIGIDO**: expira após 7 dias sem uso, renovação deslizante (`lib/session.js`, `usuarioDaSessao`) | Reduzir para 7 dias e renovar (*sliding*) a cada uso, ou expirar após inatividade |
| 4 | Sessões expiradas só são apagadas quando alguém faz login; podem ficar no D1 indefinidamente | `lib/session.js:58` | baixa | CONFIRMADO | Limpeza também em `usuarioDaSessao` ocasional ou *Cron Trigger* |
| 5 | Mensagens de erro públicas citam nomes de variáveis/binding da infraestrutura | `functions/api/auth/discord.js:10`, `lib/http.js:115` | baixa | **CORRIGIDO**: mensagens genéricas; detalhe só em `console.error` | Mensagem genérica ao usuário; detalhe só em `console.error` |
| 6 | `/api/status` público informa se o Discord e o D1 estão configurados | `functions/api/status.js:23` | baixa (informativa) | CONFIRMADO | Aceitável para a avaliação; em produção real, restringir ou remover |
| 7 | Nome vindo do Discord não passa pela remoção de caracteres de controle/bidi aplicada aos demais textos | `functions/api/auth/discord/callback.js:61` | baixa | **CORRIGIDO**: `limparTexto()` de `lib/validacao.js` aplicado ao nome | Reutilizar a limpeza de `lib/validacao.js` (`CONTROLE`) |
| 8 | Não há aviso de privacidade na tela de login (o que é coletado, finalidade, como exportar/excluir) | `public/index.html:76` | baixa | **CORRIGIDO**: aviso de privacidade abaixo do botão de login | Parágrafo curto abaixo do botão "Entrar com Discord" |
| 9 | `.gitignore` não cobre `.env*` nem logs; um segredo salvo com outro nome entraria no Git | `.gitignore:1` | baixa | **CORRIGIDO**: `.env*`, `*.log`, `.dev.vars*` no `.gitignore` | Acrescentar `.env*`, `*.log` e `.dev.vars*` com `!.dev.vars.example` |
| 10 | `_headers` não vale para respostas das Functions | `public/_headers:2` | informativa | CONFIRMADO (wrangler local) | Já mitigado por `functions/api/_middleware.js`; manter cabeçalhos da API no código |

Não foram encontrados: IDOR, injeção de SQL, XSS, CSRF explorável, sessão sem hash, `state` OAuth ausente, segredos no repositório.

---

## 4. Recomendações futuras
1. Fazer o deploy e repetir `curl -sI https://p26-2b-8356-94be-3650-165c.pages.dev/` para confirmar os cabeçalhos em produção; testar a página em <https://securityheaders.com>.
2. Habilitar *Rate Limiting* do Cloudflare em `/api/*` (achado 2).
3. Encurtar/renovar sessões e agendar limpeza de sessões expiradas (achados 3 e 4).
4. Publicar um aviso de privacidade curto e registrar o prazo de retenção dos dados (achado 8).
5. Adicionar `Content-Security-Policy-Report-Only` com `report-to` antes de endurecer ainda mais a política (ex.: `require-trusted-types-for 'script'`).
6. Incluir no `tests/` um teste automatizado de IDOR (duas sessões) e de CSRF (`Origin` de outro site → 403).
