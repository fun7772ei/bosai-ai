import test from 'node:test';
import assert from 'node:assert/strict';
import { CpuSession, CPU_LOAD_PARAMS, cpuRequest } from '../src/cpu-session.js';

function engine() {
  return {
    loadModel: async () => {}, getNumThreads: () => 1, isMultithread: () => false,
    getLoadedContextInfo: () => ({ n_ctx: 512, n_batch: 64 }),
    exit: async () => {}, createChatCompletion: async () => {},
  };
}
const blob = new Blob(['GGUFfixture']);
test('CPU load bounds threads/context and rejects invalid GGUF before native initialization', async () => {
  const fake = engine(); let calls = 0;
  fake.loadModel = async (blobs, params) => { calls++; assert.equal(blobs[0], blob); assert.equal(params, CPU_LOAD_PARAMS); assert.equal(params.n_gpu_layers, 0); assert.equal(params.n_parallel, 1); };
  const session = new CpuSession(() => fake, blob.size);
  await assert.rejects(session.load(new Blob(['invalid'])), /保存サイズ/);
  await assert.rejects(session.load(new Blob(['BAD!fixture'])), /GGUF形式/);
  assert.equal(calls, 0);
  const settings = await session.load(blob);
  assert.equal(settings.contextTokens, 512);
  assert.equal(settings.threads, 1);
  await session.dispose();
});
test('different prompts do not accumulate history or reuse prompt cache; metrics use runtime counts', async () => {
  const fake = engine(), prompts = [];
  fake.createChatCompletion = async options => {
    assert.equal(options.messages.length, 2);
    assert.equal(options.cache_prompt, false);
    prompts.push(options.messages[1].content);
    options.onData({ choices: [{ delta: { content: '答え' } }], timings: { predicted_n: 2 } });
    options.onData({ choices: [], usage: { completion_tokens: 3 } });
  };
  const session = new CpuSession(() => fake, blob.size);
  await session.load(blob);
  for (const prompt of ['一つ目', '二つ目', '三つ目']) {
    const result = await session.generate(prompt, 32, () => {});
    assert.equal(result.tokens, 3); assert.equal(result.tokensKnown, true); assert.equal(result.text, '答え');
  }
  assert.deepEqual(prompts, ['一つ目', '二つ目', '三つ目']);
  await session.dispose();
});
test('limits are rejected before inference and stop allows a new request', async () => {
  assert.throws(() => cpuRequest('a'.repeat(201), 32), /200文字/);
  assert.throws(() => cpuRequest('入力', 128), /64トークン/);
  const fake = engine(); let started;
  const began = new Promise(resolve => { started = resolve; });
  fake.createChatCompletion = options => new Promise((resolve, reject) => {
    started(); options.abortSignal.addEventListener('abort', () => reject(new Error('cancelled')));
  });
  const session = new CpuSession(() => fake, blob.size);
  await session.load(blob);
  const running = session.generate('入力', 32, () => {});
  await began;
  await assert.rejects(session.generate('重複', 32, () => {}), /1件/);
  session.stop();
  assert.equal((await running).stopped, true);
  fake.createChatCompletion = async () => {};
  assert.equal((await session.generate('新しい入力', 32, () => {})).stopped, false);
  await session.dispose();
});
test('failed native load frees its worker and dispose terminates even while generation is pending', async () => {
  const fake = engine(); let exited = 0;
  fake.exit = async () => { exited++; };
  fake.loadModel = async () => { throw new Error('native load failed'); };
  const failed = new CpuSession(() => fake, blob.size);
  await assert.rejects(failed.load(blob), /native load failed/);
  assert.equal(exited, 1);
  fake.loadModel = async () => {};
  fake.createChatCompletion = async () => new Promise(() => {});
  const session = new CpuSession(() => fake, blob.size);
  await session.load(blob);
  session.generate('入力', 32, () => {});
  await session.dispose();
  assert.equal(exited, 2);
});

// A final SSE event may have no content. Do not infer truncation from token count.
test('native finish reason distinguishes token limit from natural completion', async () => {
  const fake = engine();
  const session = new CpuSession(() => fake, blob.size);
  await session.load(blob);
  for (const finishReason of ['length', 'stop']) {
    fake.createChatCompletion = async options => {
      options.onData({ choices: [{ delta: { content: '出力' }, finish_reason: null }], timings: { predicted_n: 32 } });
      options.onData({ choices: [{ delta: {}, finish_reason: finishReason }] });
      options.onData({ choices: [], usage: { completion_tokens: 32 } });
    };
    const result = await session.generate('入力', 32, () => {});
    assert.equal(result.text, '出力');
    assert.equal(result.tokens, 32);
    assert.equal(result.finishReason, finishReason);
    assert.equal(result.outputLimitReached, finishReason === 'length');
  }
  await session.dispose();
});

test('Qwen CPU keeps Jinja thinking disabled at load and each request without changing LFM defaults', async () => {
  const fake = engine(); let completions = 0;
  fake.loadModel = async (blobs, params) => {
    assert.equal(params.jinja, true);
    assert.deepEqual(params.default_template_kwargs, { enable_thinking: false });
    assert.equal(params.n_ctx, 512); assert.equal(params.n_threads, 1); assert.equal(params.reasoning, false);
  };
  fake.createChatCompletion = async options => {
    completions++;
    assert.deepEqual(options.chat_template_kwargs, { enable_thinking: false });
    assert.equal(options.temperature, 0); assert.equal(options.cache_prompt, false);
  };
  const session = new CpuSession(() => fake, blob.size, { noThinking: true });
  await session.load(blob);
  await session.generate('最初の入力', 32, () => {});
  await session.generate('別の入力', 64, () => {});
  assert.equal(completions, 2);
  assert.equal(cpuRequest('LFMの入力', 32).chat_template_kwargs, undefined);
  assert.equal(CPU_LOAD_PARAMS.jinja, undefined);
  await session.dispose();
});

test('search selection shares the bounded CPU session but keeps user generation limits and cache isolation', async()=>{
 const fake=engine();let optionsSeen;
 fake.createChatCompletion=async options=>{optionsSeen=options;options.onData({choices:[{delta:{content:'2'},finish_reason:'stop'}],usage:{prompt_tokens:180,completion_tokens:2}});};
 const session=new CpuSession(()=>fake,blob.size);await session.load(blob);
 const candidates=[{entry:{title:'候補1'}},{entry:{title:'候補2'}}];
 const result=await session.selectSearch('自然な質問',candidates);
 assert.equal(result.text,'2');assert.equal(result.promptTokens,180);assert.equal(optionsSeen.max_tokens,8);assert.equal(optionsSeen.temperature,0);assert.equal(optionsSeen.cache_prompt,false);assert.equal(optionsSeen.messages.length,2);
 await assert.rejects(session.generate('x'.repeat(201),32),/200/);
 await session.generate('通常の入力',32,()=>{});assert.equal(optionsSeen.messages[1].content,'通常の入力');await session.dispose();
});
