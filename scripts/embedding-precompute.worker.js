import {loadEmbedding}from'../src/embedding-runtime.js';
import{openModelStore}from'../src/model-storage.js';
import{saveAux,RURI}from'../src/aux-models.js';
import corpus from'../src/bosai-data.json';
import{documentText}from'../src/semantic-search.js';
let store,embedding;
self.onmessage=async({data})=>{try{
 if(data.type==='precompute'){
  store=await openModelStore();await saveAux(store,'ruri',p=>self.postMessage({progress:p}));embedding=await loadEmbedding(store);
  self.postMessage({progress:{loadMs:embedding.loadMs}});
  const vectors=[],samples=[];
  for(const entry of corpus){const result=await embedding.embed(documentText(entry),'document');vectors.push(result.vector.map(n=>Number(n.toFixed(8))));samples.push({id:entry.id,tokens:result.tokens,elapsedMs:result.elapsedMs});self.postMessage({progress:{id:entry.id,tokens:result.tokens,elapsedMs:result.elapsedMs}});}
  const queries=[];for(const query of ['寝てるときに地震が来たらどうすればいい？','津波で高台に間に合わないときは？','水が出ないときのトイレは？'])queries.push({query,...await embedding.embed(query)});
  await embedding.dispose();store.close();self.postMessage({done:{model:RURI,loadMs:embedding.loadMs,samples,vectors,queries}});
 }
}catch(e){self.postMessage({error:e.message,stack:e.stack});}};
