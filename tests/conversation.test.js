import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Conversation,conditions,HISTORY_LIMIT} from '../src/conversation.js';
import {retrieve,corpus} from '../src/beta-search.js';
const search=async q=>({...retrieve(q,'light'),actual:'light',timings:{totalMs:0}});
test('contrast excludes the negated setting, not the affirmative disaster',()=>{
 assert.deepEqual(conditions('水没車ではなく、地震後に車を置いて避難したい'),{positive:'地震後に車を置いて避難したい',excluded:['水没車']});
 assert(!conditions('診断を求めていない、薬が不足したときの相談先').positive.includes('診断'));
});
test('ambiguous context asks, clarification replaces rather than repeats ambiguous question',async()=>{const c=new Conversation(search);assert.equal((await c.send('水のことで困っています')).kind,'clarify');const r=await c.send('断水したトイレ');assert.equal(r.kind,'confirm');assert(r.candidates.some(e=>e.id==='bosai-17'));});
test('candidates are not an answer; explicit choice grounds detail and keeps exact originals',async()=>{const c=new Conversation(search);const r=await c.send('寝ているときに地震');assert.equal(r.answerability,'unverified-candidates');assert(!r.entries);assert.throws(()=>c.choose('bosai-0'));const selected=c.choose(r.candidates[0].id);assert.deepEqual(selected.entries[0],corpus.find(e=>e.id===r.candidates[0].id));const details=await c.send('それについて詳しく');assert.deepEqual(details.entries,selected.entries);});
test('a new disaster invalidates previous references and does not inherit quake',async()=>{const c=new Conversation(search);let r=await c.send('寝ているときに地震');c.choose(r.candidates[0].id);r=await c.send('津波で高台に間に合わない');assert(!r.diagnostics.query.includes('地震'));assert.deepEqual(c.state.referenceIds,[]);assert.deepEqual(c.state.topics,['津波']);});
test('ellipsis retains situation, correction preserves hazard but drops old action',async()=>{const queries=[];const c=new Conversation(async q=>{queries.push(q);return search(q);});await c.send('大雨で道路が冠水している。車で移動します');await c.send('車ではなく徒歩です');assert(queries[1].includes('大雨'));assert(!queries[1].includes('運転'));assert.equal(c.state.action,'歩行');await c.send('そのとき注意することは？');assert(queries[2].includes('徒歩'));});
test('no referent, conflicting hazards, multiple subjects request clarification',async()=>{for(const q of ['それは？','地震と津波と洪水','私は徒歩で友人は車です']){const c=new Conversation(search);assert.equal((await c.send(q)).kind,'clarify',q);}});
test('live and individual requests reject even after selecting a source',async()=>{const c=new Conversation(search);const r=await c.send('津波で高台に間に合わない');c.choose(r.candidates[0].id);for(const q of ['今日の津波警報は？','薬の投与量を教えて','保険の補償額は？']){const reply=await c.send(q);assert.equal(reply.kind,'unsupported');assert(!reply.entries);assert.deepEqual(c.state.referenceIds,[]);}});
test('negated contact request does not trigger old guard while positive contact does',async()=>{const c=new Conversation(search);assert.notEqual((await c.send('電話番号ではなく在宅避難の支援情報')).kind,'unsupported');assert.equal((await c.send('在宅避難の相談の電話番号')).kind,'unsupported');});
test('reset and alternative situation do not auto-apply prior evidence',async()=>{const c=new Conversation(search);let r=await c.send('地震で寝ている');c.choose(r.candidates[0].id);r=await c.send('ほかの状況なら？');assert.equal(r.kind,'clarify');assert.equal((await c.send('もっと詳しく')).kind,'clarify');await c.send('リセット');assert.equal(c.history.length,2);assert.deepEqual(c.state.referenceIds,[]);});
test('no results means no evidence, not invented answer',async()=>{const c=new Conversation(async()=>({results:[],scope:{kind:'related'},timings:{}}));assert.equal((await c.send('災害')).answerability,'no-evidence');});
test('bounded history, no silent truncation of accumulated context',async()=>{const c=new Conversation(search);await c.send('地震'+'あ'.repeat(190));assert.equal((await c.send('そのときさらに困ったときにはどうする？')).kind,'clarify');for(let i=0;i<30;i++)await c.send('もっと詳しく');assert.equal(c.history.length,HISTORY_LIMIT);});
test('stop/reset rejects stale async result and choice, allows new search',async()=>{let release;const c=new Conversation(()=>new Promise(r=>release=r));const work=c.send('地震');assert.throws(()=>c.choose('bosai-39'));c.clear();release(await search('地震'));await assert.rejects(work,/中断/);assert.equal(c.history.length,0);assert.equal(c.busy,false);});
test('fresh complete topic without a hazard cannot inherit previous tsunami',async()=>{const c=new Conversation(search);await c.send('津波で高台に間に合わない');const r=await c.send('薬が足りなくて困っています');assert(!r.diagnostics.query.includes('津波'));assert.deepEqual(c.state.topics,[]);});
test('specific live and medical decisions never become source answers',async()=>{const c=new Conversation(search);for(const q of ['近所の薬局は営業していますか','インスリンを追加していいですか','ここの避難所は何人いますか']){assert.equal((await c.send(q)).kind,'unsupported',q);}});
test('P1 live and late-scope unsupported turns cannot revive a prior situation',async()=>{
 for(const unavailable of ['今日の津波警報は出ていますか？','保険の補償額を知りたい']){
  const c=new Conversation(search);await c.send('地震で寝室にいます');assert.equal((await c.send(unavailable)).kind,'unsupported');assert.equal((await c.send('そのとき注意することは？')).kind,'clarify');assert.deepEqual(c.state.pending,[]);assert.deepEqual(c.state.referenceIds,[]);
 }
});
test('P2 multi-person clarification revokes prior candidate and chosen source',async()=>{
 for(const choose of [false,true]){const c=new Conversation(search),r=await c.send('地震で寝室にいます'),id=r.candidates[0].id;if(choose)c.choose(id);assert.equal((await c.send('私は徒歩で友人は車です')).kind,'clarify');assert.throws(()=>c.choose(id));assert.equal((await c.send('もっと詳しく')).kind,'clarify');}
});
test('explicit flooded road and corrected movement retain scene, and choose original action evidence',async()=>{
 const c=new Conversation(search);let r=await c.send('道路が冠水しています。車で進んでいい？');assert.equal(r.candidates[0].id,'bosai-70');r=await c.send('車ではなく徒歩です');assert.equal(c.state.facts.floodedRoad,true);assert.equal(c.state.facts.movement,'walk');assert.equal(r.candidates[0].id,'bosai-69');assert(!r.diagnostics.query.includes('車'));assert(!r.candidates.some(e=>e.id==='bosai-84'));
});
test('rain alone does not establish a flooded road; positive or negative clarification is retained',async()=>{
 for(const [answer,flooded] of [['道路が冠水しています',true],['道路は冠水していません',false]]){const c=new Conversation(search);assert.equal((await c.send('大雨で車を運転しています')).kind,'clarify');const r=await c.send(answer);assert.equal(c.state.facts.floodedRoad,flooded);assert.equal(r.diagnostics.evidence.focus,flooded?'flood-drive':null);}
});
test('tsunami time limitation is separate from merely mentioning a high place',async()=>{
 const c=new Conversation(search);let r=await c.send('津波で高い場所まで行く時間がありません');assert.equal(r.candidates[0].id,'bosai-2');assert.equal(r.diagnostics.evidence.focus,'tsunami-time');r=await c.send('津波から高台に歩いて逃げたい');assert.notEqual(r.diagnostics.evidence.focus,'tsunami-time');
});
test('selection tokens prevent old controls selecting the same ID for a new turn',async()=>{const c=new Conversation(search),r=await c.send('地震で寝室にいます');await c.send('地震で寝室にいます');assert.throws(()=>c.choose(r.candidates[0].id,r.selection));});
test('every clarification path revokes prior candidates and original references',async()=>{
 for(const next of ['その'.repeat(100),'もっと詳しく','地震と津波です','友人は車で私は徒歩です']){const c=new Conversation(search),r=await c.send('地震で寝室です'),id=r.candidates[0].id;assert.equal((await c.send(next)).kind,'clarify');assert.throws(()=>c.choose(id));assert.deepEqual(c.state.referenceIds,[]);}
});
test('footwear purpose is not substituted by road entry, and denied vehicle is not kept as escape context',async()=>{
 const c=new Conversation(search);let r=await c.send('道路が冠水しています。避難時はどんな靴を選べばいい？');assert.equal(r.candidates[0].id,'bosai-84');r=await c.send('水没した車の車内へ水が入ってきます');assert.equal(r.candidates[0].id,'bosai-71');r=await c.send('車ではなく徒歩です');assert(!c.state.facts.vehicleFlooded);assert.notEqual(r.diagnostics?.evidence?.focus,'vehicle-escape');
});
test('a followup about moving does not inherit the previous footwear purpose',async()=>{const c=new Conversation(search);await c.send('冠水した道路でどんな靴を選べばよい？');const r=await c.send('その道路を徒歩で進んでもいい？');assert.equal(r.candidates[0].id,'bosai-69');});
test('scene evidence preserves unknown related coverage and exposes catalog origin without fake scores',async()=>{
 const {contextualEvidence}=await import('../src/conversation-evidence.js');const rows=[86,74].map(n=>({entry:corpus.find(e=>e.id==='bosai-'+n),score:.9}));const r=contextualEvidence({scope:{kind:'related'},results:rows},'flood-walk');assert.deepEqual(r.results.map(r=>r.entry.id),['bosai-69','bosai-86']);assert.equal(r.results[0].score,null);assert.equal(r.results[0].provenance,'catalog-capability');assert.deepEqual(r.evidence.excludedIds,['bosai-74']);
});
test('leaving a parked vehicle and then walking is one current movement, not competing actors',async()=>{const c=new Conversation(search),r=await c.send('水没した車ではなく、地震のあと自動車を置いて歩いて避難する手順についてです。');assert.equal(r.kind,'confirm');assert.equal(c.state.facts.movement,'walk');assert(r.candidates.some(x=>x.id==='bosai-55'));});
test('family relations with different actors require clarification and revoke sources',async()=>{const c=new Conversation(search),r=await c.send('地震で寝室にいます');assert.equal((await c.send('道路が冠水しています。母は歩けず、私は車です。')).kind,'clarify');assert.throws(()=>c.choose(r.candidates[0].id,r.selection));});
test('unsupported earthquake prediction clears context; ordinary post-quake procedures remain available',async()=>{const c=new Conversation(search);await c.send('地震で寝室にいます');assert.equal((await c.send('この町で明日の地震が何時に起きるか教えてください。')).kind,'unsupported');assert.equal((await c.send('その場合は？')).kind,'clarify');assert.notEqual((await c.send('地震後の車を置く手順')).kind,'unsupported');});
