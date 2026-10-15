import {test} from 'node:test';
import assert from 'node:assert/strict';
import {VoiceDraft} from '../src/voice-draft.js';
test('interim updates replace rather than duplicate text',()=>{
 const v=new VoiceDraft();v.begin('質問です');
 v.interim('地');v.interim('地震');
 assert.equal(v.value,'質問です 地震');
 v.commit({id:'9007199254741999',text:'地震'});
 assert.equal(v.value,'質問です 地震');
 assert.equal(v.stop().provisional,false);
});
test('stable string line IDs replace previous versions and keep ordering',()=>{
 const v=new VoiceDraft();
 v.commit({id:'9007199254741999',text:'昨日の話'});
 v.commit({id:'9007199254741999',text:'地震の話'});
 v.interim('注意');
 assert.equal(v.value,'地震の話 注意');
 v.commit({id:'9007199254742000',text:'注意点'});
 assert.equal(v.value,'地震の話 注意点');
});
test('stop retains uncommitted tail without claiming it was confirmed',()=>{
 const v=new VoiceDraft();v.begin('防災');v.commit({id:'1',text:'津波'});
 v.interim('避難するには');
 assert.deepEqual(v.stop(),{text:'防災 津波 避難するには',provisional:true,manuallyEdited:false});
});
test('manual edits are detected so subsequent callbacks cannot overwrite input',()=>{
 const v=new VoiceDraft();v.begin('地震');v.interim('自信');
 v.noteManualChange('地震 地震');assert.equal(v.edited,true);
 v.commit({id:'1',text:'自信'});assert.equal(v.edited,true);
 v.begin('別の入力');assert.equal(v.edited,false);
});
