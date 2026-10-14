import{openModelStore}from'../../src/model-storage.js';import{documentText}from'../../src/semantic-search.js';import corpus from'../../src/bosai-data.json';import{modelFor,save}from'./models.js';import{load}from'./runtime.js';
let store,embedding,busy=false,disposed=false;
self.onmessage=async({data:d})=>{if(d.type==='dispose'){disposed=true;await embedding?.dispose().catch(()=>{});store?.close();self.postMessage({disposed:true});return;}if(busy||disposed)return;busy=true;
 try{store??=await openModelStore();let result={};
 if(d.type==='save'){await save(store,d.modelKey,progress=>self.postMessage({progress}));}
 else if(d.type==='load'){if(embedding)throw Error('Use a new worker to switch models');embedding=await load(store,d.modelKey);result={loadMs:embedding.loadMs,modelKey:d.modelKey};}
 else if(d.type==='embed'){if(!embedding)throw Error('Model not loaded');result=await embedding.embed(d.text,d.kind);}
 else if(d.type==='precompute'){if(!embedding)throw Error('Model not loaded');const vectors=[],samples=[];for(const e of corpus){const r=await embedding.embed(documentText(e),'document');vectors.push(r.vector);samples.push({id:e.id,tokens:r.tokens,elapsedMs:r.elapsedMs});self.postMessage({progress:{entry:e.id}});}result={model:modelFor(embedding.key),ids:corpus.map(e=>e.id),vectors,samples};}
 else throw Error('Unknown research operation');
 if(!disposed)self.postMessage({id:d.id,...result});
 }catch(e){if(!disposed)self.postMessage({id:d.id,error:e.message||e.name,stack:e.stack});}finally{busy=false;}};
