import{improvedRetrieve}from'./improved.js';
import{StudyChannel}from'./channel.js';import{status,modelFor}from'./models.js';import{openModelStore}from'../../src/model-storage.js';import{baselineRetrieve,checkIndex}from'./retrieval.js';
import v30 from'./vectors-30m.json'with{type:'json'};import v70 from'./vectors-70m.json'with{type:'json'};import v130 from'./vectors-130m.json'with{type:'json'};
const indexes={'30m':v30,'70m':v70,'130m':v130};
export class StudyController{
 constructor({changed=()=>{},channel=notice=>new StudyChannel(notice),inspect=async key=>{const store=await openModelStore();try{return await status(store,key);}finally{store.close();}},retrieve=improvedRetrieve}={}){this.changed=changed;this.makeChannel=channel;this.inspectModel=inspect;this.retrieve=retrieve;this.selected='30m';this.epoch=0;this.busy=false;this.state='未読み込み';this.runs=[];}
 phase(s){this.state=s;this.changed();}
 valid(epoch){if(epoch!==this.epoch)throw Error('停止または切替により中断しました');}
 async inspect(){try{this.saved=await this.inspectModel(this.selected);}catch(e){this.saved={complete:false,error:e.message,files:[]};}this.changed();return this.saved;}
 async release(){const c=this.channel||this.releasing;this.channel=null;this.readyKey=null;if(!c)return;this.releasing=c;try{await c.dispose();}finally{if(this.releasing===c)this.releasing=null;}}
 async action(fn){if(this.busy)throw Error('処理中です');const epoch=++this.epoch;this.busy=true;this.changed();try{return await fn(epoch);}finally{if(this.epoch===epoch){this.busy=false;this.changed();}}}
 async select(key){modelFor(key);if(key===this.selected)return;return this.action(async epoch=>{await this.release();this.valid(epoch);this.selected=key;this.phase('モデルを切り替えました。保存は保持しています');await this.inspect();});}
 async ensure(key,epoch){if(this.readyKey===key&&this.channel)return{warm:true};const saved=await this.inspectModel(key);this.valid(epoch);if(!saved.complete)throw Error(key+'は未保存');checkIndex(indexes[key],key);await this.release();this.valid(epoch);const c=this.makeChannel(p=>{if(this.channel===c&&p.progress)this.phase(JSON.stringify(p.progress));});this.channel=c;this.phase(key+'を読み込み中');try{const r=await c.request('load',{modelKey:key});this.valid(epoch);this.readyKey=key;return{warm:false,loadMs:r.loadMs};}catch(e){if(this.channel===c){this.channel=null;this.readyKey=null;}c.kill();throw e;}}
 async load(){return this.action(async epoch=>{const t=await this.ensure(this.selected,epoch);this.phase('読み込み完了');return t;});}
 async save(){return this.action(async epoch=>{await this.release();this.valid(epoch);const c=this.makeChannel(p=>{if(this.channel===c&&p.progress)this.phase(JSON.stringify(p.progress));});this.channel=c;try{await c.request('save',{modelKey:this.selected});this.valid(epoch);this.phase('保存完了');}finally{await c.dispose();if(this.channel===c)this.channel=null;}await this.inspect();});}
 stop(){++this.epoch;this.channel?.kill();this.releasing?.kill();this.releasing=null;this.channel=null;this.readyKey=null;this.busy=false;this.phase('停止しました。保存は保持しています');}
 async reset(){if(this.busy){this.stop();return;}return this.action(async()=>{await this.release();this.phase('解放しました。保存は保持しています');});}
 async search(query,mode='hybrid'){
  if(!query.trim()||query.length>1000)throw Error('1〜1000文字で入力してください');if(!['light','ruri','hybrid'].includes(mode))throw Error('Unknown search mode');
  return this.action(async epoch=>{const start=performance.now(),requested=this.selected;let embedding,actualModel=null,fallback=null,timings={};
   // Scope assessment can avoid loading a model for known unsupported/clarification questions.
   const preliminary=this.retrieve(query,'light',null,null);
   if(mode!=='light'&&preliminary.scope.kind==='related'){
    const attempt=async key=>{const t=await this.ensure(key,epoch);this.valid(epoch);this.phase(key+'で検索中');const r=await this.channel.request('embed',{text:query});this.valid(epoch);if(r.modelKey!==key)throw Error('Wrong query model');embedding=r;actualModel=key;Object.assign(timings,t,{embeddingMs:r.elapsedMs,tokens:r.tokens});};
    try{await attempt(requested);}catch(e){this.valid(epoch);fallback=e.message;if(this.readyKey===requested){this.channel?.kill();this.channel=null;this.readyKey=null;}if(requested!=='30m')try{await attempt('30m');}catch(e2){this.valid(epoch);fallback+=' / '+e2.message;this.channel?.kill();this.channel=null;this.readyKey=null;}}
   }
   this.valid(epoch);const t=performance.now(),actual=embedding?mode:'light',r=this.retrieve(query,actual,embedding,embedding?indexes[actualModel]:null);timings.searchMs=performance.now()-t;timings.totalMs=performance.now()-start;
   const run={query,requestedModel:requested,actualModel,requestedMode:mode,actualMode:actual,fallback,scope:r.scope,answerability:r.answerability,ids:r.results.map(x=>x.entry.id),scores:r.results.map(x=>x.score),timings,worker:!!this.channel,readyKey:this.readyKey,time:new Date().toISOString()};this.runs.push(run);this.phase('検索完了');return run;});
 }
}
