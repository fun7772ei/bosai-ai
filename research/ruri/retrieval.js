import corpus from'../../src/bosai-data.json'with{type:'json'};
import{createSearch}from'../../src/bosai-search.js';
import{semanticSearch,combineSearch}from'../../src/semantic-search.js';
import{assessQuestion,filterHazard}from'../../src/query-scope.js';
import{modelFor}from'./models.js';
import provenance from'./corpus-provenance.json'with{type:'json'};
const light=createSearch(corpus);
export const baselinePolicy=Object.freeze({threshold:.8,lightWeight:.5,candidatePool:10,limit:5});
export function checkIndex(index,key){const m=modelFor(key);if(index.model.key!==key||index.model.revision!==m.revision||index.model.repo!==m.repo||index.model.dimensions!==m.dimensions||index.model.assets.find(a=>a.file.endsWith('.onnx')).sha256!==m.assets.find(a=>a.file.endsWith('.onnx')).sha256)throw Error('Wrong document model/revision');if(index.corpusSha256!==provenance.sha256)throw Error('Wrong corpus hash');if(index.ids.length!==corpus.length||index.ids.some((id,i)=>id!==corpus[i].id)||index.vectors.length!==corpus.length||index.vectors.some(v=>v.length!==m.dimensions||v.some(x=>!Number.isFinite(x))))throw Error('Wrong document IDs/dimensions');return index;}
export function baselineRetrieve(query,mode,queryEmbedding,index){
 const scope=assessQuestion(query);if(scope.kind!=='related')return{scope,results:[]};
 const a=filterHazard(light(query,10),query);if(mode==='light'||!queryEmbedding)return{scope,results:a.slice(0,5)};
 checkIndex(index,queryEmbedding.modelKey);if(queryEmbedding.vector.length!==index.model.dimensions||queryEmbedding.vector.some(x=>!Number.isFinite(x)))throw Error('Wrong query dimensions');
 const b=filterHazard(semanticSearch(corpus,index.vectors,queryEmbedding.vector,query,{threshold:.8,limit:88}),query).slice(0,10);
 return{scope,results:mode==='ruri'?b.slice(0,5):combineSearch(a,b,{method:'score',weight:.5,limit:5})};
}
