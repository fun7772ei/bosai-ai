import test from'node:test';import assert from'node:assert/strict';import{indexedDB,IDBKeyRange}from'fake-indexeddb';import{openChunkStore}from'../src/chunk-store.js';import{saveAux,auxAssets}from'../src/aux-models.js';
globalThis.indexedDB=indexedDB;globalThis.IDBKeyRange=IDBKeyRange;
test('auxiliary short/failed streams never publish completion or erase existing GGUF saves',async()=>{
 const store=await openChunkStore('aux-failure-'+Date.now(),16);
 const oldUrl='https://huggingface.co/existing/model.gguf';await store.put(oldUrl,new Response(new Uint8Array([1,2,3]),{headers:{'content-length':'3'}}));
 await assert.rejects(saveAux(store,'ruri',()=>{},async()=>new Response(new Uint8Array([1]))),/size|length|サイズ|長さ/i);
 assert.equal(await store.match(auxAssets('ruri')[0].url),undefined);assert.deepEqual(new Uint8Array(await(await store.match(oldUrl)).arrayBuffer()),new Uint8Array([1,2,3]));store.close();
});
