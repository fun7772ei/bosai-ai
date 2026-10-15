import test from 'node:test';
import assert from 'node:assert/strict';
import {characterEdits,evaluateAsrCases,normalizeAsrText} from '../src/voice-cer.js';
import cases from '../scripts/evaluation/voice-ja-cases.json' with {type:'json'};
test('Japanese CER operates on Unicode code points with documented normalization',()=>{
 assert.equal(normalizeAsrText('震度５弱、 地震。'),'震度5弱地震');
 assert.deepEqual(characterEdits('地震','自信'),{edits:2,referenceChars:2,hypothesisChars:2});
 assert.equal(characterEdits('津波が来ない','津波が来る').edits,2);
 assert.equal(characterEdits('地震。','地震').edits,0);
});
test('unrecorded cases remain explicitly unmeasured, not zero-error',()=>{
 assert.equal(cases.length,28);
 const r=evaluateAsrCases(cases,[{id:'v01',transcript:'地震が発生したらまず何をすればいいですか'}],'tiny');
 assert.equal(r.measured,1);
 assert.equal(r.unmeasured,27);
 assert.equal(r.rows[1].status,'unmeasured');
 assert.equal(r.rows[1].cer,null);
 assert.equal(r.aggregateCer,0);
});
test('a completely empty recording set is not treated as 0 percent error',()=>{
 const r=evaluateAsrCases(cases,[],'base');
 assert.equal(r.aggregateCer,null);
 assert.equal(r.measured,0);
 assert.equal(r.totalEdits,null);
});
test('unknown or duplicate IDs and model mixups are rejected',()=>{
 assert.throws(()=>evaluateAsrCases(cases,[{id:'missing',transcript:'x'}],'tiny'));
 assert.throws(()=>evaluateAsrCases(cases,[{id:'v01',transcript:'x'},{id:'v01',transcript:'y'}],'base'));
 assert.throws(()=>evaluateAsrCases(cases,[],'tiny-streaming'));
});

test('Tiny/Base comparison uses only paired actual recordings',async()=>{
 const {compareAsrReports}=await import('../src/voice-cer.js');
 const tiny=evaluateAsrCases(cases,[{id:'v01',transcript:'地震が発生したらまず何をすればいいですか'},{id:'v02',transcript:'自信が発生しました'}],'tiny');
 const base=evaluateAsrCases(cases,[{id:'v01',transcript:'地震が発生したらまず何をすればいいですか'}],'base');
 const comparison=compareAsrReports(tiny,base);
 assert.equal(comparison.paired,1);
 assert.equal(comparison.unpaired,27);
 assert.equal(comparison.deltaBaseMinusTiny,0);
 assert.equal(comparison.rows.find(row=>row.id==='v02').status,'unpaired');
 assert.throws(()=>compareAsrReports(base,tiny));
});
test('empty model comparison does not invent an accuracy score',async()=>{
 const {compareAsrReports}=await import('../src/voice-cer.js');
 const result=compareAsrReports(evaluateAsrCases(cases,[],'tiny'),evaluateAsrCases(cases,[],'base'));
 assert.equal(result.paired,0);
 assert.equal(result.tinyPairedCer,null);
 assert.equal(result.basePairedCer,null);
});
