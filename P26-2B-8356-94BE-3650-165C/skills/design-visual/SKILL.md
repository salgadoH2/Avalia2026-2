---
name: design-visual
description: Sistema de design do Simulador de Médias — referências do gênero (painéis acadêmicos e apps de produtividade), tokens, componentes, regras de qualidade visual e restrições técnicas (CSS puro, CSP, acessibilidade).
---

# Skill: Design Visual (CSS3 puro, sem frameworks)

## Direção
App de produtividade acadêmica: **claro, calmo e confiável**, no padrão dos painéis modernos (Notion, Linear, Google Classroom, Canvas, apps de finanças pessoais). Prioridade: **o número que importa aparece primeiro** (nota mínima que falta, situação), com hierarquia tipográfica forte e cor usada só para significado.

## Restrições técnicas (não negociáveis)
- Só HTML5 + CSS3 + JS vanilla. Sem frameworks, sem CDN, sem fontes externas (CSP `font-src 'self'`, `style-src 'self'`). Use a pilha de fontes do sistema (`"Segoe UI Variable", "Segoe UI", system-ui, -apple-system, Roboto, sans-serif`) e `font-variant-numeric: tabular-nums` para números.
- Nada de `style=""` no HTML estático, `<style>` inline ou `<script>` inline. Ícones e ilustrações em SVG inline gerados pelo JS (já existe `icone()`), ou arquivos `.svg` em `public/`.
- Não mudar ids, classes usadas pelo JS para comportamento, contratos da API nem a lógica de cálculo.
- Chave `P26-2B-8356-94BE-3650-165C` sempre no rodapé.

## Tokens (em `:root`, redefinidos no modo escuro)
- **Escala de espaço** 4/8/12/16/24/32/48/64 px; **raios** 8 (controles), 12 (cartões), 16 (painéis), 999 (pílulas).
- **Tipografia**: 12/14/16/20/24/32/40 px; títulos com `letter-spacing` levemente negativo; números grandes com peso 700.
- **Cor**: um primário (marca) + neutros com leve tom; cores semânticas fixas — aprovado (verde), em andamento (azul), exame (âmbar), reprovado (vermelho), simulação (violeta). Contraste **AA** (4,5:1 texto, 3:1 componentes) nos dois temas.
- **Elevação**: 2–3 níveis de sombra suave no claro; no escuro, bordas e superfícies mais claras em vez de sombra.
- **Movimento**: 150–250 ms, `ease-out`; tudo desligado em `prefers-reduced-motion`.

## Padrões do gênero a usar
- **Shell de aplicativo**: barra lateral fixa no desktop (marca, navegação, disciplinas com indicador de situação), cabeçalho enxuto com avatar; no celular, navegação compacta.
- **Cartões de indicador (KPI)** com rótulo pequeno, valor grande e variação/legenda.
- **Indicadores de progresso**: anel ou barra (`conic-gradient`/SVG) para % avaliado e média vs. meta.
- **Selo de situação** (pílula colorida com ícone) sempre ao lado do nome da disciplina.
- **Tabela de notas** limpa: linhas espaçadas, colunas numéricas alinhadas à direita, entrada de nota destacada no foco.
- **Estados vazios** com ilustração simples e um único chamado à ação.
- **Tela de login** com apresentação do produto (título forte, benefícios, prévia visual do painel) — padrão de landing de SaaS.

## Checklist de qualidade antes de entregar
- [ ] Verificado no navegador em 375, 768, 1280 e 1440 px, claro e escuro; sem rolagem horizontal.
- [ ] Alinhamento em grade, espaçamentos só da escala, nenhum texto cortado ou sobreposto.
- [ ] Contraste AA medido; foco visível em todos os controles.
- [ ] Console sem erros e sem violação de CSP.
- [ ] `node tests/calc.test.mjs` e `node tests/api.test.mjs` continuam passando.
