# Testes

Duas suítes, sem dependências: só Node.js (18+). A suíte da API também usa o Wrangler via `npx`.

| Suíte | Comando (na pasta do projeto) | Precisa de servidor? |
|---|---|---|
| Cálculo | `node tests/calc.test.mjs` (ou abra `tests/index.html` servido localmente) | Não |
| API (integração) | `node tests/api.test.mjs` | Não: a própria suíte sobe e derruba o servidor |

As duas saem com código 1 se algum caso falhar.

## `calc.test.mjs`: motor de cálculo (`public/js/calc.js`)
Média ponderada, nota mínima arredondada para cima, aprovação garantida, exame inevitável, reprovação, exame final, nota zero, escala 0–100, `simular` e `resumoSemestre`. No fim há testes de propriedade com 600 disciplinas aleatórias geradas com semente fixa.

## `api.test.mjs`: Pages Functions + D1 local
Passos que a suíte executa sozinha:
1. cria um D1 temporário em `%TEMP%` (o D1 local dá *internal error* em caminhos com acento ou no OneDrive);
2. aplica `migrations/` com `wrangler d1 migrations apply DB --local --persist-to ...`;
3. grava 2 usuários e 5 sessões direto no banco: o cookie leva um token de 64 hex e a tabela guarda o SHA-256 dele. Uma das sessões já vem expirada. O Discord não é usado;
4. sobe `wrangler pages dev --port 8792` (troque a porta com `API_TEST_PORT`), roda os casos, derruba o servidor (também em caso de falha) e confere o banco direto no SQLite.

Cobertura:
- **Acesso:** 401 sem cookie e com cookie malformado, desconhecido ou expirado, em todas as rotas de dados.
- **Corpo da requisição:** 415 sem JSON; 400 para corpo vazio, JSON inválido ou UTF-8 inválido; 413 acima de 20000 bytes, com e sem Content-Length.
- **Validação:** 400 para cada regra (nota acima do máximo, peso ≤ 0, tipo inválido, médias incoerentes, textos fora do tamanho, ids inválidos) e aceitação dos valores exatos de limite.
- **Fluxo completo:** criar, lançar notas com PATCH, conferir o `resumo` do servidor contra `calc.js` e contra a conta feita à mão, mudar a fórmula com PUT (as notas lançadas são preservadas) e excluir.
- **IDOR:** o usuário B recebe 404 em GET, PUT e DELETE de disciplina e em PATCH de avaliação do usuário A, e vice-versa.
- **Origem:** 403 para escrita vinda de outra origem.
- **Rotas e métodos:** 404 em JSON para rota inexistente; 405 com o cabeçalho `Allow`; OPTIONS responde 204.
- **Limite:** 409 ao tentar criar a 41ª disciplina.
- **Exportação:** cabeçalhos de download corretos e conteúdo igual ao de GET /api/disciplinas.
- **Logout e exclusão de conta:** a exclusão sem confirmação dá 400; depois de confirmada, todas as sessões de A dão 401, os dados de B ficam intactos e nada de A sobra no banco.
- **Cabeçalhos:** os cabeçalhos de `public/_headers` aparecem nas páginas, e a API responde com `Cache-Control: no-store`.

A suíte nunca usa `--remote` nem a URL de produção.
