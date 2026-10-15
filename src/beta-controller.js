import {retrieve} from './beta-search.js';
import {assessRequestScope} from './request-scope.js';
import {conditions,factsIn,topicsIn,focusFor} from './request-facts.js';
import {evaluateEvidence} from './conversation-applicability.js';
import {RuriChannel} from './ruri-client.js';
import {openModelStore} from './model-storage.js';
import {ruriStatus} from './ruri-models.js';
export class BetaController{
 constructor({changed=()=>{},channel=notice=>new RuriChannel(notice),status=async()=>{const s=await openModelStore();try{return await ruriStatus(s);}finally{s.close();}}}={}){this.changed=changed;this.makeChannel=channel;this.getStatus=status;this.epoch=0;this.busy=false;this.ready=false;this.state='未読み込み';this.runs=[];}
 phase(text){this.state=text;try{localStorage.setItem('bosai-beta-stage',text);}catch{}this.changed();}
 valid(epoch){if(epoch!==this.epoch)throw Error('停止またはリセットにより中断しました。');}
 async inspect(){try{this.saved=await this.getStatus();this.storageError=null;}catch(e){this.saved={complete:false,files:[]};this.storageError=e.message;}this.changed();return this.saved;}
 async ensure(epoch,timings){if(this.ready&&this.channel){timings.warm=true;return;}const s=await this.getStatus();this.valid(epoch);if(!s.complete)throw Error('モデル未保存');const channel=this.makeChannel(p=>{if(this.channel===channel)this.phase(p.progress?`保存中: ${p.progress.file} ${p.progress.stage||'再利用'}`:'処理中');});this.channel=channel;this.phase('Ruriを読み込み中…');try{const r=await channel.request('load');this.valid(epoch);this.ready=true;timings.loadMs=r.loadMs;timings.warm=false;}catch(e){if(this.channel===channel){this.channel=null;this.ready=false;}channel.kill();throw e;}}
 async load(){return this.action(async epoch=>{const timings={};await this.ensure(epoch,timings);this.phase('Ruri利用可能');return timings;});}
 async save(){return this.action(async epoch=>{const previous=this.channel;this.channel=null;this.ready=false;await previous?.dispose();this.valid(epoch);const channel=this.makeChannel(p=>{if(this.channel===channel&&p.progress)this.phase(`保存中: ${p.progress.file} ${p.progress.stage||'再利用'}`);});this.channel=channel;this.phase('Ruriを保存中…');try{await channel.request('save');this.valid(epoch);this.phase('保存完了。次の検索で読み込みます。');}finally{await channel.dispose();if(this.channel===channel)this.channel=null;}await this.inspect();});}
 async action(fn){if(this.busy)throw Error('別の処理中です。');const epoch=++this.epoch;this.busy=true;this.changed();try{return await fn(epoch);}finally{if(epoch===this.epoch){this.busy=false;this.changed();}}}
 stop(){++this.epoch;const c=this.channel;this.channel=null;this.ready=false;c?.kill();this.busy=false;this.phase('停止しました。軽量検索は利用できます。保存は維持しています。');}
 async reset(){const c=this.channel,wasBusy=this.busy,epoch=++this.epoch;this.channel=null;this.ready=false;this.busy=true;this.phase('モデルを解放中…');try{if(wasBusy)c?.kill();else await c?.dispose();}finally{if(epoch===this.epoch){this.busy=false;this.phase('モデルを解放しました。保存データは維持しています。');}}}
 async search(query,mode='hybrid',request={}){
  query=query.trim();if(!query||query.length>200)throw Error('質問は1〜200文字で入力してください。');if(!['hybrid','ruri','light'].includes(mode))throw Error('検索モードが不正です。');
  return this.action(async epoch=>{const t=performance.now(),timings={};const scope=request.scope||assessRequestScope(query);let vector,actual='light',fallback=null;
   if(mode!=='light'&&scope.kind==='related')try{await this.ensure(epoch,timings);this.valid(epoch);this.phase('質問の意味を検索中…');const r=await this.channel.request('embed',{query});this.valid(epoch);vector=r.vector;timings.embeddingMs=r.elapsedMs;timings.tokens=r.tokens;actual=mode;}catch(e){this.valid(epoch);fallback=e.message;const c=this.channel;this.channel=null;this.ready=false;c?.kill();}
   this.valid(epoch);const begin=performance.now(),{results,scope:assessed}=retrieve(query,actual,vector,scope);timings.retrievalMs=performance.now()-begin;timings.totalMs=performance.now()-t;
   const run={query,requested:mode,actual,fallback,scope:assessed,resultIds:results.map(r=>r.entry.id),scores:results.map(r=>r.score),timings,ready:this.ready,time:new Date().toISOString()};// Conversation already supplies a typed request and evaluates its evidence once.
   // Stateless dictionary searches use the same facts/evaluator, without inheriting chat state.
   let evaluated={...run,results};
   if(!request.scope){const positive=conditions(query).positive,facts=factsIn(positive),topics=topicsIn(positive);evaluated=evaluateEvidence(evaluated,focusFor(topics,facts),facts,topics);}
   const visible={...run,resultIds:evaluated.results.map(r=>r.entry.id),scores:evaluated.results.map(r=>r.score),evidence:evaluated.evidence,applicability:evaluated.applicability};
   timings.totalMs=performance.now()-t;
   this.runs.push(visible);if(this.runs.length>100)this.runs.shift();this.phase(fallback?'軽量検索で表示しています。':'検索完了');return{...visible,results:evaluated.results};});
 }
}
