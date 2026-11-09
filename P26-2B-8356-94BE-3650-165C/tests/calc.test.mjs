/**
 * Testes do motor de cálculo (public/js/calc.js) — zero dependências.
 * Rodar no laboratório:  node P26-2B-8356-94BE-3650-165C/tests/calc.test.mjs
 * Também roda no navegador por tests/index.html.
 */
import { resumoDisciplina, notaNecessaria, ceil2 } from "../public/js/calc.js";

const REGRAS = { nota_maxima: 10, media_aprovacao: 7, media_minima_exame: 4, media_final_exame: 5 };
const disc = (avaliacoes, regras = {}) => ({ ...REGRAS, ...regras, avaliacoes });

export const casos = [];
const teste = (nome, fn) => casos.push({ nome, fn });
function igual(real, esperado, msg = "") {
  if (real !== esperado) throw new Error(`${msg} esperado ${JSON.stringify(esperado)}, obtido ${JSON.stringify(real)}`);
}

teste("média ponderada com todas as notas", () => {
  const r = resumoDisciplina(disc([
    { tipo: "prova", peso: 35, nota: 8 },
    { tipo: "prova", peso: 35, nota: 6 },
    { tipo: "trabalho", peso: 20, nota: 9 },
    { tipo: "lista", peso: 10, nota: 10 },
  ]));
  // (280 + 210 + 180 + 100) / 100 = 7.7
  igual(r.mediaFinal, 7.7);
  igual(r.situacao, "aprovado");
  igual(r.restantes, 0);
});

teste("nota mínima nas restantes para aprovação direta", () => {
  const r = resumoDisciplina(disc([
    { tipo: "prova", peso: 35, nota: 5 },
    { tipo: "prova", peso: 35, nota: null },
    { tipo: "trabalho", peso: 20, nota: 8 },
    { tipo: "lista", peso: 10, nota: null },
  ]));
  // K = 175 + 160 = 335 · R = 45 · x = (700 - 335) / 45 = 8.111… → 8.12
  igual(r.aprovacao.status, "possivel");
  igual(r.aprovacao.nota, 8.12);
  // evitar reprovação: (400 - 335) / 45 = 1.444… → 1.45
  igual(r.evitarReprovacao.nota, 1.45);
  igual(r.mediaParcial, 6.09); // 335 / 55
  igual(r.pontosGarantidos, 3.35);
  igual(r.mediaMaxima, 7.85); // (335 + 450) / 100
  igual(r.situacao, "em_andamento");
});

teste("a nota mínima arredondada é suficiente (arredonda para cima)", () => {
  const d = disc([{ tipo: "prova", peso: 1, nota: 5 }, { tipo: "prova", peso: 2, nota: null }]);
  const r = resumoDisciplina(d);
  // x = (21 - 5) / 2 = 8 exato
  igual(r.aprovacao.nota, 8);
  const d2 = disc([{ tipo: "prova", peso: 3, nota: 6.1 }, { tipo: "prova", peso: 7, nota: null }]);
  const x = resumoDisciplina(d2).aprovacao.nota; // (70 - 18.3) / 7 = 7.3857 → 7.39
  igual(x, 7.39);
  const media = (3 * 6.1 + 7 * x) / 10;
  if (media < 7) throw new Error(`com ${x} a média ${media} ficaria abaixo de 7`);
});

teste("aprovação garantida mesmo zerando o restante", () => {
  const r = resumoDisciplina(disc([{ tipo: "prova", peso: 80, nota: 9 }, { tipo: "lista", peso: 20, nota: null }]));
  igual(r.aprovacao.status, "garantido");
  igual(r.situacao, "aprovado");
});

teste("aprovação direta impossível → exame inevitável", () => {
  const r = resumoDisciplina(disc([{ tipo: "prova", peso: 60, nota: 2 }, { tipo: "trabalho", peso: 40, nota: null }]));
  // máx = (120 + 400) / 100 = 5.2 < 7
  igual(r.aprovacao.status, "impossivel");
  igual(r.evitarReprovacao.status, "possivel");
  igual(r.evitarReprovacao.nota, 7); // (400 - 120) / 40
  igual(r.situacao, "exame_inevitavel");
});

teste("reprovação direta inevitável", () => {
  const r = resumoDisciplina(disc([{ tipo: "prova", peso: 90, nota: 1 }, { tipo: "lista", peso: 10, nota: null }]));
  // máx = (90 + 100) / 100 = 1.9 < 4
  igual(r.situacao, "reprovado");
});

teste("média final em exame calcula a nota necessária no exame", () => {
  const r = resumoDisciplina(disc([{ tipo: "prova", peso: 1, nota: 5.5 }]));
  igual(r.situacao, "exame");
  igual(r.exame.nota, 4.5); // 2 × 5 − 5.5
});

teste("exame impossível quando a média é muito baixa e a regra exige muito", () => {
  const r = resumoDisciplina(disc([{ tipo: "prova", peso: 1, nota: 4 }], { media_final_exame: 7.5 }));
  igual(r.exame.status, "impossivel"); // 15 − 4 = 11 > 10
});

teste("limite exato conta como aprovado", () => {
  const r = resumoDisciplina(disc([{ tipo: "prova", peso: 3, nota: 7 }, { tipo: "lista", peso: 7, nota: 7 }]));
  igual(r.mediaFinal, 7);
  igual(r.situacao, "aprovado");
});

teste("média exata 6,995 não é arredondada para aprovação", () => {
  const r = resumoDisciplina(disc([{ tipo: "prova", peso: 1000, nota: 6.995 }]));
  igual(r.situacao, "exame");
});

teste("nota zero conta como avaliação feita", () => {
  const r = resumoDisciplina(disc([{ tipo: "prova", peso: 1, nota: 0 }, { tipo: "prova", peso: 1, nota: null }]));
  igual(r.restantes, 1);
  igual(r.mediaParcial, 0);
  igual(r.aprovacao.status, "impossivel"); // precisaria 14
});

teste("escala de 0 a 100", () => {
  const r = resumoDisciplina(disc(
    [{ tipo: "prova", peso: 50, nota: 50 }, { tipo: "trabalho", peso: 50, nota: null }],
    { nota_maxima: 100, media_aprovacao: 60, media_minima_exame: 40, media_final_exame: 50 }
  ));
  igual(r.aprovacao.nota, 70);
  igual(r.mediaMaxima, 75);
});

teste("resumo por tipo", () => {
  const r = resumoDisciplina(disc([
    { tipo: "prova", peso: 30, nota: 6 }, { tipo: "prova", peso: 30, nota: 8 },
    { tipo: "lista", peso: 40, nota: null },
  ]));
  igual(r.porTipo.prova.media, 7);
  igual(r.porTipo.prova.percentual, 60);
  igual(r.porTipo.lista.media, null);
  igual(r.porTipo.trabalho.qtd, 0);
});

teste("notaNecessaria e ceil2 isolados", () => {
  igual(notaNecessaria({ K: 0, R: 0, W: 10 }, 7, 10).status, "impossivel");
  igual(ceil2(7.001), 7.01);
  igual(ceil2(7.3), 7.3); // não sobe por erro de ponto flutuante
});

export function executar(log = console.log) {
  let falhas = 0;
  for (const c of casos) {
    try {
      c.fn();
      log(`✅ ${c.nome}`);
    } catch (e) {
      falhas++;
      log(`❌ ${c.nome}: ${e.message}`);
    }
  }
  log(`\n${casos.length - falhas}/${casos.length} testes passaram.`);
  return falhas;
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("calc.test.mjs")) {
  process.exitCode = executar() ? 1 : 0;
}
