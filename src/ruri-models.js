import manifest from './aux-assets.json' with {type:'json'};
export const RURI_ASSETS=Object.freeze(manifest.filter(a=>a.group==='ruri'));
export const RURI=Object.freeze({id:'onnx-community/ruri-v3-30m-ONNX',revision:'1b41a27f31213fc55a9c4653c067770e39406408',tokenizerId:'cl-nagoya/ruri-v3-30m',tokenizerRevision:'24899e5de370b56d179604a007c0d727bf144504',dtype:'q8',dimensions:256,license:'Apache-2.0',queryPrefix:'検索クエリ: ',documentPrefix:'検索文書: '});
export async function ruriStatus(store){const files=await Promise.all(RURI_ASSETS.map(async a=>({file:a.file,present:!!(await store.match(a.url))})));return{complete:files.every(f=>f.present),files};}
export async function saveRuri(store,progress=()=>{},fetcher=fetch){for(const a of RURI_ASSETS){const old=await store.match(a.url);if(old&&Number(old.headers.get('content-length'))===a.bytes){progress({file:a.file,reused:true});continue;}progress({file:a.file,stage:'download'});const res=await fetcher(a.url);if(!res.ok||!res.body)throw Error(`${a.file}: HTTP ${res.status}`);await store.put(a.url,new Response(res.body,{headers:{'content-length':String(a.bytes)}}));progress({file:a.file,stage:'saved'});}}
export async function installSavedFetch(env,store){
 env.allowLocalModels=false;env.useBrowserCache=false;env.useCustomCache=true;
 const canonical=value=>{const url=value instanceof Request?value.url:String(value);return RURI_ASSETS.find(a=>url===`https://huggingface.co/${a.repo}/resolve/main/${a.file}`)?.url||url;};
 env.customCache={match:key=>store.match(canonical(key)),put:async()=>{}}; // shell owns runtime caching; model writes are explicit saveRuri only
 env.fetch=async(url,options)=>{const key=canonical(url);if(key.startsWith('https://huggingface.co/')){const saved=await store.match(key);return saved?(options?.method==='HEAD'?new Response(null,{headers:saved.headers}):saved):new Response(null,{status:404});}return fetch(url,options);};
}
