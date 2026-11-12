# Projeto #17: Calculadora e Simulador de Desempenho Acadêmico

- **Modalidade:** Projeto Oficial Sorteado (Valendo 100 pontos)
- **Estudante:** João Vitor do Nascimento Martins
- **Turma:** 2B
- **Chave Única:** `P26-2B-8356-94BE-3650-165C`
- **URL_CLOUDFLARE:** `https://p26-2b-8356-94be-3650-165c.pages.dev` *(confirmar após o deploy na Cloudflare)*
- **Repositório:** `https://github.com/SalgadoH2/Avalia2026-2`

---

## Especificação do Projeto

Desenvolva um sistema no qual o estudante cadastra as disciplinas que está cursando no semestre, definindo a fórmula de cálculo de média (pesos de provas, trabalhos e listas) de cada matéria. O login via Discord recupera a grade individual do aluno armazenada no Cloudflare D1.

À medida que o aluno insere as notas já obtidas, o JavaScript no cliente calcula instantaneamente a média parcial e simula exatamente qual nota mínima é necessária nas avaliações restantes para atingir a aprovação direta ou evitar o exame final. Os dados permanecem salvos na infraestrutura da Cloudflare para acompanhamento ao longo de todo o período letivo.

---

## O que o sistema faz

O estudante entra com a conta do **Discord** (OAuth2, escopo `identify`: só `user_id`, nome e avatar) e cadastra as disciplinas do semestre. Para cada disciplina ele define:

- a **fórmula da média**: de 1 a 30 avaliações dos tipos **prova**, **trabalho** ou **lista**, cada uma com seu **peso** (maior que 0 e até 100);
- as **regras de aprovação**: nota máxima (ex.: 10 ou 100), média para aprovação direta (padrão 7), média mínima para ter direito a exame (padrão 4) e média final exigida após o exame (padrão 5, calculada como `(média + exame) ÷ 2`).

Conforme as notas são digitadas, o JavaScript no navegador recalcula tudo **a cada tecla** (evento `input`, sem ida ao servidor) usando o módulo `public/js/calc.js`. Em paralelo, a nota é salva no **Cloudflare D1** (700 ms depois da última tecla, ou na hora ao sair do campo) e fica disponível o semestre inteiro, em qualquer dispositivo.

### Fórmulas

Notação: `N` = nota máxima · `W` = Σ pesos · `Wf` = Σ pesos das avaliações feitas · `R` = Σ pesos das restantes · `K` = Σ (peso × nota) das feitas · `A` = meta (média alvo).

| Indicador | Fórmula | Arredondamento |
| --- | --- | --- |
| Média parcial | `K ÷ Wf` (só o que já foi feito) | para baixo, 2 casas |
| Pontos garantidos | `K ÷ W` (o que falta valendo zero) | para baixo |
| Média máxima possível | `(K + R·N) ÷ W` (nota máxima no que falta) | para baixo |
| Média final | `K ÷ W`, quando não resta avaliação | para baixo |
| **Nota mínima para aprovação direta** | `x = (A·W − K) ÷ R`, com `A` = média de aprovação | **para cima**, 2 casas |
| **Nota mínima para evitar reprovação direta** | mesma fórmula, com `A` = média mínima para exame | **para cima** |
| Nota necessária no exame final | `E = 2·F − M` (`M` = média final, `F` = média pós-exame) | **para cima** |

A nota mínima `x` é a mesma em todas as avaliações restantes. Se `x ≤ 0` a meta já está **garantida**; se `x > N` (ou não resta avaliação) ela é **impossível**. O arredondamento é conservador nos dois sentidos: nota mínima sobe (tirar exatamente o valor mostrado basta) e média exibida desce (o sistema nunca mostra média maior que a real). A classificação usa a média exata, com tolerância de `1e-9` só para erro de ponto flutuante — 6,995 continua abaixo de 7.

**Exemplo** (modelo sugerido pelo sistema: Prova 1 = 35, Prova 2 = 35, Trabalho = 20, Listas = 10; aprovação ≥ 7, exame ≥ 4, pós-exame ≥ 5). Com Prova 1 = 6,0 e Trabalho = 8,0: `K = 35·6 + 20·8 = 370`, `Wf = 55`, `R = 45`.
média parcial = 370 ÷ 55 = **6,72**; nota mínima para passar direto = (700 − 370) ÷ 45 = 7,333… → **7,34** em Prova 2 e Listas; para não reprovar direto = (400 − 370) ÷ 45 → **0,67**. Se o aluno tirar 5,0 nas duas, a média final é 5,95 (exame) e a nota necessária no exame é 2·5 − 5,95 = **4,05**. Esses valores são os que `calc.js` devolve.

### Situação da disciplina

