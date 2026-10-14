import corpus from './bosai-data.json' with { type: 'json' };
import vectors from './bosai-vectors.json' with { type: 'json' };
import policy from './six-policy.json' with { type: 'json' };
import { createSearch,unsupportedLiveQuery } from './bosai-search.js';
import { semanticSearch,combineSearch } from './semantic-search.js';
import { openModelStore } from './model-storage.js';
import { auxStatus } from './aux-models.js';
const CHECKPOINT='bosai-ai-six-stage';
import { ExperimentChannel } from './experiment-client.js';
export const METHODS=Object.freeze({A:'軽量検索＋原文',B:'Embedding検索＋原文',C:'併用検索＋原文',D:'軽量検索＋LFM回答',E:'Embedding検索＋LFM回答',F:'併用検索＋LFM回答'});
export class SixController {
 constructor({beforeModels=async()=>{},notice=()=>{},changed=()=>{}}={}){
  const start=performance.now();this.light=createSearch(corpus);this.indexMs=performance.now()-start;
  try{this.previousStage=JSON.parse(localStorage.getItem(CHECKPOINT)||'null');}catch{}
  this.beforeModels=beforeModels;this.notice=notice;this.changed=changed;this.epoch=0;this.runs=[];
  if(vectors.ids.length!==corpus.length||vectors.ids.some((id,i)=>id!==corpus[i].id))throw Error('Precomputed embedding IDs do not match corpus');
 }
 get active(){return !!(this.embedding||this.llm||this.busy);}
 phase(name,details={}){try{if(name==='complete')localStorage.removeItem(CHECKPOINT);else localStorage.setItem(CHECKPOINT,JSON.stringify({phase:name,time:new Date().toISOString()}));}catch{}this.notice({phase:name,...details});this.changed();}
 async check(group){const store=await openModelStore();try{const s=await auxStatus(store,group);if(!s.complete)throw Error(`${group==='ruri'?'Embedding':'LFM350/Tokenizer'}が未保存です。モデル不要の方式Aは利用できます。`);}finally{store.close();}}
 async release(kind){const channel=this[kind];if(!channel)return 0;this[kind]=null;const start=performance.now();this.phase(kind+'-releasing');await channel.dispose();const ms=performance.now()-start;this.phase(kind+'-released',{elapsedMs:ms});return ms;}
 async acquire(kind,dual,timings){
  const acquiredAt=performance.now();await this.beforeModels();if(!dual)timings.releaseMs=(timings.releaseMs||0)+await this.release(kind==='embedding'?'llm':'embedding');
  if(this[kind]){timings[kind+'AcquireMs']=performance.now()-acquiredAt;timings[kind+'Warm']=true;return;}
  await this.check(kind==='embedding'?'ruri':'lfm');
  const channel=new ExperimentChannel(data=>this.notice(data));this[kind]=channel;this.phase(kind+'-loading');
  try{const ready=await channel.request(kind==='embedding'?'load-embedding':'load-llm');timings[kind+'LoadMs']=ready.loadMs;timings[kind+'Settings']=ready.settings;timings[kind+'AcquireMs']=performance.now()-acquiredAt;timings[kind+'Warm']=false;this.phase(kind+'-ready',ready);}catch(e){await this.release(kind);throw e;}
 }
 async download(group){if(this.busy)throw Error('別の実験処理中です。');this.busy=true;this.changed();let channel;try{await this.beforeModels();await this.release('embedding');await this.release('llm');channel=new ExperimentChannel(data=>this.notice(data));this.transfer=channel;await channel.request('download',{group});}finally{await channel?.dispose();this.transfer=null;this.busy=false;this.phase('complete');this.changed();}}
 stop(){if(this.transfer){this.transfer.kill(Error('停止しました。'));this.transfer=null;}else if(this.llm)this.llm.stop();else if(this.embedding){this.embedding.kill(Error('停止しました。'));this.embedding=null;}this.notice({phase:'stop-requested'});}
 async reset(){this.epoch++;await Promise.all([this.release('embedding'),this.release('llm'),this.release('transfer')]);this.busy=false;try{localStorage.removeItem(CHECKPOINT);}catch{}this.changed();}
 async run(query,method,{oracleIds,dual=false}={}){
  if(this.busy)throw Error('一度に1問ずつ実行してください。');if(!METHODS[method]&&method!=='Oracle')throw Error('Unknown experiment method');
  if(!query.trim()||query.length>200)throw Error('質問は1〜200文字です。');
  const epoch=this.epoch,start=performance.now(),timings={indexMs:this.indexMs};this.busy=true;this.changed();
  const run={query,method,dual,policy,startedAt:new Date().toISOString(),timings,resultIds:[],evidenceIds:[],status:'running'};
  try{
   let results=[];
   if(method==='A'){timings.releaseMs=await this.release('embedding')+await this.release('llm');}
   if(method==='Oracle'){results=(oracleIds||[]).map(id=>({entry:corpus.find(e=>e.id===id),score:1}));if(results.some(r=>!r.entry))throw Error('Unknown Oracle entry');}
   else if(!unsupportedLiveQuery(query)){
    let semantic=[],light=[];const retrievalStart=performance.now();
    if(['A','C','D','F'].includes(method)){const t=performance.now();light=this.light(query,policy.candidatePool);timings.lightMs=performance.now()-t;}
    if(['B','C','E','F'].includes(method)){
     await this.acquire('embedding',dual,timings);this.phase('embedding-query');const q=await this.embedding.request('embed',{text:query});timings.embeddingMs=q.elapsedMs;timings.embeddingTokens=q.tokens;
     const t=performance.now();semantic=semanticSearch(corpus,vectors.vectors,q.vector,query,{threshold:policy.semanticThreshold,limit:policy.candidatePool});timings.vectorSearchMs=performance.now()-t;
    }
    const t=performance.now();results=['C','F'].includes(method)?combineSearch(light,semantic,{method:policy.fusion,weight:policy.lightWeight,limit:5}):(['B','E'].includes(method)?semantic:light).slice(0,5);timings.fusionMs=performance.now()-t;timings.retrievalMs=performance.now()-retrievalStart;
    run.lightIds=light.map(r=>r.entry.id);run.semanticIds=semantic.map(r=>r.entry.id);
   }
   run.resultIds=results.map(r=>r.entry.id);this.phase('retrieved',{resultIds:run.resultIds,timings});timings.firstResultsMs=performance.now()-start;
   const switchStarted=performance.now();
   if(['E','F'].includes(method)&&!dual)timings.releaseMs=(timings.releaseMs||0)+await this.release('embedding');
   if(epoch!==this.epoch)throw Error('リセットにより中断しました。');
   if(['D','E','F','Oracle'].includes(method)&&results.length){
    await this.acquire('llm',dual,timings);timings.switchToLlmMs=performance.now()-switchStarted;this.phase('llm-answer');
    // Top-1 full evidence, never snippets. Oracle may require more than one full entry.
    const evidence=method==='Oracle'?results.map(r=>r.entry):[results[0].entry];run.evidenceIds=evidence.map(e=>e.id);
    const answer=await this.llm.request('answer',{query,entries:evidence});run.answer=answer.answer;timings.answerMs=answer.elapsedMs;
   }
   if(epoch!==this.epoch)throw Error('リセットにより中断しました。');
   run.status=!results.length?'no-match':run.answer?(run.answer.usable?'generated':'original-fallback'):'original';
  }catch(error){run.status=/停止|中断|リセット/.test(error.message)?'interrupted':'unavailable';run.error=error.message;}
  finally{timings.totalMs=performance.now()-start;this.busy=false;this.changed();}
  this.runs.push(run);if(this.runs.length>500)this.runs.shift();this.phase('complete',{run});return run;
 }
}
