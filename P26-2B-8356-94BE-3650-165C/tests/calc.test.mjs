/**
 * Testes do motor de cálculo (public/js/calc.js) — zero dependências.
 * Rodar no laboratório:  node P26-2B-8356-94BE-3650-165C/tests/calc.test.mjs
 * Também roda no navegador por tests/index.html.
 *
 * Seções: (1) casos clássicos · (2) bordas · (3) simular / resumoSemestre ·
 *         (4) testes de propriedade com gerador pseudoaleatório de semente fixa.
 */
import {
  resumoDisciplina, notaNecessaria, situacao, ceil2, floor2, round2, simular, resumoSemestre,
} from "../public/js/calc.js";

const REGRAS = { nota_maxima: 10, media_aprovacao: 7, media_minima_exame: 4, media_final_exame: 5 };
const disc = (avaliacoes, regras = {}) => ({ ...REGRAS, ...regras, avaliacoes });

export const casos = [];
const teste = (nome, fn) => casos.push({ nome, fn });
function igual(real, esperado, msg = "") {
  if (real !== esperado) throw new Error(`${msg} esperado ${JSON.stringify(esperado)}, obtido ${JSON.stringify(real)}`);
}
function ok(cond, msg) {
  if (!cond) throw new Error(msg);
}
function igualProfundo(a, b, msg = "") {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) throw new Error(`${msg} objetos diferentes:\n  ${ja}\n  ${jb}`);
}

/* ═════════════════════════ 1. Casos clássicos ═════════════════════════ */

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
  igual(r.mediaParcial, 6.09); // 335 / 55 = 6.0909…
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
  igual(r.exame.nota, 11);
});

teste("limite exato conta como aprovado", () => {
  const r = resumoDisciplina(disc([{ tipo: "prova", peso: 3, nota: 7 }, { tipo: "lista", peso: 7, nota: 7 }]));
  igual(r.mediaFinal, 7);
  igual(r.situacao, "aprovado");
});

teste("média exata 6,995 não é arredondada para aprovação", () => {
  const r = resumoDisciplina(disc([{ tipo: "prova", peso: 1000, nota: 6.995 }]));
  igual(r.situacao, "exame");
  igual(r.mediaFinal, 6.99); // exibição truncada: nunca mostra 7,00 com situação "exame"
});

