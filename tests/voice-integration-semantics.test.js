import test from 'node:test';
import assert from 'node:assert/strict';
import {factsIn} from '../src/request-facts.js';
import {assessRequestScope} from '../src/request-scope.js';
import {Conversation} from '../src/conversation.js';
import {retrieve} from '../src/beta-search.js';
const chat=()=>new Conversation(async(q,m,request)=>({...retrieve(q,'light',undefined,request?.scope),actual:'light',timings:{}}));
test('vehicle interior negative and road affirmative are independent',()=>{
 const facts=factsIn('車内は浸水していませんが道路は冠水しています。');
 assert.equal(facts.vehicleFlooded,false);assert.equal(facts.floodedRoad,true);
 const car=factsIn('乗用車は浸水していません。');
 assert.equal(car.vehicleFlooded,false);assert.equal(car.floodedRoad,undefined);
});
test('ordinary duration questions survive triage; safety verdicts remain unsupported',()=>{
 assert.equal(assessRequestScope('飲料水を沸騰させる時間は何分ですか').kind,'related');
 for(const q of ['水深は何センチまで安全ですか','今の道路は通れますか','今日の津波警報は？','絶対安全な方法ですか','浸水した車で何分まで待っても安全ですか','冠水路を何秒以内なら渡れますか'])assert.equal(assessRequestScope(q).kind,'unsupported');
});
test('short road correction retains movement, denial provenance, and no footwear detour',async()=>{
 const c=chat();await c.send('私は冠水した道路を徒歩で移動します');await c.send('道路は冠水していません');
 assert.equal(c.state.facts.movement,'walk');assert.equal(c.state.facts.floodedRoad,false);
 assert.equal(c.state.assertions.floodedRoad.polarity,'denied');
 const r=await c.send('それについて注意点は？');assert(!r.candidates?.some(x=>['bosai-69','bosai-70'].includes(x.id)));
});
test('bounded location survives followup and subject changes require clarification',async()=>{
 const c=chat();await c.send('私は寝室で地震にあいました');const r=await c.send('そのときの注意点は？');
 assert.equal(c.state.facts.location,'寝室');assert(r.diagnostics.query.includes('寝室'));
 assert.equal((await c.send('その場合、友達はどうしますか')).kind,'clarify');
});

test('shared flood predicate supports water-covered roads without footwear candidates',async()=>{
 for(const text of ['豪雨で通りが水浸しです。徒歩で渡るか迷っています。','道路が水で覆われています。歩いて渡りたいです。']){
 const c=chat(),r=await c.send(text);assert.equal(c.state.facts.floodedRoad,true);assert.equal(r.kind,'confirm');assert(!r.candidates.some(x=>x.id==='bosai-84'));
 }
});
