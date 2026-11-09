---
name: teste-validacao
description: Protocolo do agente de teste e validação — testes do cálculo, auditoria de segurança das rotas, testes manuais com curl e conferência da rubrica.
---

# Skill: Agente de Teste e Validação

O agente de validação **não altera código**: lê, executa testes e entrega um relatório (arquivo:linha, gravidade, CONFIRMADO/PLAUSÍVEL, correção sugerida). As correções ficam com os agentes de backend ou interface.

## 1. Testes automáticos do cálculo
```powershell
node P26-2B-8356-94BE-3650-165C/tests/calc.test.mjs
```
Ou abra `tests/index.html` servido localmente. Todos os casos devem passar (média ponderada, nota mínima arredondada para cima, aprovação garantida, exame inevitável, reprovação, exame final, nota zero, escala 0–100).

## 2. Auditoria de segurança
- Toda rota de `functions/api/` (exceto `auth/*` e `status`) responde **401** sem cookie `sid`.
- Usuário A **não** acessa disciplina/avaliação de B: esperado **404** em GET/PUT/DELETE/PATCH.
- `state` do OAuth conferido no callback; cookies `HttpOnly; Secure; SameSite=Lax`.
- Nenhum `innerHTML` com dado do usuário em `public/js/app.js`.

## 3. Testes de API anti-manipulação (com cookie de uma sessão real)
```bash
# nota acima do máximo → 400
curl -X PATCH https://SEU-PROJETO.pages.dev/api/avaliacoes/1 -H "Content-Type: application/json" -H "Cookie: sid=..." -d '{"nota": 11}'
# tipo inválido → 400
curl -X POST https://SEU-PROJETO.pages.dev/api/disciplinas -H "Content-Type: application/json" -H "Cookie: sid=..." \
  -d '{"nome":"X","semestre":"2026.2","avaliacoes":[{"nome":"a","tipo":"seminario","peso":1}]}'
# sem JSON → 415 · sem cookie → 401
```

## 4. Conformidade com a rubrica
```powershell
node validar-local.mjs P26-2B-8356-94BE-3650-165C
```
Todos os 9 itens em ✅, incluindo a URL `pages.dev` respondendo com a chave no rodapé.
