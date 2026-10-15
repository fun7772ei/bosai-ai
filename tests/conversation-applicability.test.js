import {test} from 'node:test';
import assert from 'node:assert/strict';
import {corpus} from '../src/beta-search.js';
import {applicabilityRecords,applicabilityValidation,assessApplicability,validateApplicability} from '../src/conversation-applicability.js';

test('all 88 source-bound sidecars map one to one and match original fields',()=>{
 assert.equal(corpus.length,88);
 assert.equal(applicabilityRecords.length,88);
 assert.deepEqual(applicabilityValidation.errors,[]);
 assert.equal(applicabilityValidation.valid,true);
 assert.deepEqual(applicabilityRecords.map(r=>r.id),corpus.map(e=>e.id));
 assert.equal(applicabilityRecords.filter(r=>r.reviewStatus==='verified-prerequisite-only').length,4);
 assert(applicabilityRecords.every(r=>['verified-prerequisite-only','provisional-title-and-summary'].includes(r.reviewStatus)));
});
test('metadata fails closed if original title, warning, source, or prerequisite changes',()=>{
 for(const altered of [{...corpus[69],title:'変更'}, {...corpus[69],warning:'変更'}, {...corpus[69],sources:[]}]){
  const copy=corpus.map(e=>e.id===altered.id?altered:e);
  assert.equal(validateApplicability(copy).valid,false);
 }
 const edited=applicabilityRecords.map(r=>r.id==='bosai-69'?{...r,prerequisiteEvidence:'存在しない条件'}:r);
 assert.equal(validateApplicability(corpus,edited).valid,false);
});
test('unknown prerequisite is never treated as confirmed, and explicit conflict is not applicable',()=>{
 const road=corpus[69],car=corpus[70],tsunami=corpus[2];
 assert.equal(assessApplicability(road,{facts:{},focus:'flood-walk'}).status,'needs-confirmation');
 assert.equal(assessApplicability(road,{facts:{floodedRoad:false},focus:'flood-walk'}).status,'not-applicable');
 assert.equal(assessApplicability(road,{facts:{floodedRoad:true},focus:'flood-walk'}).status,'candidate');
 assert.equal(assessApplicability(car,{facts:{floodedRoad:true},focus:'flood-walk'}).status,'needs-confirmation');
 assert.equal(assessApplicability(tsunami,{facts:{unreachableHeight:false},focus:'tsunami-time'}).status,'not-applicable');
 assert.equal(assessApplicability({...road,warning:'tampered'}, {facts:{floodedRoad:true},focus:'flood-walk'}).status,'needs-confirmation');
});

test('only source-evidenced prerequisites can be promoted to applicable candidates',()=>{
 const footwear=corpus.find(e=>e.id==='bosai-84'),flood=corpus.find(e=>e.id==='bosai-69');
 assert.equal(assessApplicability(footwear,{focus:'flood-footwear',facts:{}}).status,'needs-confirmation');
 assert.equal(assessApplicability(flood,{focus:'flood-walk',facts:{floodedRoad:true}}).status,'candidate');
 const altered=applicabilityRecords.map(r=>r.id==='bosai-69'?{...r,reviewStatus:'verified-prerequisite-only',prerequisiteEvidence:null}:r);
 assert.equal(validateApplicability(corpus,altered).valid,false);
});
