import './beta.css';
import {BetaController} from './beta-controller.js';
import {corpus} from './beta-search.js';
const $=id=>document.getElementById(id),el=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;return e;};
let uiRun=0,currentQuery='',lastRun;
const controller=new BetaController({changed:refresh});
function refresh(){const busy=controller.busy;for(const id of ['search','saveModel','loadModel','mode'])$(id).disabled=busy;$('stop').disabled=!busy;$('resetModel').disabled=!controller.channel&&!busy;$('modelState').textContent=controller.state;$('saved').textContent=controller.storageError?'端末保存を利用できません。軽量検索をご利用ください。':controller.saved?.complete?'AIモデル：保存済み（4 / 4）':`AIモデル：未保存（${controller.saved?.files?.filter(f=>f.present).length||0} / 4）`;$('loadModel').disabled=busy||!controller.saved?.complete;}
function selectEntry(id){const item=corpus.find(e=>e.id===id);if(!item)return;const card=$('entry');card.hidden=false;card.replaceChildren(el('span',`${item.category} · 辞書の原文`),el('h2',item.title),el('p',item.summary));const warning=el('div','');warning.className='warning';warning.append(el('h3','注意事項'),el('p',item.warning));card.append(warning,el('h3','手順'));const list=el('ol','');for(const step of item.steps)list.append(el('li',step));card.append(list,el('h3','準備するもの'),el('p',item.items),el('h3','情報源'));const sources=el('ul','');for(const s of item.sources){const li=el('li',''),a=el('a',s.label);a.href=s.url;a.target='_blank';a.rel='noopener noreferrer';li.append(a);sources.append(li);}card.append(sources,el('p',`優先度 ${item.priority} / ${item.id}`));card.dataset.entryId=id;for(const b of $('candidates').querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.entryId===id));}
function render(run){lastRun=run;$('candidates').replaceChildren();$('clarify').replaceChildren();$('entry').hidden=true;$('entry').replaceChildren();delete $('entry').dataset.entryId;$('empty').hidden=!!run.resultIds.length||run.scope.kind!=='related';$('resultCount').textContent=run.resultIds.length?`${run.resultIds.length}件の候補`:'';
 $('message').textContent=run.scope.kind==='unsupported'?run.scope.reason:run.scope.kind==='clarify'?run.scope.reason:run.resultIds.length?'関連する一般情報の候補です。状況に合う項目を選び、原文の条件・注意事項を確認してください。':'関連情報を確認できませんでした。別の言葉や具体的な状況で検索してください。';$('message').className='message '+(run.scope.kind==='unsupported'?'unavailable':'');
 for(const choice of run.scope.choices){const b=el('button',choice);b.type='button';b.onclick=()=>{$('question').value=`${choice}、${currentQuery}`.slice(0,200);$('question').dispatchEvent(new Event('input'));$('searchForm').requestSubmit();};$('clarify').append(b);}
 for(const id of run.resultIds){const item=corpus.find(e=>e.id===id),b=el('button','');b.type='button';b.dataset.entryId=id;b.setAttribute('aria-pressed','false');b.append(el('span',item.category),el('strong',item.title));b.onclick=()=>selectEntry(id);$('candidates').append(b);}
 $('methodInfo').textContent=run.scope.kind==='unsupported'?'この質問への答えは、この辞書では提供できません。':`${run.actual==='hybrid'?'軽量＋Ruri AI':run.actual==='ruri'?'Ruri AI':'軽量検索'} · ${run.timings.totalMs.toFixed(0)} ms${run.fallback?' · AIが未保存または利用できないため軽量検索へ切り替えました。':''}`;
 $('metrics').textContent=`初期化 ${run.timings.loadMs?.toFixed(1)??'なし/再利用'} ms / 質問Embedding ${run.timings.embeddingMs?.toFixed(1)??'なし'} ms / 検索 ${run.timings.retrievalMs.toFixed(1)} ms / 合計 ${run.timings.totalMs.toFixed(1)} ms${run.fallback?` / 切替理由: ${run.fallback}`:''}`;$('candidates').dataset.run=JSON.stringify({...run,results:undefined});
}
$('question').oninput=()=>$('count').textContent=`${$('question').value.length} / 200`;
$('searchForm').onsubmit=async event=>{event.preventDefault();if(controller.busy)return;if(voiceListening){$('message').textContent='先に「録音停止」を押し、認識結果を確認してください。';return;}if(voiceMic){await voiceRelease();voiceState('音声モデルを解放しました。Ruri検索に切り替えます。');}const seq=++uiRun;currentQuery=$('question').value.trim();$('message').textContent='関連する情報を検索しています…';try{const run=await controller.search(currentQuery,$('mode').value);if(seq===uiRun)render(run);}catch(e){if(seq===uiRun)$('message').textContent=e.message;}};
async function modelAction(action){const seq=++uiRun;try{await controller[action]();}catch(e){if(seq===uiRun)controller.phase(`処理を完了できませんでした：${e.message}。軽量検索は利用できます。`);}if(seq===uiRun)await controller.inspect();}
$('saveModel').onclick=()=>modelAction('save');$('loadModel').onclick=()=>modelAction('load');$('stop').onclick=()=>{uiRun++;controller.stop();$('message').textContent='処理を停止しました。軽量検索または再試行をご利用ください。';controller.inspect();};$('resetModel').onclick=async()=>{uiRun++;await controller.reset();$('message').textContent='モデルを解放しました。保存済みデータと表示中の原文は維持しています。';};
for(const text of ['寝ているときに地震が来たら？','高台に間に合わない津波の避難は？','避難所で水が使えないときのトイレは？']){const b=el('button',text);b.type='button';b.onclick=()=>{$('question').value=text;$('question').dispatchEvent(new Event('input'));$('searchForm').requestSubmit();};$('examples').append(b);}

