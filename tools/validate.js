#!/usr/bin/env node
/* データ検証。文書を足したら必ず通すこと。
 *   node tools/validate.js
 * 落とすもの:
 *   - 必須項目の欠落 / id の重複
 *   - 未定義の地域・種別・ドメイン・カテゴリコード
 *   - 存在しない文書を指す rel
 *   - 同じ kind で逆向きのエッジが両方ある（関係の向きの矛盾）
 */
const path = require("path");
global.window = {};
["taxonomy", "documents-int", "documents-us", "documents-eu", "documents-jp"]
  .forEach((f) => require(path.join(__dirname, "..", "data", f + ".js")));

const N = global.window.NAV;
const docs = N.documents;
const ids = new Set(docs.map((d) => d.id));
const cats = new Set(N.categories.map((c) => c.code));
const doms = new Set(N.domains.map((d) => d.code));
const regions = new Set(N.regions.map((r) => r.code));
const types = new Set(N.types.map((t) => t.code));
const kinds = new Set(Object.keys(N.relKinds));
const clusters = new Set(N.clusters.map((c) => c.code));

let errors = 0;
const bad = (m) => { console.log("  ✗ " + m); errors++; };

/* --- 文書 --- */
const seen = new Set();
for (const d of docs) {
  if (seen.has(d.id)) bad("id が重複: " + d.id);
  seen.add(d.id);

  for (const f of ["short", "title", "issuer", "region", "type", "summary", "scope", "url", "year"]) {
    if (d[f] === undefined || d[f] === null || d[f] === "") bad(`${d.id}: 必須項目 ${f} がない`);
  }
  if (!regions.has(d.region)) bad(`${d.id}: 未定義の region "${d.region}"`);
  if (!types.has(d.type)) bad(`${d.id}: 未定義の type "${d.type}"`);
  (d.domains || []).forEach((x) => { if (!doms.has(x)) bad(`${d.id}: 未定義の domain "${x}"`); });
  (d.cats || []).forEach((x) => { if (!cats.has(x)) bad(`${d.id}: 未定義の cat "${x}"`); });

  if (!d.chapters || !d.chapters.length) bad(`${d.id}: chapters が空`);
  (d.chapters || []).forEach((c) => {
    if (!c.no || !c.title) bad(`${d.id}: 章に no または title がない`);
    (c.cat || []).forEach((x) => { if (!cats.has(x)) bad(`${d.id} / ${c.no}: 未定義の cat "${x}"`); });
  });

  (d.rel || []).forEach((r) => {
    if (!ids.has(r.to)) bad(`${d.id}: rel の参照先が存在しない "${r.to}"`);
    if (!kinds.has(r.kind)) bad(`${d.id}: 未定義の rel kind "${r.kind}"`);
    if (r.to === d.id) bad(`${d.id}: 自分自身への rel`);
  });
}

N.categories.forEach((c) => { if (!clusters.has(c.cluster)) bad(`category ${c.code}: 未定義の cluster "${c.cluster}"`); });

/* --- 関係の向き --- */
/* parent / detail / impl / local / supersede は有向。
   同じ kind の逆向きが両方あると、どちらかが誤り。 */
const DIRECTED = ["parent", "detail", "impl", "local", "supersede"];
const edge = new Set();
docs.forEach((d) => (d.rel || []).forEach((r) => edge.add(d.id + "|" + r.to + "|" + r.kind)));
const reported = new Set();
docs.forEach((d) => (d.rel || []).forEach((r) => {
  if (!DIRECTED.includes(r.kind)) return;
  if (!edge.has(r.to + "|" + d.id + "|" + r.kind)) return;
  const pair = [d.id, r.to].sort().join("~") + "|" + r.kind;
  if (reported.has(pair)) return;
  reported.add(pair);
  bad(`関係の向きが矛盾: ${d.id} <-> ${r.to} が両方とも kind="${r.kind}"`);
}));

/* --- 集計 --- */
const chapterCount = docs.reduce((a, d) => a + (d.chapters || []).length, 0);
const relCount = docs.reduce((a, d) => a + (d.rel || []).length, 0);
const catsAll = (d) => {
  const s = new Set(d.cats || []);
  (d.chapters || []).forEach((c) => (c.cat || []).forEach((x) => s.add(x)));
  return s;
};

console.log(`文書 ${docs.length} / 章 ${chapterCount} / 関係 ${relCount}`);
console.log("\n地域別: " + N.regions.map((r) =>
  `${r.code} ${docs.filter((d) => d.region === r.code).length}`).join("  "));
console.log("\n業務カテゴリ別の文書数（章由来を含む）:");
N.categories.forEach((c) =>
  console.log("  " + c.code.padEnd(5) + docs.filter((d) => catsAll(d).has(c.code)).length));
console.log("\n事業ドメイン別の文書数:");
N.domains.forEach((x) =>
  console.log("  " + x.code.padEnd(6) + docs.filter((d) => (d.domains || []).includes(x.code)).length));

const needVerify = docs.filter((d) => d.verify);
console.log(`\n原典確認フラグ (verify) 付き: ${needVerify.length} 件`);
needVerify.forEach((d) => console.log("  ! " + d.short));

console.log(errors ? `\n失敗: ${errors} 件のエラー` : "\nOK: エラーなし");
process.exit(errors ? 1 : 0);