| Situação | Quando |
| --- | --- |
| Aprovado(a) | média final ≥ aprovação, ou aprovação já garantida mesmo zerando o restante |
| Em andamento | aprovação direta ainda possível e não garantida |
| Exame inevitável | aprovação direta impossível mesmo com nota máxima no que falta, sem reprovação direta certa |
| Em exame | todas as notas lançadas e média entre a mínima para exame e a de aprovação |
| Reprovado(a) | média final abaixo da mínima para exame, ou isso já é certo mesmo com nota máxima |
| Sem fórmula | disciplina sem pesos válidos |

Os campos de nota vazios mostram como *placeholder* a nota mínima para aprovação direta (`mín. 7,34`).

### Funcionalidades além do enunciado

- **Visão geral do semestre:** painel inicial com contadores (aprovados, em andamento, em exame, reprovados), média geral (média simples das médias, convertidas para a escala 0–10 para misturar disciplinas 0–10 e 0–100), percentual do peso já avaliado e um cartão por disciplina com o próximo passo. Há seletor quando existem vários semestres.
- **Modo simulação "E se…?":** o aluno digita notas hipotéticas nas avaliações sem nota e vê o resultado na hora. Nada é enviado ao servidor; as notas lançadas ficam fixas. Botões "Preencher com a mínima", "Limpar" e "Sair e descartar".
- **Boletim para impressão:** botão "Imprimir" gera uma versão própria para papel (`@media print`) com nome, ID do Discord e data/hora de emissão.
- **LGPD:** no menu da conta, "Baixar meus dados (JSON)" (portabilidade, `GET /api/conta/exportar`) e "Excluir minha conta" (eliminação, `DELETE /api/conta`, exige digitar `EXCLUIR`). A tela de login traz um aviso de privacidade.
- **Cabeçalhos de segurança:** CSP sem `'unsafe-inline'`, HSTS, `X-Frame-Options: DENY`, `Permissions-Policy` e outros, definidos em `public/_headers`.
- **Primeiros passos:** com a grade vazia, o sistema oferece o modelo de fórmula sugerido (35/35/20/10) ou um cadastro em branco.

## Como usar

1. Acesse <https://p26-2b-8356-94be-3650-165c.pages.dev> e clique em **Entrar com Discord**; autorize o aplicativo.
2. Na grade vazia, escolha **Usar este modelo** ou **Começar em branco**. Informe nome, semestre (ex.: `2026.2`), regras de aprovação e as avaliações com seus pesos; a barra de distribuição mostra o percentual de cada tipo. Salve.
3. Na tela da disciplina, digite as notas já obtidas (vírgula ou ponto; `Enter` vai para a próxima). Deixe em branco o que ainda não foi feito. A faixa de situação, as métricas e as notas mínimas mudam a cada tecla; o indicador ao lado da nota mostra `salvando…` e `✓ salvo`.
4. Use **E se…?** para testar cenários sem gravar, **Imprimir** para o boletim e **Editar fórmula** para mudar pesos ou regras (as notas já lançadas são preservadas).
5. Na lateral **Minha grade**, o item **Visão geral** mostra o semestre inteiro; as disciplinas aparecem agrupadas por semestre, com a média e a cor da situação. No menu do avatar: baixar dados, sair e excluir a conta.

## Arquitetura

Aplicação *serverless* na Cloudflare: o **Pages** serve `public/` como arquivos estáticos e executa `functions/` como **Pages Functions** (API JSON em `/api/*`), que acessam o banco **D1** (SQLite) pelo *binding* `DB` declarado em `wrangler.jsonc`. Sem framework e sem etapa de build. O mesmo módulo `public/js/calc.js` é importado pelo navegador e pelas Functions, então o resumo devolvido pelo servidor segue exatamente a regra exibida na tela.

```
P26-2B-8356-94BE-3650-165C/
├── public/                         Frontend estático: HTML5, CSS3 e JavaScript puro
│   ├── index.html                  Telas (carregando, erro, login, app), diálogos e rodapé com a Chave Única
│   ├── styles.css                  Layout responsivo, tema claro/escuro, versão de impressão
│   ├── _headers                    CSP e demais cabeçalhos de segurança das páginas estáticas
│   └── js/
│       ├── calc.js                 Motor de cálculo (navegador E servidor)
│       ├── app.js                  Estado, rotas por hash, notas, simulação, editor da fórmula
│       └── ui/                     api.js · conta.js · dialogos.js · dom.js · semestre.js · situacao.js
├── functions/api/                  Pages Functions
│   ├── _middleware.js              403 para escrita de outra origem, 500 em JSON, no-store/nosniff, HEAD sem corpo
│   ├── [[rota]].js                 404 em JSON para /api/* inexistente
│   ├── status.js · me.js           Diagnóstico público · perfil da sessão
│   ├── auth/discord.js             Início do OAuth2 (state anti-CSRF)
│   ├── auth/discord/callback.js    Troca code → token → /users/@me → D1 → sessão
│   ├── auth/logout.js              Encerra a sessão
│   ├── disciplinas/index.js        GET lista · POST cria
│   ├── disciplinas/[id].js         GET · PUT (regras/fórmula) · DELETE
│   ├── avaliacoes/[id].js          PATCH lança ou limpa uma nota
│   └── conta/index.js · exportar.js  DELETE exclui a conta · GET exporta os dados (LGPD)
├── lib/                            http.js · session.js · validacao.js · repositorio.js
├── migrations/                     0001_init.sql (4 tabelas) · 0002_indice_expiracao_sessoes.sql
├── tests/                          calc.test.mjs · api.test.mjs · index.html · README.md
├── docs/                           ARQUITETURA.md · SEGURANCA.md
├── skills/                         SKILL.md de cada agente
├── AGENTS.md                       Agentes e harness utilizados
└── wrangler.jsonc                  Projeto Pages + binding D1
```

