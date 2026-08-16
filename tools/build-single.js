#!/usr/bin/env node
/* index.html と data/ assets/ を 1 枚の自己完結 HTML にまとめる。
 * Artifact として公開する場合や、単一ファイルで配布する場合に使う。
 *   node tools/build-single.js  ->  dist/navigator.html
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

let html = read("index.html");

// <link rel="stylesheet" href="..."> を <style> に置き換える
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) =>
  '<style>\n' + read(href) + '\n</style>');

// <script src="..."></script> をインライン化する
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) =>
  '<script>\n' + read(src).replace(/<\/script>/g, "<\\/script>") + '\n<\/script>');

const outDir = path.join(root, "dist");
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, "navigator.html");
fs.writeFileSync(out, html);

console.log("built " + path.relative(root, out) + "  " + (Buffer.byteLength(html) / 1024).toFixed(0) + " KB");
