import { AutoModel, AutoTokenizer, env } from '@huggingface/transformers';
import { RURI, installSavedFetch } from './ruri-models.js';
const runtime = import.meta.env.DEV ? new URL('/node_modules/onnxruntime-web/dist/',self.location.origin) : new URL('runtime/',self.location.origin+import.meta.env.BASE_URL);
export async function loadEmbedding(store) {
 await installSavedFetch(env,store);env.backends.onnx.wasm.numThreads=1;
 env.backends.onnx.wasm.wasmPaths={mjs:new URL('ort-wasm-simd-threaded.asyncify.mjs',runtime).href,wasm:new URL('ort-wasm-simd-threaded.asyncify.wasm',runtime).href};
 const started=performance.now();
 const tokenizer=await AutoTokenizer.from_pretrained(RURI.tokenizerId,{revision:RURI.tokenizerRevision});
 const model=await AutoModel.from_pretrained(RURI.id,{revision:RURI.revision,device:'wasm',dtype:RURI.dtype});
 let disposed=false;
 return {loadMs:performance.now()-started,async embed(text,kind='query'){
  if(disposed)throw Error('Embedding disposed');
  const start=performance.now();const prefix=kind==='document'?RURI.documentPrefix:RURI.queryPrefix;
  const inputs=tokenizer(prefix+text,{truncation:false,padding:false});
  const tokens=inputs.input_ids.size;if(tokens>512)throw Error(`Embedding input ${tokens} exceeds 512; no silent truncation`);
  const output=await model(inputs);const hidden=output.last_hidden_state;
  if(!hidden||hidden.dims[2]!==256)throw Error('Unexpected Ruri output');
  const vector=new Array(256).fill(0),mask=inputs.attention_mask.data;let n=0;
  for(let t=0;t<hidden.dims[1];t++)if(Number(mask[t])){n++;for(let j=0;j<256;j++)vector[j]+=Number(hidden.data[t*256+j]);}
  let norm=0;for(let j=0;j<256;j++){vector[j]/=n;norm+=vector[j]**2;}norm=Math.sqrt(norm);if(!Number.isFinite(norm)||!norm)throw Error('Invalid real embedding');
  for(let j=0;j<256;j++)vector[j]/=norm;
  return {vector,tokens,elapsedMs:performance.now()-start};
 },async dispose(){disposed=true;await model.dispose();}};
}