// Moonshine Voice Japanese Tiny Streaming is opt-in. Keep text search usable if this fails.
// The official WASM package is pinned; the microphone and model load only on button press.
const MOONSHINE_MODULE='https://cdn.jsdelivr.net/npm/@moonshine-ai/moonshine-wasm@0.1.5/dist/index.js';
let voiceMic=null,voiceBusy=false,voiceListening=false,voiceSeq=0,voiceFinal=[],voiceBase='';
function voiceState(message){
  $('voiceStatus').textContent=message;
  $('voiceLoad').disabled=voiceBusy||!!voiceMic||voiceListening;
  $('voiceListen').disabled=voiceBusy||!voiceMic||voiceListening;
  $('voiceStop').disabled=voiceBusy||!voiceListening;
}
function voiceFailure(e){
  const message=e?.message||String(e);
  voiceState('音声入力エラー：'+message+'。文字入力は引き続き利用できます。');
}
function voiceApply(){
  const finalText=voiceFinal.join(' ').trim();
  if(!finalText)return;
  $('question').value=[voiceBase,finalText].filter(Boolean).join(' ').slice(0,200);
  $('question').dispatchEvent(new Event('input'));
}
async function voiceRelease(){
  const mic=voiceMic;voiceMic=null;voiceListening=false;
  try{await mic?.stop();}catch{}
  try{await mic?.close();}catch{}
  $('voiceLoad').disabled=voiceBusy;
  $('voiceListen').disabled=true;
  $('voiceStop').disabled=true;
}
$('voiceLoad').onclick=async()=>{
  if(voiceBusy||voiceMic)return;
  const generation=++voiceSeq;voiceBusy=true;
  voiceState('準備中。必要なモデルを取得・初期化しています…');
  try{
    // Avoid keeping the Ruri inference runtime and speech model loaded together on iPad.
    if(controller.busy)throw Error('Ruriの処理終了後にもう一度お試しください');
    if(controller.channel)await controller.reset();
    const {MicTranscriber,ModelArch}=await import(/* @vite-ignore */ MOONSHINE_MODULE);
    if(generation!==voiceSeq)return;
    const mic=new MicTranscriber()
      .language('ja')
      .modelArch(ModelArch.TinyStreaming)
      .options({max_tokens_per_second:'13.0'})
      .onProgress((fraction,file)=>{if(generation===voiceSeq)voiceState('モデル準備中 '+Math.round(fraction*100)+'% '+(file||''));})
      .onText(text=>{if(generation===voiceSeq)$('voiceLive').textContent=text?'認識中：'+text:'';})
      .onLine(line=>{
        if(generation!==voiceSeq)return;
        const t=String(line?.text||'').trim();if(!t)return;
        voiceFinal.push(t);voiceApply();
        $('voiceLive').textContent='確定：'+voiceFinal.join(' ');
      })
      .onError(error=>{if(generation===voiceSeq)voiceFailure(error?.error||error);});
    voiceMic=mic;
    await mic.load();
    if(generation!==voiceSeq){await voiceRelease();return;}
    voiceState('準備完了。マイク開始を押して日本語で話してください。');
  }catch(e){await voiceRelease();voiceFailure(e);}
  finally{voiceBusy=false;voiceState($('voiceStatus').textContent);}
};
$('voiceListen').onclick=async()=>{
  if(voiceBusy||!voiceMic||voiceListening)return;
  voiceBusy=true;voiceBase=$('question').value.trim();voiceFinal=[];
  $('voiceLive').textContent='';
  voiceState('マイクの許可を確認しています…');
  try{
    // start() is only called from a direct tap, required by Safari microphone gating.
    await voiceMic.start();
    voiceListening=true;
    voiceState('録音中。話し終わったら「録音停止」を押してください。');
  }catch(e){voiceFailure(e);}
  finally{voiceBusy=false;voiceState($('voiceStatus').textContent);}
};
$('voiceStop').onclick=async()=>{
  if(!voiceMic)return;
  voiceBusy=true;
  voiceState('録音を終了しています…');
  try{
    await voiceMic.stop();
    voiceApply();
    await voiceRelease();
    voiceState(voiceFinal.length?'文字起こし完了。入力欄の日本語を確認して検索してください。':'録音を終了しました。認識されなかった場合は再度お試しください。');
  }catch(e){await voiceRelease();voiceFailure(e);}
  finally{voiceBusy=false;voiceState($('voiceStatus').textContent);}
};
addEventListener('pagehide',()=>{voiceSeq++;const m=voiceMic;voiceMic=null;try{Promise.resolve(m?.stop()).catch(()=>{});}catch{}try{Promise.resolve(m?.close()).catch(()=>{});}catch{}});

