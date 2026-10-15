import test from 'node:test';
import assert from 'node:assert/strict';
import {Conversation} from '../src/conversation.js';
import {understandRequest} from '../src/request-understanding.js';
import {BetaController} from '../src/beta-controller.js';
import {retrieve,corpus} from '../src/beta-search.js';
import {evaluateEvidence} from '../src/conversation-applicability.js';
const light=async(q,m,request)=>({...retrieve(q,'light',undefined,request?.scope),actual:'light',timings:{}});

test('dictionary and conversation reject the same unsupported requests before loading any model',async()=>{
  let loads=0;
  const controller=new BetaController({status:async()=>{loads++;throw Error('unexpected model access');}});
  for(const text of ['地震の発生日は？','この道路は今通れますか','今日の避難所は開いていますか','インスリンを増やしていい？']){
    for(const mode of ['light','hybrid','ruri']){
      const dictionary=await controller.search(text,mode);
      assert.equal(dictionary.scope.kind,'unsupported',text);
      assert.deepEqual(dictionary.results,[]);
      const chat=new Conversation((q,m,request)=>controller.search(q,m,request));
      assert.equal((await chat.send(text,mode)).kind,'unsupported',text);
    }
  }
  assert.equal(loads,0);
});

test('parsed scope object travels unchanged through controller and retrieval',async()=>{
  const controller=new BetaController();
  const chat=new Conversation(async(q,m,request)=>{
    const run=await controller.search(q,'light',request);
    assert.equal(run.scope,request.scope);
    return run;
  });
  assert.equal((await chat.send('地震で寝室にいます')).kind,'confirm');
});

test('typed assertions retain turn, subject and unknown/negative polarity without mutating input',async()=>{
  const chat=new Conversation(light);
  await chat.send('私は冠水した道路を車で移動します');
  const previous=structuredClone(chat.state),snapshot=structuredClone(previous);
  const next=understandRequest('その道路は冠水していません。徒歩です',previous,2);
  assert.deepEqual(previous,snapshot);
  assert.equal(next.state.assertions.floodedRoad.value,false);
  assert.equal(next.state.assertions.floodedRoad.polarity,'denied');
  assert.equal(next.state.assertions.floodedRoad.subject,'私');
  assert.equal(next.state.assertions.floodedRoad.sourceTurn,2);
  const question=understandRequest('その道路は冠水していますか？',next.state,3);
  assert.equal(question.state.assertions.floodedRoad.value,null);
  assert.equal(question.state.assertions.floodedRoad.polarity,'unknown');
});

test('a different subject cannot inherit a flooded vehicle across turns',async()=>{
  const chat=new Conversation(light);
  const first=await chat.send('私は水没した車の車内に水が入っています');
  const next=await chat.send('その後、友人は車です');
  assert.equal(next.kind,'clarify');
  assert.deepEqual(chat.state.facts,{});
  assert.throws(()=>chat.choose(first.candidates[0].id,first.selection));
});

test('retrieved and catalog candidates share prerequisite assessment and explicit exclusion diagnostics',()=>{
  const rows=['bosai-69','bosai-70','bosai-71'].map(id=>({entry:corpus.find(e=>e.id===id),score:1}));
  const run=evaluateEvidence({scope:{kind:'related'},results:rows},null,{floodedRoad:false});
  assert.deepEqual(run.results.map(row=>row.entry.id),['bosai-71']);
  assert(run.applicability.filter(x=>x.id!=='bosai-71').every(x=>x.status==='not-applicable'));
  assert(run.evidence.exclusions.every(x=>x.reason==='contradictory-prerequisite'));
  const provisional=evaluateEvidence({scope:{kind:'related'},results:[]},'flood-footwear',{floodedRoad:true});
  assert.equal(provisional.results[0].entry.id,'bosai-84');
  assert.equal(provisional.results[0].assessment.status,'needs-confirmation');
  assert.equal(provisional.results[0].score,null);
});

test('stop followed by a new in-flight turn cannot be changed by the old completion',async()=>{
  const releases=[];
  const chat=new Conversation((q,m,request)=>new Promise(resolve=>releases.push(()=>resolve(light(q,m,request)))));
  const old=chat.send('地震で寝室にいます');
  chat.cancel();
  const fresh=chat.send('津波の避難方法');
  releases[0]();
  await assert.rejects(old,/中断/);
  assert.equal(chat.busy,true);
  releases[1]();
  assert.equal((await fresh).kind,'confirm');
  assert.equal(chat.busy,false);
  assert.deepEqual(chat.state.topics,['津波']);
});
