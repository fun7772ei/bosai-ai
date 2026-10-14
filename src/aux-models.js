import assets from './aux-assets.json' with { type: 'json' };
import { getModel, modelFileUrl } from './config.js';
export const AUX_ASSETS = assets.map(({ localFile, ...asset }) => Object.freeze(asset));
export const RURI = Object.freeze({ id: 'onnx-community/ruri-v3-30m-ONNX', revision: '1b41a27f31213fc55a9c4653c067770e39406408', tokenizerId: 'cl-nagoya/ruri-v3-30m', tokenizerRevision: '24899e5de370b56d179604a007c0d727bf144504', dtype: 'q8', dimensions: 256, license: 'Apache-2.0', queryPrefix: '検索クエリ: ', documentPrefix: '検索文書: ' });
export function auxAssets(group) {
  if (group === 'ruri') return AUX_ASSETS.filter(asset => asset.group === group);
  if (group !== 'lfm') throw Error('Unknown auxiliary group');
  const model = getModel('lfm2-cpu');
  return [...AUX_ASSETS.filter(asset => asset.group === 'lfm-tokenizer'), { url: modelFileUrl(model.file, model.key), bytes: model.weightBytes.q4_k_m, sha256: model.sha256, file: model.file, group: 'lfm' }];
}
export async function auxStatus(store, group) { const files = await Promise.all(auxAssets(group).map(async asset => ({file:asset.file, present: !!(await store.match(asset.url))}))); return { group, complete: files.every(file => file.present), files }; }
export async function saveAux(store, group, progress = () => {}, fetcher = fetch) {
 for (const asset of auxAssets(group)) {
  const existing = await store.match(asset.url); if (existing && Number(existing.headers.get('content-length')) === asset.bytes) { progress({file:asset.file,reused:true});continue; }
  progress({file:asset.file,stage:'download'});
  const response=await fetcher(asset.url);if(!response.ok||!response.body)throw Error(`${asset.file}: HTTP ${response.status}`);
  // The store consumes the response stream in 4 MiB transactions. Fixed decoded length
  // prevents incomplete files from being published, including compressed transfers.
  await store.put(asset.url,new Response(response.body,{headers:{'content-length':String(asset.bytes)}}));
  progress({file:asset.file,stage:'saved'});
 }
}
export async function installSavedFetch(env, store) {
 env.allowLocalModels = false; env.useBrowserCache = false; env.useCustomCache = true;
 const canonical = value => {
  const url = value instanceof Request ? value.url : String(value);
  for (const asset of AUX_ASSETS) if(url === `https://huggingface.co/${asset.repo}/resolve/main/${asset.file}`) return asset.url;
  return url;
 };
 env.customCache={match:key=>store.match(canonical(key)),put:async()=>{throw Error('Inference cannot download model assets');}};
 env.fetch=async(url, options)=>{
  const key=canonical(url);if(key.startsWith('https://huggingface.co/')){
   const saved=await store.match(key);if(saved)return options?.method==='HEAD'?new Response(null,{headers:saved.headers}):saved;
   // Optional tokenizer discovery is allowed to report absent, never to go online.
   return new Response(null,{status:404});
  }
  return fetch(url,options);
 };
}
