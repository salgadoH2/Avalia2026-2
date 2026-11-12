---
name: documentacao-tecnica
description: Como documentar o projeto para avaliação acadêmica — README objetivo, documento de arquitetura com diagramas Mermaid, decisões de projeto e instruções reproduzíveis.
---

# Skill: Documentação Técnica

## Princípios
- **Verdade antes de tudo**: só documentar o que existe no código. Conferir cada rota, tabela e comando lendo os arquivos — nunca inventar.
- Português claro, frases curtas, público: banca de Engenharia de Software (diretor do curso).
- Comandos de Windows usam `npx.cmd` / `npm.cmd` (laboratório com Node via Scoop).

## README.md (manter o cabeçalho oficial intacto)
O topo (título "Projeto #17…", Modalidade, Estudante, Turma, **Chave Única**, **URL_CLOUDFLARE**, Repositório) e a seção "Especificação do Projeto" **não podem ser alterados** — o robô de avaliação lê esses campos. Depois deles:
1. O que o sistema faz (funcionalidades, com as fórmulas).
2. Como usar (passo a passo do aluno).
3. Arquitetura resumida + link para `docs/ARQUITETURA.md`.
4. Segurança e LGPD (resumo + link para `docs/SEGURANCA.md` se existir).
5. Testes (como rodar cada suíte e o que cobrem).
6. Como publicar e rodar localmente.
7. Licença MIT e a Chave Única no final.

## docs/ARQUITETURA.md
- Diagrama de componentes (Mermaid `flowchart`): navegador → Pages (estático) / Functions → D1; Discord OAuth2.
- Diagrama de sequência (Mermaid `sequenceDiagram`) do login Discord e do lançamento de nota com recálculo.
- Modelo de dados (Mermaid `erDiagram`) idêntico a `migrations/*.sql`.
- Tabela de rotas da API: método, caminho, autenticação, corpo, respostas.
- Decisões de projeto (ADR curtas): por que cálculo compartilhado cliente/servidor, por que sessão no D1 com hash, por que sem framework.
