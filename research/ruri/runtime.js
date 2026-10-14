import {AutoModel,AutoTokenizer,env}from'@huggingface/transformers';
import{modelFor,savedOnlyFetch}from'./models.js';
export async function load(store,key){
 const m=modelFor(key);savedOnlyFetch(env,store,key);env.backends.onnx.wasm.numThreads=1;
 const runtime=import.meta.env.DEV?new URL('/node_modules/onnxruntime-web/dist/',self.location.origin):new URL('runtime/',self.location.origin+import.meta.env.BASE_URL);
 env.backends.onnx.wasm.wasmPaths={mjs:new URL('ort-wasm-simd-threaded.asyncify.mjs',runtime).href,wasm:new URL('ort-wasm-simd-threaded.asyncify.wasm',runtime).href};
 const started=performance.now(),tokenizer=await AutoTokenizer.from_pretrained(m.tokenizerRepo,{revision:m.tokenizerRevision}),model=await AutoModel.from_pretrained(m.repo,{revision:m.revision,device:'wasm',dtype:m.dtype});let disposed=false;
 return{key,loadMs:performance.now()-started,async embed(text,kind='query'){
  if(disposed)throw Error('Embedding released');if(typeof text!=='string'||!text.trim())throw Error('Empty query');
  const started=performance.now(),prefix=kind==='raw'?'':kind==='document'?'検索文書: ':'検索クエリ: ',inputs=tokenizer(prefix+text,{padding:false,truncation:false}),tokens=inputs.input_ids.size;
  if(tokens>512)throw Error(`Input ${tokens} exceeds research budget512; no truncation`);
  const output=await model(inputs),hidden=output.last_hidden_state||output.token_embeddings;if(hidden?.dims[2]!==m.dimensions)throw Error('Wrong model dimensions '+JSON.stringify({expected:m.dimensions,outputs:Object.fromEntries(Object.entries(output).map(([k,v])=>[k,v.dims]))}));
  const vector=new Array(m.dimensions).fill(0);let count=0;for(let i=0;i<hidden.dims[1];i++)if(Number(inputs.attention_mask.data[i])){count++;for(let j=0;j<vector.length;j++)vector[j]+=Number(hidden.data[i*vector.length+j]);}
  const norm=Math.hypot(...vector);if(!count||!Number.isFinite(norm)||!norm)throw Error('Invalid real embedding');for(let j=0;j<vector.length;j++)vector[j]/=norm;
  let pooledAgreement;const pooled=output.sentence_embedding?.data;if(pooled){const norm=Math.hypot(...pooled);pooledAgreement=vector.reduce((sum,x,i)=>sum+x*Number(pooled[i])/norm,0);if(pooledAgreement<.99999)throw Error('Graph pooling disagrees with masked mean');}return{modelKey:key,vector,tokens,pooledAgreement,elapsedMs:performance.now()-started};
 },async dispose(){disposed=true;await model.dispose();}};
}
