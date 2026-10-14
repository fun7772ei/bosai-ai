import { PreTrainedTokenizer } from '@huggingface/transformers';
import { loadEmbedding } from './embedding-runtime.js';
import { openModelStore } from './model-storage.js';
import { AUX_ASSETS, saveAux } from './aux-models.js';
import { getModel,modelFileUrl } from './config.js';
import { createEngine } from './cpu-runtime.js';
import { CpuSession } from './cpu-session.js';
import {groundedPlan,checkGroundedResult}from'./grounded-answer.js';
let store,embedding,session,tokenizer,busy=false,disposed=false;
const send=data=>{if(!disposed)self.postMessage(data);};
self.onmessage=async({data})=>{
 if(data.type==='stop'){session?.stop();return;}
 if(data.type==='dispose'){disposed=true;await embedding?.dispose().catch(()=>{});await session?.dispose().catch(()=>{});store?.close();self.postMessage({disposed:true});return;}
 if(busy||disposed)return;busy=true;
 try{
  store??=await openModelStore();const started=performance.now();
  if(data.type==='download'){await saveAux(store,data.group,progress=>send({progress}));send({id:data.id,elapsedMs:performance.now()-started});}
  else if(data.type==='load-embedding'){embedding=await loadEmbedding(store);send({id:data.id,loadMs:embedding.loadMs});}
  else if(data.type==='embed'){send({id:data.id,...await embedding.embed(data.text,data.kind)});}
  else if(data.type==='load-llm'){
   const model=getModel('lfm2-cpu'),blob=await store.blob(modelFileUrl(model.file,model.key));
   const files=AUX_ASSETS.filter(a=>a.group==='lfm-tokenizer');const json={};for(const asset of files){const saved=await store.match(asset.url);if(!saved)throw Error('LFM Tokenizer未保存');json[asset.file]=await saved.json();}
   tokenizer=new PreTrainedTokenizer(json['tokenizer.json'],json['tokenizer_config.json']);
   session=new CpuSession(()=>createEngine(message=>send({nativeLog:message})),model.weightBytes.q4_k_m);const settings=await session.load(blob);
   send({id:data.id,loadMs:performance.now()-started,settings});
  }else if(data.type==='answer'){
   const plan=groundedPlan(tokenizer,data.query,data.entries,{style:data.style});
   if(!plan.fits)send({id:data.id,answer:{usable:false,reason:'context-overflow',inputTokens:plan.inputTokens,maxTokens:plan.maxTokens,evidenceIds:plan.evidenceIds},elapsedMs:performance.now()-started});
   else{
    const result=await session.complete({prompt:plan.prompt,max_tokens:plan.maxTokens,temperature:0,cache_prompt:false,stream:true,timings_per_token:true,stream_options:{include_usage:true}},update=>send({update}),true);
    send({id:data.id,answer:checkGroundedResult(plan,result),elapsedMs:performance.now()-started});
   }
  }
 }catch(error){send({id:data.id,error:error.message,stack:error.stack});}finally{busy=false;}
};
