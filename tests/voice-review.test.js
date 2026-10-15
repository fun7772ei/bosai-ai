import test from 'node:test';
import assert from 'node:assert/strict';
import {correctionReview,applyCorrection} from '../src/voice-review.js';
test('confirmed suggestion preserves base, negation, number and subject',()=>{
 const committed='自信が発生した。父は津波が来ないとは言っていない。震度5。',value='メモ '+committed;
 const [c]=correctionReview(committed,value);
 assert.equal(c.text,'メモ 地震が発生した。父は津波が来ないとは言っていない。震度5。');
 const target={value,dispatchEvent(){this.events=(this.events||0)+1;}};
 assert.equal(applyCorrection(target,c),true);assert.equal(target.events,1);
 assert.equal(applyCorrection(target,c),false);
});
test('manual edits, provisional tails and stale text cannot be replaced',()=>{
 for(const flags of [{edited:true},{provisional:true}])assert.deepEqual(correctionReview('自信が発生した。','自信が発生した。',flags),[]);
 assert.deepEqual(correctionReview('自信が発生した。','手入力'),[]);
 const [c]=correctionReview('自信が発生した。','自信が発生した。');
 const target={value:'送信後の新しい文',dispatchEvent(){throw Error('must not send');}};
 assert.equal(applyCorrection(target,c),false);
});
