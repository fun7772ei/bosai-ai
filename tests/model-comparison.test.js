import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { MODELS, getModel, modelFiles, modelDtypes, modelFileUrl, pinnedModelUrl } from '../src/config.js';
import { downloadModel } from '../src/download.js';
import { openChunkStore } from '../src/chunk-store.js';
import { openModelStore, modelStorageStatus } from '../src/model-storage.js';
import { readSelection, readDtype, saveSelection, MODEL_KEY, LEGACY_DTYPE_KEY } from '../src/model-preferences.js';

test('new models require external weights and pin metadata lookup to their own revision', () => {
  for (const model of MODELS) {
    const root = `https://huggingface.co/${model.id}/resolve/`;
    assert.equal(pinnedModelUrl(new Request(root + 'main/tokenizer_config.json')), root + model.revision + '/tokenizer_config.json');
    assert.equal(pinnedModelUrl(root + 'other-revision/config.json'), root + 'other-revision/config.json');
    for (const dtype of modelDtypes(model.key)) {
      const files = modelFiles(dtype, model.key);
      assert.equal(files.length, model.engine === 'wllama-cpu' ? 1 : model.key === 'qwen3' ? 5 : 6);
      assert.equal(files.includes(`onnx/model_${dtype}.onnx_data`), !!model.externalData);
    }
  }
  assert.throws(() => getModel('unknown'), /Unsupported model/);
  assert.throws(() => modelFiles('fp32', 'lfm2'), /Unsupported dtype/);
});

for (const modelKey of ['lfm2', 'gemma3']) {
  test(`${modelKey} graph without external weights is incomplete and does not borrow Qwen files`, async () => {
    const urls = new Set([
      ...modelFiles('q4f16', 'qwen3').map(file => modelFileUrl(file, 'qwen3')),
      ...modelFiles('q4f16', modelKey).filter(file => !file.endsWith('_data')).map(file => modelFileUrl(file, modelKey)),
    ]);
    const cache = { match: async url => urls.has(url) ? new Response('fixture') : undefined };
    const status = await modelStorageStatus(cache, 'q4f16', modelKey);
    assert.equal(status.complete, false);
    assert.equal(status.required, 6);
    assert.deepEqual(status.missing, ['onnx/model_q4f16.onnx_data']);
    assert.equal((await modelStorageStatus(cache, 'q4', modelKey)).present.length, 4);
  });
}

test('interrupted external-weight download preserves other files and resumes by fetching only the missing file', async () => {
  const store = await openChunkStore('comparison-external-download', 4);
  let fetched = [], completed = [];
  const fetcher = async url => {
    fetched.push(url);
    if (url.endsWith('_data')) throw new Error('network interrupted');
    return new Response('fixture');
  };
  try {
    await assert.rejects(downloadModel(store, 'q4f16', p => completed.push(p), fetcher, 'lfm2'), /network interrupted/);
    assert.equal(completed.filter(p => p.status === 'done').length, 5);
    assert.equal((await modelStorageStatus(store, 'q4f16', 'lfm2')).complete, false);
    fetched = [];
    await downloadModel(store, 'q4f16', () => {}, async url => { fetched.push(url); return new Response('external-weights'); }, 'lfm2');
    assert.deepEqual(fetched, [modelFileUrl('onnx/model_q4f16.onnx_data', 'lfm2')]);
    store.close();
    const reopened = await openChunkStore('comparison-external-download', 4);
    assert.equal((await modelStorageStatus(reopened, 'q4f16', 'lfm2')).complete, true);
    assert.equal(await (await reopened.match(fetched[0])).text(), 'external-weights');
    reopened.close();
  } finally { store.close(); }
});

