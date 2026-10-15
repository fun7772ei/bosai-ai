import test from 'node:test';
import assert from 'node:assert/strict';
import {factsIn} from '../src/request-facts.js';
import {Conversation} from '../src/conversation.js';
import {retrieve} from '../src/beta-search.js';
const light=async (q,m,request)=>({...retrieve(q,'light',undefined,request?.scope),actual:'light',timings:{}});
test('f11 flooded-car question is unknown vehicle condition, NOT road condition',async()=>{
 const phrase='浸水した乗用車なのですか？避難の資料は？';
 const facts=factsIn(phrase);
 assert.equal(facts.vehicleFlooded,null);
 assert.equal(facts.floodedRoad,undefined);
 const chat=new Conversation(light);
 const response=await chat.send(phrase,'light');
 assert.equal(response.kind,'clarify');
 assert.equal(chat.state.facts.vehicleFlooded,null);
 assert.equal(chat.state.facts.floodedRoad,undefined);
 assert.equal(chat.state.pending.length,0);
});
test('vehicle and road flood facts remain independently grounded',()=>{
 const vehicle=factsIn('浸水した乗用車から避難するには');
 assert.equal(vehicle.vehicleFlooded,true);
 assert.equal(vehicle.floodedRoad,undefined);
 const mixed=factsIn('道路が冠水しています。浸水した乗用車に乗っています');
 assert.equal(mixed.floodedRoad,true);
 assert.equal(mixed.vehicleFlooded,true);
 const nonVehicle=factsIn('冠水した道路を徒歩で移動します');
 assert.equal(nonVehicle.vehicleFlooded,undefined);
 assert.equal(nonVehicle.floodedRoad,true);
});
test('explicit negative road conditions cannot satisfy flooded-road prerequisites',async()=>{
 const chat=new Conversation(light);
 const reply=await chat.send('台風のあと道路は冠水していません。徒歩です');
 assert.equal(reply.kind,'confirm');
 assert.equal(chat.state.facts.floodedRoad,false);
 assert(!reply.candidates.some(item=>item.id==='bosai-69'||item.id==='bosai-70'));
});
test('live tsunami alerts stay unsupported and cannot reuse selected sources',async()=>{
 const chat=new Conversation(light);
 const first=await chat.send('津波で高台に間に合わない');
 assert.equal(first.kind,'confirm');
 chat.choose(first.candidates[0].id,first.selection);
 assert.equal((await chat.send('今日の津波警報は出ていますか？')).kind,'unsupported');
 assert.equal((await chat.send('それについて詳しく')).kind,'clarify');
});
