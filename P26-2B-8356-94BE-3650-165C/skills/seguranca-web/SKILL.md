---
name: seguranca-web
description: Checklist de segurança para app Cloudflare Pages + Functions + D1 com login Discord — cabeçalhos HTTP, CSP, sessão, autorização, LGPD — e formato do relatório de auditoria.
---

# Skill: Segurança Web (Cloudflare Pages + D1 + Discord)

## 1. Cabeçalhos HTTP (`public/_headers` do Cloudflare Pages)
- `Content-Security-Policy` restritiva: `default-src 'self'`; scripts só `'self'` (sem `unsafe-inline`/`unsafe-eval`); `img-src 'self' data: https://cdn.discordapp.com`; `connect-src 'self'`; `frame-ancestors 'none'`; `base-uri 'self'`; `form-action 'self' https://discord.com`.
  - Conferir que o HTML não depende de `<script>` ou `style=""` inline proibidos pela política escolhida (atributos `style` definidos via JS pelo CSSOM são permitidos; `style-src` deve permitir o que a página realmente usa).
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` desligando câmera/microfone/geolocalização, `Strict-Transport-Security`.
- Respostas da API: `Cache-Control: no-store`.
- Sintaxe do `_headers`: bloco por caminho (`/*`), cabeçalhos indentados com dois espaços.

## 2. Autenticação e sessão
- OAuth2 Discord com `state` aleatório em cookie de curta duração e comparação no callback.
- Cookie de sessão `HttpOnly; Secure; SameSite=Lax`; token ≥ 256 bits; só o hash no banco; expiração verificada no SQL.
- Logout invalida no servidor (apaga a linha), não só no navegador.

## 3. Autorização (IDOR)
- Toda consulta a dados do aluno filtra por `user_id` da sessão — inclusive via `JOIN` para avaliações. Recurso de outro usuário → **404** (não revelar existência).

## 4. Entrada e saída
- SQL sempre com `prepare().bind()`. Validação de tipo/faixa/tamanho no servidor antes de gravar.
- DOM sem `innerHTML` com dado do usuário.

## 5. LGPD
- O usuário consegue **exportar** seus dados e **excluir** a conta (com todas as disciplinas, avaliações e sessões).
- Coletar só o necessário (`identify`: id, nome, avatar).

## Formato do relatório
Tabela: `# | achado | arquivo:linha | gravidade (crítica/alta/média/baixa) | CONFIRMADO/PLAUSÍVEL | correção sugerida`. Nada de achados sem arquivo e linha.