Diagramas de componentes e de sequência, modelo de dados, tabela completa de rotas e decisões de projeto: **[docs/ARQUITETURA.md](./docs/ARQUITETURA.md)**.

### Regras validadas no servidor

O cliente valida para dar retorno rápido, mas só o que passa por `lib/validacao.js` é gravado:

- toda rota de dados exige sessão e filtra pelo `user_id` dela; recurso de outro aluno responde **404**;
- nome da disciplina com 2 a 80 caracteres, semestre com 4 a 20, nome da avaliação com 1 a 60 (caracteres de controle e de direção bidi são removidos);
- `0 < nota máxima ≤ 1000`; `0 < média de aprovação ≤ nota máxima`; `0 ≤ média para exame ≤ média de aprovação`; `0 < média pós-exame ≤ nota máxima`;
- tipo ∈ {prova, trabalho, lista}; `0 < peso ≤ 100`; nota `null` ou entre 0 e a nota máxima; números arredondados a 2 casas **antes** da checagem de faixa; textos como `"0x10"` ou `"1e3"` são recusados;
- de 1 a 30 avaliações por disciplina; até 40 disciplinas por aluno (contagem e inserção na mesma instrução SQL → **409** na 41ª);
- no `PUT`, ids de avaliação precisam pertencer à disciplina, e as notas existentes só mudam pelo `PATCH` (uma aba antiga editando a fórmula não sobrescreve nota mais nova);
- corpo `application/json`, UTF-8 válido, até 20 000 bytes (**415**, **400**, **413**).

O banco repete as faixas principais com `CHECK` e chaves estrangeiras (`migrations/0001_init.sql`).

## Segurança e LGPD

- **Sessão:** token aleatório de 256 bits no cookie `sid` (`HttpOnly; SameSite=Lax; Secure` em HTTPS); o D1 guarda só o SHA-256 do token. A sessão expira após 7 dias sem uso (renovada no máximo uma vez por dia) e o cookie vive no máximo 30 dias. Logout apaga a linha no banco.
- **OAuth2:** `state` aleatório de 128 bits em cookie de 10 minutos, conferido no callback; o `access_token` do Discord não é guardado; nome e avatar vindos do Discord são saneados.
- **Autorização:** todas as consultas filtram por `user_id`; SQL sempre parametrizado (`prepare().bind()`).
- **CSRF:** `SameSite=Lax` + exigência de `application/json` + `_middleware.js` recusando com **403** escrita com `Origin` diferente ou `Sec-Fetch-Site: cross-site`.
- **XSS:** o DOM é montado com `createElement`/`textContent` (sem `innerHTML`); a CSP sem `'unsafe-inline'` é a segunda barreira.
- **LGPD:** coleta mínima (escopo `identify`), exportação em JSON (art. 18, V) e exclusão de conta em uma única transação do D1 (art. 18, VI).
- **Segredos:** `DISCORD_CLIENT_SECRET` só nas variáveis do Pages ou no `.dev.vars` local, que está no `.gitignore`.

Modelo de ameaças, controles com referência ao código e achados: **[docs/SEGURANCA.md](./docs/SEGURANCA.md)**.

## Testes

Duas suítes sem dependências (só Node.js 18+; a de API usa o Wrangler via `npx`). As duas saem com código 1 se algum caso falhar. Resultado da última execução (Node 26.13.0, Wrangler 4.161.0, Windows 11):

| Suíte | Comando | Resultado |
| --- | --- | --- |
| Motor de cálculo (`calc.test.mjs`) | `node tests/calc.test.mjs` (ou `tests/index.html` servido localmente) | **52/52** testes |
| API + D1 local (`api.test.mjs`) | `node tests/api.test.mjs` (~35 s; sobe e derruba o servidor sozinha) | **30/30** casos |

