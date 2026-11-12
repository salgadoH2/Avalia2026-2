---
name: dominio-calculo
description: Regras do domínio acadêmico (média ponderada, nota mínima, exame) e como evoluir e testar o motor public/js/calc.js sem quebrar cliente nem servidor.
---

# Skill: Domínio Acadêmico e Motor de Cálculo

`public/js/calc.js` é a **única** fonte da regra de cálculo. É importado pelo navegador (`public/js/app.js`) e pelas Pages Functions (`lib/repositorio.js`). Por isso:

## Regras
1. **Módulo ES puro**: sem DOM, sem `fetch`, sem dependências, sem estado global. Funções puras.
2. **Compatibilidade**: nunca remover nem mudar a assinatura/forma de retorno de `TIPOS`, `TIPO_LABEL`, `ceil2`, `round2`, `notaNecessaria`, `situacao`, `resumoDisciplina`. Só acrescentar campos e funções.
3. **Fórmulas**
   - Média ponderada: `M = Σ(peso·nota) / Σpeso`.
   - Nota mínima uniforme nas restantes: `x = (meta·W − K) / R`.
   - Exame final: `(média + exame) / 2 ≥ media_final_exame` ⇒ `exame = 2·media_final_exame − média`.
4. **Arredondamento**: nota mínima sempre para **cima** (`ceil2`), nunca para baixo — tirar exatamente a nota mostrada tem que bastar. Classificação (aprovado/exame/reprovado) usa a média **exata**; arredondar é só para exibir.
5. **Nota zero é nota** (avaliação feita). Só `null`/`undefined`/`""` contam como "não feita".

## Testes (`tests/calc.test.mjs`)
- Todo comportamento novo ganha caso de teste com o valor calculado à mão no comentário.
- Testes de propriedade (entradas aleatórias com semente fixa): a nota mínima retornada **basta** e `nota − 0,01` **não basta** (quando > 0).
- Rodar: `node tests/calc.test.mjs` (Node via Scoop) — saída deve terminar com `N/N testes passaram.` e código de saída 0.