test('all four saves coexist and selected-model deletion preserves the other models', async () => {
  const original = globalThis.caches;
  const legacy = new Map([
    [modelFileUrl('legacy-extra.json', 'qwen3'), new Response('qwen-legacy')],
    [modelFileUrl('legacy-extra.json', 'gemma3'), new Response('gemma-legacy')],
  ]);
  globalThis.caches = { open: async () => ({
    match: async url => legacy.get(url)?.clone(), keys: async () => [...legacy.keys()].map(url => new Request(url)), delete: async request => legacy.delete(request.url),
  }), delete: () => { throw new Error('Must not delete the shared legacy cache'); } };
  let store;
  try {
    store = await openModelStore();
    for (const model of MODELS) await downloadModel(store, modelDtypes(model.key)[0], () => {}, async () => new Response(`fixture-${model.key}`), model.key);
    store.close(); store = await openModelStore();
    for (const model of MODELS) assert.equal((await modelStorageStatus(store, modelDtypes(model.key)[0], model.key)).complete, true);
    await store.clear('gemma3');
    assert.equal((await modelStorageStatus(store, 'q4f16', 'gemma3')).complete, false);
    assert.equal((await modelStorageStatus(store, 'q4f16', 'lfm2')).complete, true);
    assert.equal((await modelStorageStatus(store, 'q4f16', 'qwen3')).complete, true);
    assert.equal((await modelStorageStatus(store, 'q4_k_m', 'lfm2-cpu')).complete, true);
    await store.clear('lfm2-cpu');
    assert.equal((await modelStorageStatus(store, 'q4_k_m', 'lfm2-cpu')).complete, false);
    assert.equal((await modelStorageStatus(store, 'q4f16', 'lfm2')).complete, true);
    assert.equal(legacy.has(modelFileUrl('legacy-extra.json', 'gemma3')), false);
    assert.equal(legacy.has(modelFileUrl('legacy-extra.json', 'qwen3')), true);
  } finally { store?.close(); globalThis.caches = original; }
});

test('old Qwen preference migrates without leaking its dtype to Gemma/LFM', () => {
  const values = new Map([[LEGACY_DTYPE_KEY, 'q4']]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.deepEqual(readSelection(storage), { modelKey: 'qwen3', dtype: 'q4' });
  assert.equal(readDtype(storage, 'lfm2'), 'q4f16');
  saveSelection(storage, { modelKey: 'lfm2', dtype: 'q4f16' });
  assert.deepEqual(readSelection(storage), { modelKey: 'lfm2', dtype: 'q4f16' });
  saveSelection(storage, { modelKey: 'gemma3', dtype: 'q4' });
  assert.equal(readDtype(storage, 'lfm2'), 'q4f16');
  assert.equal(readDtype(storage, 'gemma3'), 'q4');
  assert.equal(readDtype(storage, 'qwen3'), 'q4');
  assert.equal(values.get(LEGACY_DTYPE_KEY), 'q4');
  values.set(MODEL_KEY, 'removed-model');
  assert.deepEqual(readSelection(storage), { modelKey: 'qwen3', dtype: 'q4' });
});

test('fresh installations prefer LFM while an explicit saved model is preserved', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.deepEqual(readSelection(storage), { modelKey: 'lfm2', dtype: 'q4f16' });
  saveSelection(storage, { modelKey: 'gemma3', dtype: 'q4' });
  assert.deepEqual(readSelection(storage), { modelKey: 'gemma3', dtype: 'q4' });
});

test('CPU selection has its own GGUF format and preserves WebGPU preferences', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  saveSelection(storage, { modelKey: 'lfm2', dtype: 'q4f16' });
  saveSelection(storage, { modelKey: 'lfm2-cpu', dtype: 'q4_k_m' });
  assert.deepEqual(readSelection(storage), { modelKey: 'lfm2-cpu', dtype: 'q4_k_m' });
  assert.equal(readDtype(storage, 'lfm2'), 'q4f16');
  assert.throws(() => modelFiles('q4f16', 'lfm2-cpu'), /Unsupported dtype/);
  assert.deepEqual(modelFiles('q4_k_m', 'lfm2-cpu'), ['LFM2.5-350M-Q4_K_M.gguf']);
});