- **Cálculo:** 44 casos de exemplo e de borda (média ponderada, nota mínima arredondada para cima, aprovação garantida, exame inevitável, reprovação, exame final, nota zero, escala 0–100, pesos decimais e erro de ponto flutuante, `simular`, `resumoSemestre`) e 8 testes de propriedade sobre 600 disciplinas aleatórias (semente fixa 20262) — por exemplo, "a nota mínima mostrada basta e 0,01 a menos não basta".
- **API:** cria um D1 temporário em `%TEMP%`, aplica as migrações, grava 2 usuários e 5 sessões direto no banco (sem Discord), sobe `wrangler pages dev` na porta 8792 e testa: 401 em todas as rotas de dados (sem cookie, malformado, desconhecido, expirado), 415/400/413 do corpo, 400 para cada regra de validação, fluxo completo com o `resumo` do servidor comparado ao `calc.js` e à conta feita à mão, preservação das notas no `PUT`, IDOR entre dois usuários (404), 403 de outra origem, 404 JSON, 405 com `Allow`, `OPTIONS` 204, `HEAD`, 409 na 41ª disciplina, exportação, 503 do login sem configuração, logout, exclusão de conta (o banco é conferido depois) e os cabeçalhos de `_headers`. Nunca usa `--remote` nem a URL de produção.

Detalhes em [tests/README.md](./tests/README.md).

## Como publicar (Cloudflare Pages + D1 + Discord)

O site é publicado por **upload direto com o Wrangler** (`wrangler pages deploy`), não por integração Git: o repositório da turma tem uma pasta por projeto, e o upload envia exatamente `public/` e `functions/` desta pasta. Comandos em PowerShell, dentro de `P26-2B-8356-94BE-3650-165C/` (no laboratório o Node vem do Scoop; se `node` não for encontrado, rode antes `$env:PATH = "$env:USERPROFILE\scoop\apps\nodejs-lts\current;$env:USERPROFILE\scoop\shims;$env:PATH"`).

1. **Pasta do projeto:** o repositório é um *fork* de `frankalcantara/Avalia2026-2`; a pasta foi criada na raiz com `node iniciar.mjs P26-2B-8356-94BE-3650-165C`.
2. **Banco D1** (uma vez):
   ```powershell
   npx.cmd wrangler login
   npx.cmd wrangler d1 create db-p26-2b-8356-94be-3650-165c   # copie o database_id para wrangler.jsonc
   npx.cmd wrangler d1 migrations apply DB --remote            # aplica 0001 e 0002 no banco de produção
   ```
3. **Projeto Pages e deploy** (o *binding* `DB` vem do `wrangler.jsonc`; `pages_build_output_dir` é `./public`):
   ```powershell
   npx.cmd wrangler pages project create p26-2b-8356-94be-3650-165c --production-branch main
   npx.cmd wrangler pages deploy --branch main
   ```
   Para atualizar o site depois de mudar o código, basta repetir o `pages deploy`.
4. **Discord:** em <https://discord.com/developers/applications> crie uma Application → OAuth2 → copie o Client ID, gere o Client Secret e cadastre o redirect `https://p26-2b-8356-94be-3650-165c.pages.dev/api/auth/discord/callback`.
5. **Segredos:** no projeto Pages → Settings → Variables and Secrets, crie `DISCORD_CLIENT_ID` e `DISCORD_CLIENT_SECRET` (tipo *Secret*) — ou `npx.cmd wrangler pages secret put DISCORD_CLIENT_SECRET --project-name p26-2b-8356-94be-3650-165c`. Faça um novo deploy.
6. **Conferência:** `https://p26-2b-8356-94be-3650-165c.pages.dev/api/status` deve mostrar `"d1Conectado": true` e `"discordConfigurado": true`. Na raiz do repositório: `node validar-local.mjs P26-2B-8356-94BE-3650-165C`.

### Rodar localmente

O D1 local do Wrangler falha (*internal error*) quando a pasta do projeto tem acento ou está no OneDrive. Por isso o banco local fica fora dela, com `--persist-to` — e o **mesmo** caminho deve ser usado na migração e no servidor:

```powershell
copy .dev.vars.example .dev.vars          # preencha DISCORD_CLIENT_ID e DISCORD_CLIENT_SECRET
$d1 = "$env:TEMP\avalia-d1"               # pasta sem acento e fora do OneDrive
npx.cmd wrangler d1 migrations apply DB --local --persist-to $d1
npx.cmd wrangler pages dev --persist-to $d1
```

O site sobe em <http://localhost:8788>. Para o login funcionar localmente, cadastre também o redirect `http://localhost:8788/api/auth/discord/callback` no Discord. Sem `.dev.vars`, o site abre, mas o login responde **503** (e `/api/me` informa `loginDisponivel: false`).

## Licença

MIT — veja [LICENSE](./LICENSE).

---
Chave Única: **P26-2B-8356-94BE-3650-165C**
