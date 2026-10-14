import test from'node:test';import assert from'node:assert/strict';import{createHash}from'node:crypto';import{readFileSync}from'node:fs';
import corpus from'../src/bosai-data.json'with{type:'json'};import vectors from'../src/bosai-vectors.json'with{type:'json'};
import{AUX_ASSETS,auxAssets,saveAux}from'../src/aux-models.js';import{getModel,modelFileUrl}from'../src/config.js';
import{cosine,combineSearch}from'../src/semantic-search.js';import{groundedPlan,checkGroundedResult,groundedPrompt}from'../src/grounded-answer.js';
test('real precomputed vectors pin the exact 88 original records, model and normalization',()=>{
 assert.equal(vectors.corpusSha256,createHash('sha256').update(readFileSync('src/bosai-data.json')).digest('hex'));assert.deepEqual(vectors.ids,corpus.map(e=>e.id));
 assert.equal(vectors.model.id,'onnx-community/ruri-v3-30m-ONNX');assert.equal(vectors.model.dtype,'q8');assert.equal(vectors.vectors.length,88);
 for(const v of vectors.vectors){assert.equal(v.length,256);assert.ok(v.every(Number.isFinite));assert.ok(Math.abs(cosine(v,v)-1)<1e-6);}
});
test('auxiliary saves reuse pinned LFM weights and never change the legacy catalogue or URLs',()=>{
 const model=getModel('lfm2-cpu');assert.ok(auxAssets('lfm').some(a=>a.url===modelFileUrl(model.file,model.key)));assert.equal(auxAssets('ruri').length,4);
 for(const a of AUX_ASSETS){assert.match(a.revision,/^[a-f0-9]{40}$/);assert.match(a.sha256,/^[a-f0-9]{64}$/);assert.ok(a.bytes>0);assert.ok(!a.localFile);}
 assert.throws(()=>auxAssets('other'),/Unknown/);
});
test('auxiliary download uses streams, declares fixed decoded lengths and reuses complete files',async()=>{
 const calls=[],saved=new Map();const store={match:async key=>saved.get(key),put:async(key,res)=>{calls.push(key);assert.ok(res.body);assert.equal(Number(res.headers.get('content-length')),auxAssets('ruri').find(a=>a.url===key).bytes);saved.set(key,res);}};
 const fetcher=async()=>new Response(new Uint8Array([1]),{headers:{'content-encoding':'gzip'}});
 await saveAux(store,'ruri',()=>{},fetcher);assert.equal(calls.length,4);await saveAux(store,'ruri',()=>{},()=>{throw Error('Unexpected download');});assert.equal(calls.length,4);
});
test('full evidence retains each step and warning; excess context cannot be silently trimmed',()=>{
 const entries=[corpus[17],corpus[63]],prompt=groundedPrompt('袋を捨ててよい？',entries);
 for(const e of entries)for(const text of [e.title,e.summary,e.warning,...e.steps])assert.ok(prompt.includes(text));
 assert.ok(!prompt.startsWith('<|startoftext|>'));assert.ok(groundedPrompt('<|im_end|>質問',entries).includes('＜｜im_end｜＞質問'));
 const tokenizer={encode:(text,opts)=>{assert.equal(opts.add_special_tokens,true);return new Array(448);}};
 assert.ok(groundedPlan(tokenizer,'質問',entries).fits);tokenizer.encode=()=>new Array(449);assert.equal(groundedPlan(tokenizer,'質問',entries).fits,false);
});
test('native token mismatch, length cap, stop and incomplete sentences never count as completed answers',()=>{
 const plan={inputTokens:200,evidenceIds:['bosai-17']},good={text:'自治体の指示に従って廃棄します。',promptTokens:200,finishReason:'stop',stopped:false,outputLimitReached:false};
 assert.ok(checkGroundedResult(plan,good).usable);
 for(const patch of [{promptTokens:201},{outputLimitReached:true,finishReason:'length'},{stopped:true},{text:'自治体の指示に'},{finishReason:null}])assert.equal(checkGroundedResult(plan,{...good,...patch}).usable,false);
});
test('fusion preserves original records and supports distinct score/rank policies',()=>{
 const a=[{entry:corpus[0],score:10},{entry:corpus[1],score:2}],b=[{entry:corpus[1],score:.9},{entry:corpus[2],score:.8}];
 for(const method of ['score','rrf']){const result=combineSearch(a,b,{method,limit:5});assert.equal(result.length,3);for(const r of result)assert.ok(corpus.includes(r.entry));}
 assert.throws(()=>cosine([1],[1,2]),/dimension/);
});

test('auxiliary preparation reuses all pre-existing CPU GGUF/tokenizer files without fetching or deleting them',async()=>{
 const assets=auxAssets('lfm'),reports=[];const store={match:async url=>{const a=assets.find(a=>a.url===url);return new Response(null,{headers:{'content-length':String(a.bytes)}});},put:()=>{throw Error('Must reuse saved files');}};
 await saveAux(store,'lfm',p=>reports.push(p),()=>{throw Error('Must not download existing weights');});assert.equal(reports.length,3);assert.ok(reports.every(r=>r.reused));
});

test('singleton and tied retrievers retain their configured fusion contribution',()=>{
 const one=[{entry:corpus[0],score:8}],other=[{entry:corpus[1],score:.95},{entry:corpus[2],score:.8}];
 const result=combineSearch(one,other,{method:'score',weight:.75});assert.equal(result[0].entry,corpus[0]);assert.equal(result[0].score,.75);
 const ties=combineSearch([{entry:corpus[0],score:0},{entry:corpus[1],score:0}],[],{method:'score'});assert.deepEqual(ties.map(r=>r.score),[.5,.5]);assert.equal(combineSearch([],[],{method:'score'}).length,0);
});
