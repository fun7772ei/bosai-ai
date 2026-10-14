import { unsupportedLiveQuery } from './bosai-search.js';
export const documentText = entry => `${entry.title}\n${entry.summary}\n${entry.steps.join('\n')}\n注意:${entry.warning}\nキーワード:${entry.keywords.join('、')}`;
export function cosine(a,b){if(a.length!==b.length)throw Error('Embedding dimension mismatch');let score=0;for(let i=0;i<a.length;i++)score+=a[i]*b[i];return score;}
export function semanticSearch(corpus,vectors,vector,query,{threshold=0,limit=5}={}){
 if(!query.trim()||unsupportedLiveQuery(query))return [];
 return corpus.map((entry,i)=>({entry,score:cosine(vector,vectors[i])})).filter(x=>x.score>=threshold).sort((a,b)=>b.score-a.score||a.entry.id.localeCompare(b.entry.id)).slice(0,limit);
}
export function combineSearch(light,semantic,{method='rrf',weight=0.5,limit=5}={}){
 const map=new Map();
 for(const [rows,w]of [[light,weight],[semantic,1-weight]]){
  const max=Math.max(...rows.map(row=>row.score)),min=Math.min(...rows.map(row=>row.score));
  rows.forEach((item,i)=>{const prior=map.get(item.entry.id)||{entry:item.entry,score:0};prior.score+=w*(method==='rrf'?1/(10+i+1):(max===min?1:(item.score-min)/(max-min)));map.set(item.entry.id,prior);});
 }
 return [...map.values()].sort((a,b)=>b.score-a.score||a.entry.id.localeCompare(b.entry.id)).slice(0,limit);
}
