import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import corpus from '../src/bosai-data.json' with { type: 'json' };
test('all 88 records and every field match the pinned original source/parser without modification',()=>{
 const source=readFileSync(new URL('../docs/source/bosai-app-data.js',import.meta.url));
 assert.equal(createHash('sha1').update(`blob ${source.length}\0`).update(source).digest('hex'),'881355b4a4b85a1da39515e8578aa5f74bb2644b');
 const groups=vm.runInNewContext(source.toString()+'\n[tsunamiData,hinanData,jishinData,taifuData]',{}, {timeout:1000});
 let id=0;
 // Independently transcribed original app parser, including original IDs/order/category.
 const original=groups.flatMap((raw,index)=>raw.split('【タイトル】').filter(block=>block.trim()).map(block=>{
  const lines=block.split('\n').map(line=>line.trim()).filter(Boolean),title=lines[0];
  let summary='',items='',warning='',priority=1,keywords=[],sources=[];const steps=[];
  for(const line of lines){if(line.startsWith('【概要】'))summary=line.replace('【概要】','');else if(line.startsWith('【準備するもの】'))items=line.replace('【準備するもの】','');else if(line.startsWith('【注意】'))warning=line.replace('【注意】','');else if(line.startsWith('【優先度】'))priority=parseInt(line.replace('【優先度】','').trim(),10);else if(line.startsWith('【出典】'))sources=line.replace('【出典】','').split(';').map(s=>{const[label,url]=s.split('|').map(v=>v.trim());return{label,url};}).filter(s=>s.label&&s.url);else if(line.startsWith('【キーワード】'))keywords=line.replace('【キーワード】','').split(/[,、]/).map(s=>s.trim());else if(line.startsWith('・'))steps.push(line.replace('・',''));}
  return{id:`bosai-${id++}`,category:['津波','避難所生活','地震','台風・大雨・停電'][index],title,summary,items,warning,priority,keywords,sources,steps};
 }));
 assert.equal(corpus.length,88);assert.equal(new Set(corpus.map(e=>e.id)).size,88);assert.deepEqual(corpus,JSON.parse(JSON.stringify(original)));
 assert.deepEqual(Object.values(Object.groupBy(corpus,e=>e.category)).map(v=>v.length),[17,21,22,28]);
});