try{$('mode').value=localStorage.getItem('bosai-beta-mode')||'hybrid';}catch{}if(!$('mode').value)$('mode').value='hybrid';$('mode').onchange=()=>{try{localStorage.setItem('bosai-beta-mode',$('mode').value);}catch{}};
$('build').textContent=`ベータ版 ${__APP_BUILD__} / 辞書 ${corpus.length}件 / CPU・WASM / 自由生成なし`;
try{const previous=localStorage.getItem('bosai-beta-stage');if(previous&&!/完了|利用可能|解放|停止/.test(previous))$('recovery').textContent=`前回の記録：${previous}。終了理由は未確定です。保存は削除していません。`;}catch{}
$('export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({build:__APP_BUILD__,userAgent:navigator.userAgent,standalone:matchMedia('(display-mode: standalone)').matches||navigator.standalone===true,origin:location.origin,saved:controller.saved,storageError:controller.storageError,state:controller.state,runs:controller.runs,deviceVerification:'Not automatically iPad verified'},null,2)],{type:'application/json'}));const a=el('a','');a.href=url;a.download='bosai-ruri-beta.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
const online=()=>$('connection').textContent=navigator.onLine?'オンライン':'オフライン';addEventListener('online',online);addEventListener('offline',online);online();
if(['localhost','127.0.0.1'].includes(location.hostname))Object.defineProperty(window,'bosaiBeta',{value:controller});
controller.inspect();refresh();
(async()=>{if('serviceWorker'in navigator&&import.meta.env.PROD)try{await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);await navigator.serviceWorker.ready;$('shellState').textContent='アプリ・辞書のオフライン準備が完了しました。AI検索にはモデルの保存も必要です。';}catch(e){$('shellState').textContent=`アプリのオフライン準備は未完了です：${e.message}`;}else $('shellState').textContent='開発画面です。オフライン利用は公開ビルドで確認してください。';})();
