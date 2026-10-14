export class ExperimentChannel {
 constructor(notice=()=>{}){
  this.notice=notice;this.pending=new Map();this.counter=0;
  this.worker=new Worker(new URL('./experiment.worker.js',import.meta.url),{type:'module'});
  this.worker.onmessage=({data})=>{
   if(data.disposed){this.closed?.();return;}
   if(!data.id){notice(data);return;}
   const pending=this.pending.get(data.id);if(!pending)return;this.pending.delete(data.id);clearTimeout(pending.timer);
   data.error?pending.reject(Error(data.error)):pending.resolve(data);
  };
  this.worker.onerror=event=>{event.preventDefault();this.kill(Error(event.message||'実験Workerの実行に失敗しました。'));};
  this.worker.onmessageerror=()=>this.kill(Error('実験Workerの受信に失敗しました。'));
 }
 request(type,args={}){if(this.ended)return Promise.reject(Error('実験をリセットしました。'));return new Promise((resolve,reject)=>{const id=++this.counter;const timer=setTimeout(()=>this.kill(Error('実験処理が180秒以内に完了しませんでした。')),180000);this.pending.set(id,{resolve,reject,timer});this.worker.postMessage({type,id,...args});});}
 stop(){this.worker.postMessage({type:'stop'});}
 kill(error=Error('実験を中断しました。')){this.ended=true;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();this.worker.terminate();this.closed?.();}
 async dispose(){if(this.ended)return;await new Promise(resolve=>{const timer=setTimeout(()=>{this.kill();resolve();},5000);this.closed=()=>{clearTimeout(timer);this.worker.terminate();this.ended=true;resolve();};this.worker.postMessage({type:'dispose'});});this.kill();}
}
