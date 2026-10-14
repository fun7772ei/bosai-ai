import {loadEmbedding} from './embedding-runtime.js';
import {openModelStore} from './model-storage.js';
import {saveRuri} from './ruri-models.js';
let store,model,busy=false,disposed=false;
self.onmessage=async({data})=>{
 if(data.type==='dispose'){disposed=true;await model?.dispose().catch(()=>{});store?.close();self.postMessage({disposed:true});return;}
 if(busy||disposed)return;busy=true;
 try{store??=await openModelStore();const t=performance.now();let result;
  if(data.type==='save'){await saveRuri(store,progress=>!disposed&&self.postMessage({progress}));result={elapsedMs:performance.now()-t};}
  else if(data.type==='load'){model=await loadEmbedding(store);result={loadMs:model.loadMs};}
  else if(data.type==='embed'){if(!model)throw Error('Ruriは未初期化です。');result=await model.embed(data.query);}
  else throw Error('Unsupported Ruri operation');
  if(!disposed)self.postMessage({id:data.id,...result});
 }catch(e){if(!disposed)self.postMessage({id:data.id,error:e.message||e.name||'Ruri処理に失敗しました。'});}finally{busy=false;}
};
