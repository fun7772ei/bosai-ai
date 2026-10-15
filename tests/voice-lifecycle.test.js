import test from 'node:test';
import assert from 'node:assert/strict';
import {releaseVoiceResources} from '../src/voice-lifecycle.js';
test('a failed stop still closes resources and is reported, not silently successful',async()=>{
 const calls=[];const result=await releaseVoiceResources({async stop(){calls.push('stop');throw Error('stop failed')},async close(){calls.push('close')}});
 assert.deepEqual(calls,['stop','close']);assert.equal(result.closed,true);assert.equal(result.ok,false);assert.match(result.errors[0],/stop failed/);
});
test('failed close retains uncertainty and permits a caller to keep a retry handle',async()=>{
 const result=await releaseVoiceResources({async stop(){},async close(){throw Error('not closed')}});
 assert.equal(result.closed,false);assert.equal(result.ok,false);
});
test('already stopped path closes once without repeating stop',async()=>{
 let closes=0;const result=await releaseVoiceResources({async stop(){throw Error('duplicate stop')},async close(){closes++}},{alreadyStopped:true});
 assert.equal(result.ok,true);assert.equal(closes,1);
});