teste("nota zero conta como avaliação feita", () => {
  const r = resumoDisciplina(disc([{ tipo: "prova", peso: 1, nota: 0 }, { tipo: "prova", peso: 1, nota: null }]));
  igual(r.restantes, 1);
  igual(r.mediaParcial, 0);
  igual(r.aprovacao.status, "impossivel"); // precisaria 14
  igual(r.aprovacao.nota, 14);
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

/* ═════════════════════════ 2. Bordas ═════════════════════════ */

teste("borda: pesos não inteiros", () => {
  const r = resumoDisciplina(disc([
    { tipo: "prova", peso: 0.1, nota: 7 },
    { tipo: "prova", peso: 0.2, nota: 8 },
    { tipo: "trabalho", peso: 0.3, nota: null },
  ]));
  // W = 0.6 · K = 0.7 + 1.6 = 2.3 · R = 0.3
  // x = (7·0.6 − 2.3) / 0.3 = 1.9 / 0.3 = 6.333… → 6.34
  igual(r.aprovacao.nota, 6.34);
  // 6.34 basta: (2.3 + 1.902) / 0.6 = 7.0033 ≥ 7 · 6.33 não: (2.3 + 1.899)/0.6 = 6.998
  ok((2.3 + 0.3 * 6.34) / 0.6 >= 7, "6.34 deveria bastar");
  ok((2.3 + 0.3 * 6.33) / 0.6 < 7, "6.33 não deveria bastar");
  igual(r.mediaParcial, 7.66); // 2.3 / 0.3 = 7.666… → truncado 7.66
  igual(r.pontosGarantidos, 3.83); // 2.3 / 0.6 = 3.8333…
  igual(r.mediaMaxima, 8.83); // (2.3 + 3) / 0.6 = 8.8333…
  igual(r.percentualAvaliado, 50); // 0.3 / 0.6
  igual(r.pesoTotal, 0.6);
});

teste("borda: pesos 0,1 + 0,2 com nota 7 fecham exatamente 7 (ponto flutuante)", () => {
  // 0.1 + 0.2 = 0.30000000000000004 em ponto flutuante; a média tem que continuar 7 e "aprovado"
  const r = resumoDisciplina(disc([{ tipo: "prova", peso: 0.1, nota: 7 }, { tipo: "lista", peso: 0.2, nota: 7 }]));
  igual(r.mediaFinal, 7);
  igual(r.situacao, "aprovado");
  igual(r.percentualAvaliado, 100);
});

teste("borda: R ≈ 0 — todas feitas com pesos decimais conclui a disciplina", () => {
  const r = resumoDisciplina(disc([
    { tipo: "prova", peso: 0.1, nota: 6 }, { tipo: "prova", peso: 0.2, nota: 8 }, { tipo: "lista", peso: 0.7, nota: 5 },
  ]));
  // (0.6 + 1.6 + 3.5) / 1.0 = 5.7 → exame; exame = 10 − 5.7 = 4.3
  igual(r.restantes, 0);
  igual(r.mediaFinal, 5.7);
  igual(r.situacao, "exame");
  igual(r.exame.nota, 4.3);
  igual(r.aprovacao.status, "impossivel");
  igual(r.aprovacao.nota, null); // nada resta: não há nota possível
});

teste("borda: nota mínima exata não sobe 0,01 por erro de ponto flutuante", () => {
  const r = resumoDisciplina(disc([
    { tipo: "prova", peso: 0.1, nota: 7 }, { tipo: "prova", peso: 0.2, nota: 7 }, { tipo: "lista", peso: 0.7, nota: null },
  ]));
  // x = (7·1 − 2.1) / 0.7 = 7 exato (não 7.01)
  igual(r.aprovacao.nota, 7);
  // evitar: (4 − 2.1) / 0.7 = 2.714… → 2.72
  igual(r.evitarReprovacao.nota, 2.72);
});

teste("borda: aprovação garantida com alvo ≈ 0 por erro de ponto flutuante", () => {
  const r = resumoDisciplina(disc(
    [{ tipo: "prova", peso: 0.3, nota: 7 }, { tipo: "lista", peso: 0.7, nota: null }],
    { media_aprovacao: 2.1, media_minima_exame: 1 }
  ));
  // alvo = 2.1·1 − 0.3·7 = 0 (± 1e-16) → garantido
  igual(r.aprovacao.status, "garantido");
  igual(r.situacao, "aprovado");
});

teste("borda: escala 0–100 com notas decimais", () => {
  const r = resumoDisciplina(disc(
    [{ tipo: "prova", peso: 30, nota: 55.5 }, { tipo: "prova", peso: 30, nota: 72.25 }, { tipo: "trabalho", peso: 40, nota: null }],
    { nota_maxima: 100, media_aprovacao: 60, media_minima_exame: 40, media_final_exame: 50 }
  ));
  // K = 1665 + 2167.5 = 3832.5 · x = (6000 − 3832.5) / 40 = 54.1875 → 54.19
  igual(r.aprovacao.nota, 54.19);
  igual(r.evitarReprovacao.nota, 4.19); // (4000 − 3832.5) / 40 = 4.1875
  igual(r.mediaParcial, 63.87); // 3832.5 / 60 = 63.875 → truncado
  igual(r.pontosGarantidos, 38.32); // 38.325
  igual(r.mediaMaxima, 78.32); // (3832.5 + 4000) / 100 = 78.325
  igual(r.percentualAvaliado, 60);
});

teste("borda: escala 0–100, exame com nota acima da máxima é impossível", () => {
  const r = resumoDisciplina(disc([{ tipo: "prova", peso: 1, nota: 45 }],
    { nota_maxima: 100, media_aprovacao: 70, media_minima_exame: 40, media_final_exame: 75 }));
  // exame = 150 − 45 = 105 > 100
  igual(r.situacao, "exame");
  igual(r.exame.status, "impossivel");
  igual(r.exame.nota, 105);
});

teste("borda: todas as avaliações sem nota", () => {
  const r = resumoDisciplina(disc([{ tipo: "prova", peso: 40, nota: null }, { tipo: "trabalho", peso: 60, nota: "" }]));
  igual(r.mediaParcial, null);
  igual(r.pontosGarantidos, 0);
  igual(r.mediaMaxima, 10);
  igual(r.mediaFinal, null);
  igual(r.aprovacao.status, "possivel");
  igual(r.aprovacao.nota, 7); // x = 7·100 / 100 = a própria meta
  igual(r.evitarReprovacao.nota, 4);
  igual(r.percentualAvaliado, 0);
  igual(r.restantes, 2);
  igual(r.situacao, "em_andamento");
  igual(r.exame, null);
});

teste("borda: disciplina sem avaliações / sem pesos", () => {
  const r = resumoDisciplina(disc([]));
  igual(r.situacao, "sem_formula");
  igual(r.aprovacao, null);
  igual(r.mediaParcial, null);
  igual(r.percentualAvaliado, 0);
  igual(resumoDisciplina({ ...REGRAS }).situacao, "sem_formula"); // sem campo avaliacoes
});

teste("borda: exame com média exatamente no mínimo para exame", () => {
  const r = resumoDisciplina(disc([{ tipo: "prova", peso: 2, nota: 4 }, { tipo: "lista", peso: 2, nota: 4 }]));
  // média 4 = media_minima_exame → exame; exame = 2·5 − 4 = 6
  igual(r.situacao, "exame");
  igual(r.exame.status, "possivel");
  igual(r.exame.nota, 6);
  igual(resumoDisciplina(disc([{ tipo: "prova", peso: 1, nota: 3.99 }])).situacao, "reprovado");
  igual(resumoDisciplina(disc([{ tipo: "prova", peso: 1, nota: 3.99 }])).exame, null);
});

teste("borda: exame que exige exatamente a nota máxima é possível", () => {
  const r = resumoDisciplina(disc([{ tipo: "prova", peso: 1, nota: 4 }], { media_final_exame: 7 }));
  // exame = 14 − 4 = 10 = nota máxima → possível
  igual(r.exame.status, "possivel");
  igual(r.exame.nota, 10);
});

teste("borda: média 6,9967 aparece 6,99 (não 7,00) e a conta do exame fecha à mão", () => {
  // Bug corrigido: antes round2(6.99666…) = 7.00 era exibido junto com situação "exame".
  const r = resumoDisciplina(disc([
    { tipo: "prova", peso: 1, nota: 7 }, { tipo: "prova", peso: 1, nota: 7 }, { tipo: "prova", peso: 1, nota: 6.99 },
  ]));
  // média = 20.99 / 3 = 6.99666…
  igual(r.situacao, "exame");
  igual(r.mediaFinal, 6.99);
  // exame = 10 − 6.99666 = 3.00333 → 3.01; e (6.99 + 3.01) / 2 = 5 ✓
  igual(r.exame.nota, 3.01);
  igual(round2((r.mediaFinal + r.exame.nota) / 2), 5);
});

teste("borda: média máxima e pontos garantidos nunca são exibidos acima do real", () => {
  // Bug corrigido: antes mediaMaxima = round2(3.99601) = 4.00 com situação "reprovado" (mín. exame 4).
  const r = resumoDisciplina(disc([{ tipo: "prova", peso: 999, nota: 3.99 }, { tipo: "lista", peso: 1, nota: null }]));
  // K = 3986.01 · máx = (3986.01 + 10) / 1000 = 3.99601 → 3.99 · garantidos 3.98601 → 3.98
  igual(r.mediaMaxima, 3.99);
  igual(r.pontosGarantidos, 3.98);
  igual(r.evitarReprovacao.status, "impossivel"); // (4000 − 3986.01) / 1 = 13.99 > 10
  igual(r.evitarReprovacao.nota, 13.99);
  igual(r.situacao, "reprovado");
});

teste("borda: media_minima_exame = 0 — nunca reprova direto", () => {
  const regras = { media_minima_exame: 0 };
  const r = resumoDisciplina(disc([{ tipo: "prova", peso: 1, nota: 0 }, { tipo: "lista", peso: 1, nota: 0 }], regras));
  // média 0 ≥ 0 → exame; exame = 2·5 − 0 = 10 (= máxima)
  igual(r.situacao, "exame");
  igual(r.evitarReprovacao.status, "garantido");
  igual(r.exame.status, "possivel");
  igual(r.exame.nota, 10);
  const r2 = resumoDisciplina(disc([{ tipo: "prova", peso: 90, nota: 0 }, { tipo: "lista", peso: 10, nota: null }], regras));
  // aprovação: x = 700 / 10 = 70 > 10 → impossível; evitar: alvo 0 → garantido
  igual(r2.aprovacao.status, "impossivel");
  igual(r2.evitarReprovacao.status, "garantido");
  igual(r2.situacao, "exame_inevitavel");
});

teste("borda: media_minima_exame = media_aprovacao (sem exame)", () => {
  const r = resumoDisciplina(disc([{ tipo: "prova", peso: 1, nota: 6.5 }], { media_minima_exame: 7 }));
  igual(r.situacao, "reprovado");
  igual(r.exame, null);
});

teste("borda: exame com média já ≥ 2·media_final_exame pede 0", () => {
  // configuração incomum: exame se ≥ 4, pós-exame 3; média 6 → (6 + 0)/2 = 3
  const r = resumoDisciplina(disc([{ tipo: "prova", peso: 1, nota: 6 }], { media_final_exame: 3 }));
  igual(r.situacao, "exame");
  igual(r.exame.nota, 0);
});

teste("borda: nota em texto, texto em branco e lixo", () => {
  const r = resumoDisciplina(disc([
    { tipo: "prova", peso: 1, nota: "8" },     // conta como 8
    { tipo: "prova", peso: 1, nota: "   " },   // em branco = não feita (antes virava nota 0)
    { tipo: "prova", peso: 1, nota: "abc" },   // lixo = não feita
  ]));
  igual(r.restantes, 2);
  igual(r.mediaParcial, 8);
  igual(r.pesoAvaliado, 1);
});

teste("borda: peso inválido não contamina as somas", () => {
  const r = resumoDisciplina(disc([{ tipo: "prova", peso: "x", nota: 3 }, { tipo: "prova", peso: 2, nota: 8 }]));
  igual(r.pesoTotal, 2);
  igual(r.mediaFinal, 8);
});

teste("borda: regras vindas como texto dão o mesmo resultado", () => {
  const avs = [{ tipo: "prova", peso: 1, nota: 5.5 }];
  const a = resumoDisciplina(disc(avs));
  const b = resumoDisciplina({ nota_maxima: "10", media_aprovacao: "7", media_minima_exame: "4", media_final_exame: "5", avaliacoes: avs });
  igualProfundo(a, b);
});

teste("ceil2, floor2 e round2 com erro de ponto flutuante", () => {
  igual(ceil2(0.29), 0.29);        // 0.29*100 = 28.999999999999996
  igual(floor2(0.29), 0.29);
  igual(floor2(7.7), 7.7);
  igual(floor2(6.999), 6.99);
  igual(floor2(6.9999999999999), 7); // erro de ponto flutuante não derruba para 6.99
  igual(round2(1.005), 1.01);        // antes: 1 (1.005*100 = 100.49999999999999)
  igual(round2(2.675), 2.68);
  igual(round2(7.444), 7.44);
});

teste("notaNecessaria: limita à nota máxima dentro da tolerância", () => {
  const n = notaNecessaria({ K: 0, R: 1, W: 1 }, 10 + 1e-12, 10);
  igual(n.status, "possivel");
  igual(n.nota, 10);
  igualProfundo(notaNecessaria({ K: 8, R: 1, W: 2 }, 4, 10), { status: "garantido", nota: 0 });
  igualProfundo(notaNecessaria({ K: 0, R: 1, W: 2 }, 7, 10), { status: "impossivel", nota: 14 });
});

teste("situacao isolada usa a média exata com tolerância só de ponto flutuante", () => {
  igual(situacao(7, REGRAS), "aprovado");
  igual(situacao(6.9999999999999, REGRAS), "aprovado");
  igual(situacao(6.999, REGRAS), "exame");
  igual(situacao(4, REGRAS), "exame");
  igual(situacao(3.999, REGRAS), "reprovado");
});

/* ═════════════════════ 3. simular / resumoSemestre ═════════════════════ */

const exemplo = () => disc([
  { id: 1, tipo: "prova", peso: 35, nota: 5 },
  { id: 2, tipo: "prova", peso: 35, nota: null },
  { id: 3, tipo: "trabalho", peso: 20, nota: 8 },
  { id: 4, tipo: "lista", peso: 10, nota: null },
]);

teste("simular: aplica notas hipotéticas sem alterar a disciplina", () => {
  const d = exemplo();
  const antes = JSON.stringify(d);
  const r = simular(d, { 2: 9, 4: 10 });
  // K = 175 + 315 + 160 + 100 = 750 / 100 = 7.5
  igual(r.mediaFinal, 7.5);
  igual(r.situacao, "aprovado");
  igual(r.restantes, 0);
  igual(JSON.stringify(d), antes, "d foi mutada:");
});

teste("simular: null desfaz uma nota lançada", () => {
  const r = simular(exemplo(), { 1: null });
  // só o trabalho (20 × 8) feito: parcial 8 · x = (700 − 160) / 80 = 6.75
  igual(r.mediaParcial, 8);
  igual(r.restantes, 3);
  igual(r.aprovacao.nota, 6.75);
});

teste("simular: chaves em texto, ids inexistentes e notas vazias", () => {
  const d = exemplo();
  igual(simular(d, { "2": 9, "4": 10 }).mediaFinal, 7.5);
  igualProfundo(simular(d, { 999: 10 }), resumoDisciplina(d));
  igualProfundo(simular(d, {}), resumoDisciplina(d));
  igualProfundo(simular(d), resumoDisciplina(d));
  igualProfundo(simular(d, null), resumoDisciplina(d));
});

teste("simular: tirar exatamente a nota mínima aprova; 0,01 a menos não", () => {
  const d = exemplo();
  const x = resumoDisciplina(d).aprovacao.nota; // 8.12
  igual(simular(d, { 2: x, 4: x }).situacao, "aprovado");
  igual(simular(d, { 2: x - 0.01, 4: x - 0.01 }).situacao, "exame");
});

teste("resumoSemestre: contagens, média geral e percentual avaliado", () => {
  const ds = [
    // A: aprovado, média final 7.7, 100%
    disc([{ tipo: "prova", peso: 70, nota: 7 }, { tipo: "lista", peso: 30, nota: 9.33333 }]),
    // B: em andamento, parcial 335/55 = 6.09, 55%
    exemplo(),
    // C: exame inevitável, parcial 2, 60%
    disc([{ tipo: "prova", peso: 60, nota: 2 }, { tipo: "trabalho", peso: 40, nota: null }]),
    // D: reprovado, parcial 1, 90%
    disc([{ tipo: "prova", peso: 90, nota: 1 }, { tipo: "lista", peso: 10, nota: null }]),
    // E: exame (concluída), média 5.5, 100%
    disc([{ tipo: "prova", peso: 1, nota: 5.5 }]),
    // F: sem fórmula, sem média, 0%
    disc([]),
  ];
  // A: (490 + 279.9999) / 100 = 7.699999 → floor2 = 7.69
  const s = resumoSemestre(ds);
  igual(s.total, 6);
  igual(s.aprovados, 1);
  igual(s.emAndamento, 1);
  igual(s.emExame, 2);
  igual(s.reprovados, 1);
  igual(s.semFormula, 1);
  // (7.69 + 6.09 + 2 + 1 + 5.5) / 5 = 22.28 / 5 = 4.456 → 4.46
  igual(s.mediaGeral, 4.46);
  // (100 + 55 + 60 + 90 + 100 + 0) / 6 = 67.5
  igual(s.percentualAvaliado, 67.5);
});

teste("resumoSemestre: lista vazia ou inválida", () => {
  const vazio = { total: 0, aprovados: 0, emAndamento: 0, emExame: 0, reprovados: 0, mediaGeral: null, percentualAvaliado: 0, semFormula: 0 };
  igualProfundo(resumoSemestre([]), vazio);
  igualProfundo(resumoSemestre(null), vazio);
  igualProfundo(resumoSemestre(undefined), vazio);
});

teste("resumoSemestre: ignora d.resumo desatualizado e recalcula", () => {
  const d = { ...disc([{ tipo: "prova", peso: 1, nota: 2 }]), resumo: { situacao: "aprovado", mediaFinal: 10 } };
  const s = resumoSemestre([d]);
  igual(s.reprovados, 1);
  igual(s.aprovados, 0);
  igual(s.mediaGeral, 2);
});

teste("resumoSemestre: média geral null quando nenhuma disciplina tem nota", () => {
  const s = resumoSemestre([disc([{ tipo: "prova", peso: 1, nota: null }])]);
  igual(s.mediaGeral, null);
  igual(s.emAndamento, 1);
  igual(s.percentualAvaliado, 0);
});

/* ═════════════════ 4. Testes de propriedade (semente fixa) ═════════════════ */

/** mulberry32: gerador pseudoaleatório de 32 bits, determinístico (mesma semente → mesmos casos). */
function mulberry32(semente) {
  let s = semente >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEMENTE = 20262;
const QTD = 600;
const casas2 = (v) => Math.round(v * 100) / 100;

/** Gera QTD disciplinas aleatórias (escalas 5/10/20/100, pesos inteiros ou decimais, ~45% sem nota). */
function gerarDisciplinas() {
  const rnd = mulberry32(SEMENTE);
  const entre = (a, b) => a + (b - a) * rnd();
  const inteiro = (a, b) => Math.floor(entre(a, b + 1));
  const lista = [];
  for (let i = 0; i < QTD; i++) {
    const N = [5, 10, 10, 20, 100][inteiro(0, 4)];
    const media_aprovacao = casas2(entre(0.4, 0.9) * N);
    const media_minima_exame = rnd() < 0.15 ? 0 : casas2(entre(0, 1) * media_aprovacao);
    const media_final_exame = casas2(entre(0.3, 0.8) * N);
    const qtd = inteiro(1, 8);
    const decimais = rnd() < 0.4;
    const avaliacoes = [];
    for (let j = 0; j < qtd; j++) {
      const peso = decimais ? casas2(entre(0.01, 10)) : inteiro(1, 50);
      const nota = rnd() < 0.45 ? null : casas2(entre(0, N));
      avaliacoes.push({ id: i * 100 + j, tipo: ["prova", "trabalho", "lista"][inteiro(0, 2)], peso, nota });
    }
    lista.push({ id: i, nota_maxima: N, media_aprovacao, media_minima_exame, media_final_exame, avaliacoes });
  }
  return lista;
}
const ALEATORIAS = gerarDisciplinas();

/** Referência independente: K, R, W calculados à parte. */
function somas(d) {
  let K = 0, R = 0, W = 0;
  for (const a of d.avaliacoes) {
    W += a.peso;
    if (a.nota === null) R += a.peso; else K += a.peso * a.nota;
  }
  return { K, R, W };
}
/** Todas as restantes com a mesma nota `x`, via o próprio motor (simular). */
function preencher(d, x) {
  const notas = {};
  for (const a of d.avaliacoes) if (a.nota === null) notas[a.id] = x;
  return simular(d, notas);
}
const ATINGE = { aprovacao: (s) => s === "aprovado", evitarReprovacao: (s) => s === "aprovado" || s === "exame" };
const META = { aprovacao: "media_aprovacao", evitarReprovacao: "media_minima_exame" };

function propriedade(nome, fn) {
  teste(`propriedade (${QTD} disciplinas, semente ${SEMENTE}): ${nome}`, () => {
    let verificados = 0;
    for (const d of ALEATORIAS) {
      try { verificados += fn(d, resumoDisciplina(d)) === false ? 0 : 1; }
      catch (e) { throw new Error(`disciplina #${d.id} ${JSON.stringify(d)} → ${e.message}`); }
    }
    ok(verificados > 0, "nenhuma disciplina exercitou a propriedade");
  });
}

propriedade("(a) a nota mínima \"possivel\" basta para atingir a meta", (d, r) => {
  const { K, R, W } = somas(d);
  let usou = false;
  for (const chave of ["aprovacao", "evitarReprovacao"]) {
    const m = r[chave];
    if (!m || m.status !== "possivel") continue;
    usou = true;
    const meta = d[META[chave]];
    ok((K + R * m.nota) / W + 1e-9 >= meta, `${chave}: com ${m.nota} a média ${(K + R * m.nota) / W} < ${meta}`);
    ok(ATINGE[chave](preencher(d, m.nota).situacao), `${chave}: simular com ${m.nota} não atingiu a meta`);
    ok(m.nota <= d.nota_maxima, `${chave}: nota ${m.nota} acima da máxima`);
  }
  return usou;
});

propriedade("(b) nota mínima − 0,01 não basta", (d, r) => {
  const { K, R, W } = somas(d);
  let usou = false;
  for (const chave of ["aprovacao", "evitarReprovacao"]) {
    const m = r[chave];
    if (!m || m.status !== "possivel" || !(m.nota > 0.01)) continue;
    usou = true;
    const meta = d[META[chave]];
    const menos = casas2(m.nota - 0.01);
    ok((K + R * menos) / W < meta, `${chave}: ${menos} já bastaria`);
    ok(!ATINGE[chave](preencher(d, menos).situacao), `${chave}: simular com ${menos} atingiu a meta`);
  }
  return usou;
});

propriedade("status \"garantido\" basta com zero e \"impossivel\" não basta nem com a nota máxima", (d, r) => {
  let usou = false;
  for (const chave of ["aprovacao", "evitarReprovacao"]) {
    const m = r[chave];
    if (!m || r.restantes === 0) continue;
    if (m.status === "garantido") { usou = true; ok(ATINGE[chave](preencher(d, 0).situacao), `${chave}: garantido mas zero não basta`); }
    if (m.status === "impossivel") {
      usou = true;
      ok(!ATINGE[chave](preencher(d, d.nota_maxima).situacao), `${chave}: impossível mas a nota máxima basta`);
      ok(m.nota > d.nota_maxima, `${chave}: impossível com nota ${m.nota} ≤ máxima`);
    }
  }
  return usou;
});

propriedade("(c) coerência: pontosGarantidos ≤ mediaParcial e mediaMaxima ≥ pontosGarantidos", (d, r) => {
  if (r.mediaParcial !== null) ok(r.pontosGarantidos <= r.mediaParcial, `garantidos ${r.pontosGarantidos} > parcial ${r.mediaParcial}`);
  ok(r.mediaMaxima >= r.pontosGarantidos, `máxima ${r.mediaMaxima} < garantidos ${r.pontosGarantidos}`);
  ok(r.mediaMaxima <= d.nota_maxima, `máxima ${r.mediaMaxima} > nota máxima`);
  ok(r.pontosGarantidos >= 0, "garantidos negativos");
  if (r.restantes === 0) {
    igual(r.mediaFinal, r.pontosGarantidos, "concluída: final ≠ garantidos:");
    igual(r.mediaFinal, r.mediaMaxima, "concluída: final ≠ máxima:");
  }
  // valores exibidos nunca passam do valor exato
  const { K, R, W } = somas(d);
  ok(r.pontosGarantidos <= K / W + 1e-9, "garantidos exibidos acima do real");
  ok(r.mediaMaxima <= (K + R * d.nota_maxima) / W + 1e-9, "máxima exibida acima do real");
});

propriedade("(d) simular com {} é idêntico a resumoDisciplina e não muta a disciplina", (d, r) => {
  const antes = JSON.stringify(d);
  igualProfundo(simular(d, {}), r);
  igual(JSON.stringify(d), antes, "d foi mutada:");
});

propriedade("média final exibida nunca contradiz a situação", (d) => {
  const s = preencher(d, casas2(d.nota_maxima * 0.37)); // conclui com uma nota qualquer
  ok(s.mediaFinal !== null, "deveria estar concluída");
  ok((s.mediaFinal >= d.media_aprovacao) === (s.situacao === "aprovado"), `média ${s.mediaFinal} × ${s.situacao}`);
  ok((s.mediaFinal < d.media_minima_exame) === (s.situacao === "reprovado"), `média ${s.mediaFinal} × ${s.situacao}`);
});

propriedade("exame: a nota pedida basta, 0,01 a menos não, e a conta fecha com a média exibida", (d) => {
  const s = preencher(d, casas2(d.nota_maxima * 0.5));
  if (!s.exame || s.exame.status !== "possivel") return false;
  const { K, W } = somas({ ...d, avaliacoes: d.avaliacoes.map((a) => ({ ...a, nota: a.nota ?? casas2(d.nota_maxima * 0.5) })) });
  const M = K / W, F = d.media_final_exame, E = s.exame.nota;
  ok((M + E) / 2 + 1e-9 >= F, `exame ${E} não basta`);
  if (E > 0.01) ok((M + E - 0.01) / 2 < F, `exame ${E} − 0,01 ainda bastaria`);
  ok((s.mediaFinal + E) / 2 + 1e-9 >= F, `conta exibida não fecha: (${s.mediaFinal} + ${E}) / 2 < ${F}`);
});

propriedade("resumoSemestre bate com a soma das situações", () => {
  const s = resumoSemestre(ALEATORIAS);
  igual(s.total, QTD);
  igual(s.aprovados + s.emAndamento + s.emExame + s.reprovados + s.semFormula, s.total, "categorias não somam o total:");
  ok(s.mediaGeral !== null, "média geral nula");
  ok(s.percentualAvaliado >= 0 && s.percentualAvaliado <= 100, "percentual fora de 0–100");
  return true;
});

/* ═════════════════════════ Runner ═════════════════════════ */

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
