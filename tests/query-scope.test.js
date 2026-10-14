import{retrieve}from'../src/beta-search.js';
import test from'node:test';import assert from'node:assert/strict';import{assessQuestion,filterHazard}from'../src/query-scope.js';import corpus from'../src/bosai-data.json'with{type:'json'};
test('real-time forecasts differ from general instructions after a warning',()=>{
 assert.equal(assessQuestion('今夜の津波の予報は何メートル？').kind,'unsupported');assert.equal(assessQuestion('津波警報が出たときどう避難する？').kind,'related');assert.equal(assessQuestion('第一波到達予想時刻までなら安全ですか？').kind,'related');assert.equal(assessQuestion('今夜台風が来るので窓の対策をしたい').kind,'related');
});
test('personal drug quantities and missing facts are not substituted by nearby general information',()=>{for(const q of ['インスリンを何単位使う？','Wi-Fiのパスワードは？','火山灰が積もった畑の対処は？','避難所の住所と電話番号を教えて'])assert.equal(assessQuestion(q).kind,'unsupported');assert.equal(assessQuestion('薬が足りないので避難所で相談したい').kind,'related');});
test('ambiguous situations ask for context rather than choose an unqualified action',()=>{for(const q of ['水のことで困っています','家に残るか避難するか迷っています','トイレが心配です'])assert.equal(assessQuestion(q).kind,'clarify');assert.equal(assessQuestion('断水したトイレの対処は？').kind,'related');});
test('explicit tsunami and flood queries cannot rank the other hazard as a substitute',()=>{const all=corpus.map(entry=>({entry,score:1}));assert.ok(filterHazard(all,'津波が来るとき').every(r=>r.entry.category==='津波'||r.entry.category==='地震'));assert.ok(filterHazard(all,'洪水のとき上に逃げる').every(r=>r.entry.category!=='津波'));assert.equal(filterHazard(all,'津波と洪水の違い').length,88);});

// Review regression: context must be supplied before any actionable record is selectable.
test('ambiguity suppresses candidates in every mode, then a choice resolves context',()=>{
 for(const mode of ['light','ruri','hybrid']){
  const result=retrieve('家に残るか避難するか迷っています',mode,new Array(256).fill(0));
  assert.equal(result.scope.kind,'clarify');assert.deepEqual(result.results,[]);
 }
 const vague=assessQuestion('水のことで困っています');
 for(const choice of vague.choices) assert.notEqual(assessQuestion(choice+'、水のことで困っています').kind,'clarify');
});
test('bare current warning and forecast requests are directed to official live sources',()=>{
 for(const q of ['今日の津波警報は？','現在の注意報は？','今夜の予報は？']){
  assert.equal(assessQuestion(q).code,'live-local');assert.deepEqual(retrieve(q).results,[]);
 }
 assert.equal(assessQuestion('津波警報が出たときの一般的な行動').kind,'related');
});
