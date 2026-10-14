import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
const path = 'docs/source/bosai-app-data.js';
const source = readFileSync(path);
export const sourceBlob = createHash('sha1').update(`blob ${source.length}\0`).update(source).digest('hex');
if (sourceBlob !== '881355b4a4b85a1da39515e8578aa5f74bb2644b') throw Error('Unexpected source blob: review a new import explicitly');
// Pinned, reviewed literal-only source; never execute fetched code in the app.
const groups = vm.runInNewContext(source.toString() + '\n[tsunamiData,hinanData,jishinData,taifuData]', {}, { timeout: 1000 });
const categories = ['津波', '避難所生活', '地震', '台風・大雨・停電'];
let id = 0;
export const entries = groups.flatMap((raw, group) => raw.split('【タイトル】').slice(1).map(block => {
  const lines = block.trim().split('\n').map(line => line.trim()).filter(Boolean);
  const field = label => lines.find(line => line.startsWith(`【${label}】`))?.slice(label.length + 2) ?? '';
  const known = /^(【(?:優先度|概要|準備するもの|手順|注意|出典|キーワード)】|・)/;
  if (lines.slice(1).some(line => !known.test(line))) throw Error('Unparsed source line: ' + lines[0]);
  return { id: `bosai-${id++}`, category: categories[group], title: lines[0], summary: field('概要'), items: field('準備するもの'), steps: lines.filter(line => line.startsWith('・')).map(line => line.slice(1)), warning: field('注意'), keywords: field('キーワード').split(/[,、]/).map(v => v.trim()), priority: Number(field('優先度')), sources: field('出典').split(';').map(value => { const [label, url] = value.split('|').map(v => v.trim()); return { label, url }; }) };
}));
if (entries.length !== 88) throw Error('Expected 88 entries');
const output = JSON.stringify(entries, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (readFileSync('src/bosai-data.json', 'utf8') !== output) throw Error('Imported corpus differs from pinned source');
} else writeFileSync('src/bosai-data.json', output);
console.log(`${entries.length} entries, source blob ${sourceBlob}`);
