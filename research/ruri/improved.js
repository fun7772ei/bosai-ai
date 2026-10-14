import corpus from'../../src/bosai-data.json'with{type:'json'};import{createSearch}from'../../src/bosai-search.js';import{semanticSearch,combineSearch}from'../../src/semantic-search.js';import{filterHazard}from'../../src/query-scope.js';import{checkIndex}from'./retrieval.js';import{analyze,scopeFor,constraints,compatible,facets}from'./intent.js';
const light=createSearch(corpus),metadata=new Map(facets.map(f=>[f.id,f]));
export const improvedPolicy=Object.freeze({threshold:.8,lightWeight:.5,candidatePool:10,limit:5,answerKinds:['general-guidance'],guard:'typed-coverage-and-action-target-v1'});
export function improvedRetrieve(query,mode,embedding,index){
 const intent=analyze(query),scope=scopeFor(query,intent),required=constraints(intent);
 if(scope.kind!=='related')return{scope,results:[],answerability:{state:scope.kind==='clarify'?'needs-context':'outside-coverage',intent,required,relatedIds:[]}};
 const a=filterHazard(light(query,88),query);let b=[];
 if(embedding&&mode!=='light'){checkIndex(index,embedding.modelKey);if(embedding.vector.length!==index.model.dimensions||embedding.vector.some(x=>!Number.isFinite(x)))throw Error('Wrong query dimensions');b=filterHazard(semanticSearch(corpus,index.vectors,embedding.vector,query,{threshold:.8,limit:88}),query);}
 const eligible=rows=>rows.filter(r=>compatible(metadata.get(r.entry.id),required));
 const aa=eligible(a).slice(0,10),bb=eligible(b).slice(0,10);
 const results=(!embedding||mode==='light'?aa:mode==='ruri'?bb:combineSearch(aa,bb,{method:'score',weight:.5,limit:5})).slice(0,5);
 const excluded=[...new Set([...a,...b].filter(r=>!compatible(metadata.get(r.entry.id),required)).map(r=>r.entry.id))];
 return{scope:results.length?scope:{...scope,reason:'関連する言葉は見つかりましたが、対象・行動を満たす根拠候補を確認できませんでした。条件を追加してください。'},results,answerability:{state:results.length?'evidence-compatible-candidates':'no-supported-match',intent,required,relatedIds:excluded.slice(0,10),caution:'This is metadata compatibility, not verified answer sufficiency or safety.'}};
}
