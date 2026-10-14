import {Conversation} from './conversation.js';
import './conversation.css';
const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
export function mountConversation(controller){
 const main=document.querySelector('main'),workspace=document.querySelector('.workspace');
 const panel=node('section','');panel.className='surface conversation';panel.id='conversation';panel.hidden=true;
 const heading=node('h2','文字で相談する · Phase 2 α'),note=node('p','自由生成なしの会話試作です。条件を確認し、辞書の原文を参照します。会話はこの画面のメモリ内のみ（最大40メッセージ）。再読み込みで消えます。現在の警報・安全性・個人の診断は判断できません。');
 const log=node('div','');log.id='conversationLog';log.setAttribute('role','log');log.setAttribute('aria-label','会話履歴');log.setAttribute('aria-live','polite');
 const form=node('form',''),label=node('label','状況を入力'),input=node('textarea','');input.id='chatQuestion';input.maxLength=200;input.required=true;input.rows=3;label.htmlFor=input.id;
 const stop=node('button','検索を停止');stop.id='chatStop';stop.type='button';stop.disabled=true;
 const send=node('button','送信'),clear=node('button','会話をリセット'),back=node('button','通常検索に戻る');send.id='chatSend';send.type='submit';clear.id='chatClear';clear.type=back.type='button';
 const status=node('p',''),controls=node('div','');status.id='chatStatus';status.setAttribute('role','status');controls.className='actions';controls.append(send,stop,clear,back);form.append(label,input,controls,status);
 panel.append(heading,note,log,form);main.insertBefore(panel,workspace);
 const toggle=node('button','会話モードを試す（文字入力）');toggle.type='button';toggle.id='chatToggle';toggle.className='tonal';main.insertBefore(toggle,workspace);
 const engine=new Conversation((q,m)=>controller.search(q,m));let epoch=0;
 function source(entry,parent){const card=node('article','');card.className='entry';card.dataset.sourceId=entry.id;card.append(node('h3',entry.title),node('p',entry.summary));const warning=node('div','');warning.className='warning';warning.append(node('h4','注意事項'),node('p',entry.warning));const steps=node('ol','');entry.steps.forEach(s=>steps.append(node('li',s)));card.append(warning,node('h4','手順（原文・省略なし）'),steps,node('p',entry.items));for(const s of entry.sources){const a=node('a',s.label);a.href=s.url;a.target='_blank';a.rel='noopener noreferrer';card.append(a,node('br',''));}parent.append(card);}
 function render(){log.replaceChildren();for(const message of engine.history){const bubble=node('div','');bubble.className=`bubble ${message.role}`;bubble.append(node('strong',message.role==='user'?'あなた':'防災辞書'),node('p',message.text));
  if(message.role==='assistant'){
   for(const c of message.candidates||[]){const b=node('button',`${c.category} · ${c.title}${c.fit==='scene-and-action'?'（状況・行動の条件に対応／適用は未確認）':c.fit==='related-unverified'?'（関連情報・この質問への適用は未確認）':''}`);b.type='button';b.dataset.sourceChoice=c.id;b.disabled=message.selection!==engine.state.selection||!engine.state.pending.includes(c.id)||engine.busy;b.onclick=()=>{try{engine.choose(c.id,message.selection);render();}catch(e){status.textContent=e.message;}};bubble.append(b);}
   for(const c of message.choices||[]){const b=node('button',c);b.type='button';b.disabled=message!==engine.history.at(-1)||engine.busy;b.onclick=()=>{input.value=c;form.requestSubmit();};bubble.append(b);}
   for(const e of message.entries||[])source(e,bubble);
   if(message.entries){for(const text of ['もっと詳しく','ほかの状況なら？']){const b=node('button',text);b.type='button';b.disabled=message!==engine.history.at(-1)||engine.busy;b.onclick=()=>{input.value=text;form.requestSubmit();};bubble.append(b);}}
   if(message.diagnostics){const d=node('details','');d.append(node('summary','検索の診断'),node('pre',JSON.stringify(message.diagnostics,null,2)));bubble.append(d);}
  }log.append(bubble);}
  stop.disabled=!engine.busy;
  panel.dataset.state=JSON.stringify({history:engine.history.map(({entries,...m})=>({...m,entryIds:entries?.map(e=>e.id)})),state:engine.state});
 }
 toggle.onclick=()=>{panel.hidden=false;workspace.hidden=true;toggle.hidden=true;input.focus();};
 stop.onclick=()=>{epoch++;controller.stop();engine.cancel();send.disabled=false;status.textContent='会話の検索を停止しました。入力と履歴は残しています。';render();};
 back.onclick=()=>{epoch++;if(engine.busy){controller.stop();engine.cancel();}panel.hidden=true;workspace.hidden=false;toggle.hidden=false;send.disabled=false;};
 clear.onclick=()=>{epoch++;if(engine.busy)controller.stop();engine.clear();send.disabled=false;status.textContent='会話の文脈を解除しました。モデル保存は維持しています。';render();};
 form.onsubmit=async event=>{event.preventDefault();if(engine.busy)return;
  // The existing button is the single authority for Moonshine busy/listening gating.
  // Do not initialise a second speech/runtime path or change recognition callbacks.
  if(document.querySelector('#search').disabled||!document.querySelector('#voiceListen').disabled){status.textContent='通常検索に戻り、音声AIの停止・解放または処理終了後に送信してください。';return;}
  const seq=++epoch;send.disabled=true;status.textContent='条件を確認しています…';try{const text=input.value;const pending=engine.send(text,document.querySelector('#mode').value);render();await pending;if(seq===epoch){input.value='';status.textContent='';render();}}catch(e){if(seq===epoch)status.textContent=e.message;}finally{if(seq===epoch)send.disabled=false;}
 };
 document.querySelector('#stop').addEventListener('click',()=>{epoch++;engine.cancel();send.disabled=false;status.textContent='会話の検索を停止しました。再送信できます。';render();});
 if(['localhost','127.0.0.1'].includes(location.hostname))Object.defineProperty(window,'bosaiConversation',{value:engine});
}
