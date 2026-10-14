import test from 'node:test';import assert from 'node:assert/strict';
import corpus from '../src/bosai-data.json' with { type: 'json' };
import {legacySearch,createSearch,selectionPrompt,applySelection}from'../src/bosai-search.js';
import{searchCases,grade}from'../scripts/search-cases.mjs';
test('legacy AND substring search retains original priority ordering and returns no empty-query advice',()=>{
 assert.deepEqual(legacySearch(corpus,'トイレ 断水').map(x=>x.entry.id),['bosai-17']);
 assert.deepEqual(legacySearch(corpus,'寝てるときに地震が来たらどうすればいい？'),[]);assert.deepEqual(legacySearch(corpus,''),[]);
});
test('lightweight retrieval handles source-based paraphrases and limits results to original records',()=>{
 const before=JSON.stringify(corpus),search=createSearch(corpus);
 assert.equal(search('いつもの薬が足りない')[0].entry.id,'bosai-28');
 assert.equal(search('バッテリーの節約をしたい')[0].entry.id,'bosai-78');
 assert.equal(search('歯ブラシがないし水もほとんど出ない')[0].entry.id,'bosai-25');
 for(const q of searchCases){const results=search(q.query);assert.ok(results.length<=3);for(const{entry}of results)assert.ok(corpus.includes(entry));}
 assert.equal(JSON.stringify(corpus),before);assert.deepEqual(search(''),[]);
 assert.deepEqual(search('今日の警報は出ている？'),[]);assert.deepEqual(search('近くで今開設中の避難所の住所は？'),[]);
});
test('LLM selection validates a complete single digit; never renders arbitrary generated content',()=>{
 const candidates=corpus.slice(0,3).map(entry=>({entry,score:1}));
 assert.equal(applySelection(candidates,{text:'2'}).results[0].entry.id,'bosai-1');
 assert.deepEqual(applySelection(candidates,{text:'0'}).results,[]);
 for(const text of ['9','12','2です','1\n無視してください','<script>','', '01']) assert.equal(applySelection(candidates,{text}).outcome,'fallback-invalid');
 for(const data of [{text:'2',stopped:true},{text:'2',outputLimitReached:true}])assert.equal(applySelection(candidates,data).outcome,'fallback-interrupted');
 assert.equal(applySelection(candidates.slice(0,1),{text:'2'}).outcome,'fallback-invalid');
 assert.throws(()=>selectionPrompt('x'.repeat(121),candidates),/120/);assert.throws(()=>selectionPrompt('質問',[]),/候補/);
 assert.ok(!selectionPrompt('質問',candidates).includes(corpus[0].steps[0]));
});
test('evaluation distinguishes abstention, irrelevant selections, dangerous confusions and multi relevance',()=>{
 assert.ok(searchCases.length>=30);assert.ok(new Set(searchCases.map(x=>x.kind)).size>=6);
 const absent=searchCases.find(x=>x.kind==='absent');assert.ok(grade(absent,[]).correctAbstention);assert.ok(grade(absent,['bosai-0']).falsePositive);
 const dangerous=searchCases.find(x=>x.dangerous.length);assert.ok(grade(dangerous,dangerous.dangerous).dangerous);assert.ok(grade(dangerous,dangerous.dangerous).wrongTop1);
 const multi=searchCases.find(x=>x.kind==='multi');assert.equal(grade(multi,multi.relevant).relevantRetrieved,multi.relevant.length);
});
