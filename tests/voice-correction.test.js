import test from 'node:test';
import assert from 'node:assert/strict';
import {voiceCorrectionCandidates} from '../src/voice-correction.js';
test('the disaster homophone produces only an explicit candidate',()=>{
 const got=voiceCorrectionCandidates('自信が発生した。');
 assert.equal(got.original,'自信が発生した。');
 assert.equal(got.autoApplied,false);
 assert.deepEqual(got.candidates.map(x=>x.text),['地震が発生した。']);
});
test('confidence expression is not rewritten',()=>{
 for(const input of ['自信がない','私は自信があります','自信がありません','地震が発生した','津波が来ない']){
  const got=voiceCorrectionCandidates(input);
  assert.deepEqual(got.candidates,[]);
  assert.equal(got.original,input);
 }
});
test('suggestions preserve negation and the rest of the utterance',()=>{
 const got=voiceCorrectionCandidates('自信が発生した。津波は来ない。');
 assert.equal(got.candidates[0].text,'地震が発生した。津波は来ない。');
});
