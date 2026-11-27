// FSD（Feature-Sliced Design）の依存ルールを確かめる。違反があれば終了コード 1
// - 下の層から上の層を import しない（shared → entities → features → widgets → pages → app）
// - 同じ層の別スライスを import しない（entities の @x を除く）
// - 別スライスは公開 API（index.ts）経由で import する（中のファイルを直接 import しない）
// - テスト用のデータ（src/testing）はテストからだけ使う
import fs from "node:fs";
import path from "node:path";

const LAYERS = ["shared", "entities", "features", "widgets", "pages", "app"];
const NO_SLICES = new Set(["shared", "app"]);
const src = path.resolve(import.meta.dirname, "../src");
const problems = [];

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(dir, e.name)] : []);

for (const file of walk(src)) {
  const rel = path.relative(src, file).split(path.sep);
  const layer = rel[0];
  if (!LAYERS.includes(layer)) continue;
  const slice = NO_SLICES.has(layer) ? null : rel[1];
  const isTest = file.endsWith(".test.ts");
  for (const [, spec] of fs.readFileSync(file, "utf8").matchAll(/from\s+"(@\/[^"]+)"/g)) {
    const parts = spec.slice(2).split("/");
    const [tl, ts] = parts;
    const where = `${path.relative(process.cwd(), file)}: ${spec}`;
    if (tl === "testing") { if (!isTest) problems.push(`${where}（テスト以外から testing を使っている）`); continue; }
    if (!LAYERS.includes(tl)) { problems.push(`${where}（層が不明）`); continue; }
    if (LAYERS.indexOf(tl) > LAYERS.indexOf(layer)) problems.push(`${where}（下の層から上の層を import している）`);
    if (NO_SLICES.has(tl)) continue;
    const viaX = parts[2] === "@x" && parts[3] === slice;
    if (tl === layer && ts !== slice && !viaX) problems.push(`${where}（同じ層の別スライスを import している）`);
    if (parts.length > 2 && !viaX) problems.push(`${where}（公開 API を通さず中のファイルを import している）`);
  }
}

if (problems.length) {
  console.error(`FSD のルール違反が ${problems.length} 件あります:\n  ` + problems.join("\n  "));
  process.exit(1);
}
console.log("FSD: ルール違反なし");
