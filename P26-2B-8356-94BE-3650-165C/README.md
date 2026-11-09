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

O estudante entra com a conta do **Discord** (OAuth2: `user_id`, nome e avatar) e cadastra as disciplinas do semestre, definindo para cada uma:

- a **fórmula da média**: lista de avaliações (provas, trabalhos e listas), cada uma com seu **peso**;
- as **regras de aprovação**: nota máxima (10 ou 100), média para aprovação direta (ex.: 7), média mínima para ter direito a exame (ex.: 4) e média final exigida após o exame (ex.: 5, com `(média + exame) ÷ 2`).

Conforme as notas são lançadas, o JavaScript no navegador recalcula **a cada tecla**:

| Indicador | Cálculo |
| --- | --- |
| Média parcial | média ponderada só das avaliações já feitas |
| Pontos garantidos | quanto já está assegurado na média final (o resto valendo zero) |
| Média máxima possível | tirando a nota máxima em tudo o que falta |
| **Nota mínima para aprovação direta** | `x = (meta × Σpesos − Σ(peso×nota)) ÷ Σpesos restantes`, arredondada para cima |
| **Nota mínima para evitar reprovação direta** | mesma fórmula com a média mínima para exame |
| Nota necessária no exame final | `2 × média pós-exame − média`, quando a disciplina termina em exame |

A situação aparece em destaque (aprovação garantida, em andamento, exame inevitável, exame, reprovação) e os campos de nota vazios já mostram a nota mínima necessária. As notas são salvas automaticamente no **Cloudflare D1** e ficam disponíveis o semestre inteiro, em qualquer dispositivo.

## Arquitetura

```
P26-2B-8356-94BE-3650-165C/
├── public/                  Frontend — HTML5, CSS3, JavaScript puro (sem frameworks)
│   ├── index.html           Telas de login e app; rodapé com a Chave Única
│   ├── styles.css           Layout responsivo, modo claro/escuro
│   └── js/
│       ├── app.js           DOM, eventos, cálculo instantâneo e salvamento automático
│       └── calc.js          Motor de cálculo (usado pelo navegador E pelo servidor)
├── functions/api/           Cloudflare Pages Functions
│   ├── auth/discord.js              GET  inicia OAuth2 (com state anti-CSRF)
│   ├── auth/discord/callback.js     GET  troca code → token → /users/@me → D1 → sessão
│   ├── auth/logout.js               POST encerra sessão
│   ├── me.js                        GET  perfil logado
│   ├── disciplinas/index.js         GET lista · POST cria
│   ├── disciplinas/[id].js          GET · PUT (fórmula/regras) · DELETE
│   ├── avaliacoes/[id].js           PATCH lança/limpa uma nota
│   └── status.js                    GET  diagnóstico D1 + Discord
├── lib/                     Sessões, validação de regras de negócio e acesso ao D1
├── migrations/0001_init.sql Esquema relacional D1 (usuarios, sessoes, disciplinas, avaliacoes)
├── tests/                   Testes do cálculo (node ou navegador)
├── skills/                  SKILL.md usados pelos agentes
├── AGENTS.md                Agentes e harness utilizados
└── wrangler.jsonc           Configuração Pages + binding D1
```

**Regras validadas no servidor** (`lib/validacao.js`, sem confiar no cliente): todas as rotas exigem sessão e filtram pelo `user_id` da sessão; nota entre 0 e a nota máxima da disciplina; peso entre 0 e 100; tipo ∈ {prova, trabalho, lista}; `média para exame ≤ média de aprovação ≤ nota máxima`; até 40 disciplinas e 30 avaliações por disciplina; ao editar, ids de avaliação precisam pertencer à disciplina. O servidor devolve o resumo calculado pelo mesmo `calc.js`.

**Segurança:** sessão com token aleatório de 256 bits (cookie `HttpOnly; Secure; SameSite=Lax`), apenas o hash SHA-256 fica no D1; `state` no OAuth2; escritas só com `Content-Type: application/json`; DOM montado sem `innerHTML`.

## Como publicar (Cloudflare Pages + D1 + Discord)

1. **Fork** de `frankalcantara/Avalia2026-2`, clone e, na raiz, rode `node iniciar.mjs P26-2B-8356-94BE-3650-165C`. Copie os arquivos deste projeto para dentro da pasta gerada, substituindo os existentes.
2. **D1** (dentro da pasta):
   ```powershell
   cd P26-2B-8356-94BE-3650-165C
   npx.cmd wrangler login
   npx.cmd wrangler d1 create db-p26-2b-8356-94be-3650-165c
   # cole o database_id em wrangler.jsonc
   npx.cmd wrangler d1 migrations apply DB --remote
   ```
3. **Pages:** Workers & Pages → Create → Pages → Connect to Git → seu fork.
   - Root directory: `P26-2B-8356-94BE-3650-165C` · Build command: *(vazio)* · Build output: `public`
   - O binding `DB` vem do `wrangler.jsonc`.
4. **Discord:** em <https://discord.com/developers/applications> crie uma Application → OAuth2 → copie Client ID, gere Client Secret e adicione o redirect `https://SEU-PROJETO.pages.dev/api/auth/discord/callback`.
5. No projeto Pages → Settings → Variables and Secrets: `DISCORD_CLIENT_ID` e `DISCORD_CLIENT_SECRET` (tipo *Secret*). Faça um novo deploy.
6. Confira `https://SEU-PROJETO.pages.dev/api/status` → `d1Conectado: true` e `discordConfigurado: true`.
7. Atualize `URL_CLOUDFLARE` acima e rode na raiz: `node validar-local.mjs P26-2B-8356-94BE-3650-165C`.

### Rodar localmente
```powershell
copy .dev.vars.example .dev.vars   # preencha os valores
npx.cmd wrangler d1 migrations apply DB --local
npx.cmd wrangler pages dev
node tests/calc.test.mjs
```

## Licença
MIT — veja [LICENSE](./LICENSE).

---
Chave Única: **P26-2B-8356-94BE-3650-165C**
