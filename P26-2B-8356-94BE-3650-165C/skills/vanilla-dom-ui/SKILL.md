---
name: vanilla-dom-ui
description: Padrões da interface do Simulador de Médias em HTML5, CSS3 e JavaScript puro — DOM seguro, cálculo instantâneo e salvamento em segundo plano.
---

# Skill: Interface Vanilla (HTML5 + CSS3 + DOM)

## Proibido
- Frameworks/bibliotecas de UI (React, Vue, Angular, Svelte, jQuery UI, Tailwind via CDN etc.).
- `innerHTML` com qualquer dado do usuário. Use o helper `el(tag, attrs, ...filhos)` de `public/js/app.js`, que cria nós com `textContent`.

## Padrões
1. **Cálculo instantâneo:** no evento `input` da nota, atualize o objeto local, chame `resumoDisciplina(d)` de `calc.js` e redesenhe só `#area-resumo`, `#area-tipos` e o item da lista lateral — nunca a tabela inteira (o campo perderia o foco).
2. **Salvamento:** debounce de 700 ms por avaliação (`PATCH /api/avaliacoes/:id`), envio imediato no `blur`, indicador "salvando… / ✓ salvo / erro" por linha, aviso `beforeunload` se houver pendências.
3. **Números em pt-BR:** aceitar vírgula ou ponto (`lerNumero`), exibir com `toLocaleString("pt-BR")`. Notas mínimas são arredondadas para **cima**.
4. **Placeholders úteis:** campos de nota vazios mostram a nota mínima para aprovação direta.
5. **Editor da fórmula** em `<dialog>` nativo, com % de cada avaliação na média e barra de distribuição por tipo atualizadas ao digitar.
6. **Acessibilidade:** `aria-label` nos campos, `aria-live` no resumo, foco visível, Enter avança para a próxima nota.
7. **Tema e responsividade:** cores só por variáveis em `:root`, modo escuro via `prefers-color-scheme`, layout de uma coluna abaixo de 900 px e tabela compacta abaixo de 600 px.
8. **Rodapé** sempre com a Chave Única `P26-2B-8356-94BE-3650-165C`.
