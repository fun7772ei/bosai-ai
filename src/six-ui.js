import corpus from './bosai-data.json';
import {SixController,METHODS}from'./six-controller.js';
import{openModelStore}from'./model-storage.js';
import{auxStatus}from'./aux-models.js';
const $=id=>document.getElementById(id),node=(tag,text)=>{const el=document.createElement(tag);el.textContent=text;return el;};
export function mountSix({beforeModels,legacyBusy,changed}){
 let lastQuery='',sequence=0;
 const render=ids=>{
  $('sixResults').replaceChildren();for(const id of ids){const entry=corpus.find(e=>e.id===id);if(!entry)continue;const card=node('article','');card.className='search-card';card.dataset.sixEntryId=id;
   card.append(node('h3',entry.title),node('p',entry.summary),node('h4','手順'));const ol=node('ol','');for(const s of entry.steps)ol.append(node('li',s));card.append(ol,node('h4','注意事項'),node('p',entry.warning),node('h4','出典'));const ul=node('ul','');for(const s of entry.sources){const li=node('li',''),a=node('a',s.label);a.href=s.url;a.rel='noopener noreferrer';a.target='_blank';li.append(a);ul.append(li);}card.append(ul);$('sixResults').append(card);
  }
 };
 const controller=new SixController({beforeModels,changed:()=>{refresh();changed();},notice:data=>{
  if(data.phase){$('sixState').textContent=data.phase;if(data.phase==='retrieved')render(data.resultIds);}
  if(data.progress)$('sixState').textContent=`保存: ${data.progress.file} ${data.progress.stage||'再利用'}`;
  if(data.update)$('sixState').textContent=`LFM生成中: ${data.update.tokens} tokens`;
 }});
 function refresh(){const busy=controller.busy||legacyBusy();$('sixSubmit').disabled=busy;$('sixMethod').disabled=busy;$('sixSaveEmbedding').disabled=busy;$('sixSaveLfm').disabled=busy;$('sixStop').disabled=!controller.busy;$('sixReset').disabled=!controller.active;}
 async function inspect(){const store=await openModelStore();try{const statuses=await Promise.all(['ruri','lfm'].map(g=>auxStatus(store,g)));$('sixSaved').textContent=statuses.map(s=>`${s.group==='ruri'?'Embedding':'LFM350＋Tokenizer'}: ${s.complete?'保存済み':s.files.filter(f=>f.present).length+'/'+s.files.length+'保存済み'}`).join(' / ');}finally{store.close();}}
 $('sixMethod').replaceChildren(...Object.entries(METHODS).map(([id,label])=>new Option(`${id}: ${label}`,id)));
 if(controller.previousStage)$('sixRecovery').textContent=`前回は「${controller.previousStage.phase}」の完了前にページが終了しました。原因は未確定です。`;
 const dev=location.hostname==='localhost'||location.hostname==='127.0.0.1';$('sixDualArea').hidden=!dev;
 if(dev)Object.defineProperty(window,'bosaiSix',{value:controller});
 $('sixForm').onsubmit=async event=>{
  event.preventDefault();const query=$('sixQuestion').value.trim();if(!query||controller.busy||legacyBusy())return;
  const current=++sequence;lastQuery=query;$('sixAnswer').textContent='';$('sixRaw').textContent='';$('sixState').textContent='検索中…';
  const run=await controller.run(query,$('sixMethod').value,{dual:dev&&$('sixDual').checked});
  if(current!==sequence)return;render(run.resultIds);
  $('sixAnswer').textContent=run.answer?.usable?`実験生成（内容の正確性は未検証）:\n${run.answer.text}`:run.answer?`生成を採用せず原文を表示: ${run.answer.reason}`:run.status==='unavailable'?run.error:run.resultIds.length?'原文を表示しています。':'該当項目を確認できません。状況を具体的にしてください。';
  $('sixRaw').textContent=JSON.stringify(run,null,2);$('sixState').textContent=`完了: ${run.status}`;
  $('sixTimings').textContent=`検索 ${run.timings.retrievalMs?.toFixed(1)??'—'} ms / Embedding初期化 ${run.timings.embeddingLoadMs?.toFixed(1)??'再利用/なし'} ms / 質問Embedding ${run.timings.embeddingMs?.toFixed(1)??'—'} ms / 解放 ${run.timings.releaseMs?.toFixed(1)??'—'} ms / LFM初期化 ${run.timings.llmLoadMs?.toFixed(1)??'再利用/なし'} ms / 切替 ${run.timings.switchToLlmMs?.toFixed(1)??'—'} ms / 生成 ${run.timings.answerMs?.toFixed(1)??'—'} ms / 合計 ${run.timings.totalMs.toFixed(1)} ms`;
  $('sixResults').dataset.run=JSON.stringify(run);await inspect();
 };
 $('sixSaveEmbedding').onclick=async()=>{await controller.download('ruri').catch(e=>$('sixState').textContent=e.message);await inspect();};
 $('sixSaveLfm').onclick=async()=>{await controller.download('lfm').catch(e=>$('sixState').textContent=e.message);await inspect();};
 $('sixStop').onclick=()=>controller.stop();
 $('sixReset').onclick=async()=>{sequence++;await controller.reset();$('sixState').textContent='実験をリセット。保存は維持しています。';};
 $('sixExport').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({appBuild:__APP_BUILD__,userAgent:navigator.userAgent,runs:controller.runs},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='bosai-six-methods.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 inspect().catch(e=>$('sixSaved').textContent=e.message);refresh();return{controller,refresh,inspect};
}
