import {Conversation} from './conversation.js';
import {corpus} from './beta-search.js';
import './conversation.css';
const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
export function mountConversation(controller){
 const main=document.querySelector('main'),workspace=document.querySelector('.workspace');
 const panel=node('section','');panel.className='surface conversation';panel.id='conversation';panel.hidden=true;
 const heading=node('h2','状況を整理して原文を探す'),note=node('p','自由生成なしの会話試作です。条件を確認し、辞書の原文を参照します。会話はこの画面のメモリ内のみ（最大40メッセージ）。再読み込みで消えます。現在の警報・安全性・個人の診断は判断できません。');
 const log=node('div','');log.id='conversationLog';log.setAttribute('role','log');log.setAttribute('aria-label','会話履歴');log.setAttribute('aria-live','polite');
 const form=node('form',''),label=node('label','状況を入力'),input=node('textarea','');input.id='chatQuestion';input.maxLength=200;input.required=true;input.rows=3;label.htmlFor=input.id;
 const stop=node('button','検索を停止');stop.id='chatStop';stop.type='button';stop.disabled=true;
 const send=node('button','送信'),clear=node('button','会話をリセット'),back=node('button','通常検索に戻る');send.id='chatSend';send.type='submit';clear.id='chatClear';clear.type=back.type='button';
 const status=node('p',''),controls=node('div',''),voiceDock=node('div','');status.id='chatStatus';status.setAttribute('role','status');voiceDock.id='chatVoiceDock';controls.className='actions';controls.append(send,stop,clear,back);form.append(label,input,voiceDock,controls,status);
 const voiceLab=document.querySelector('.voice-lab'),voiceParent=voiceLab?.parentNode,voiceAnchor=voiceLab?.nextSibling;
 function voiceActive(){return voiceLab?.dataset.active==='true';}
 panel.append(heading,note,log,form);main.insertBefore(panel,workspace);
 const toggle=node('button','会話モードを試す（文字入力）');toggle.type='button';toggle.id='chatToggle';toggle.className='tonal';main.insertBefore(toggle,workspace);
 const engine=new Conversation((q,m,request)=>controller.search(q,m,request));let epoch=0;

 // Three independent routes share the same Ruri controller and existing controls.
 // Keep the dictionary as the initial route until the new chat has iPad validation.
 const navigation=node('nav','');navigation.id='appNavigation';navigation.setAttribute('aria-label','アプリ内の画面切替');
 const navChat=node('button','会話'),navDictionary=node('button','辞書検索'),navSettings=node('button','設定・準備');
 const navButtons={chat:navChat,dictionary:navDictionary,settings:navSettings};
 for(const [name,button] of Object.entries(navButtons)){button.type='button';button.dataset.view=name;navigation.append(button);}
 const settings=node('section','');settings.className='app-settings';settings.id='appSettings';settings.hidden=true;settings.setAttribute('aria-label','モデルとアプリの設定');
 const settingsTitle=node('h2','設定・オフラインの準備');
 const settingsIntro=node('p','モデルの保存、現在の動作状態、プライバシーと使い方を確認できます。音声モデルは会話画面または辞書検索画面から準備してください。');
 const settingsContents=node('div','');settingsContents.className='settings-contents';
 settings.append(settingsTitle,settingsIntro,settingsContents);
 const modelPanel=document.querySelector('.model-panel'),helpPanel=document.querySelector('.help');
 const modelHome=document.createComment('model-panel-original-position'),helpHome=document.createComment('help-original-position');
 modelPanel?.before(modelHome);helpPanel?.before(helpHome);
 main.insertBefore(navigation,panel);main.insertBefore(settings,workspace);
 let activeView='dictionary';
 function showView(next){
  if(next===activeView)return true;
  if(voiceActive()){
   const message='音声の準備・録音を終了し、モデルを解放してから画面を切り替えてください。';
   if(activeView==='chat')status.textContent=message;
   else document.querySelector('#voiceStatus').textContent=message;
   return false;
  }
  if(activeView!=='chat'&&controller.busy)return false;
  if(activeView==='chat'&&engine.busy){epoch++;controller.stop();engine.cancel();send.disabled=false;render();}
  if(next==='settings'){
   if(modelPanel)settingsContents.append(modelPanel);
   if(helpPanel)settingsContents.append(helpPanel);
  }else{
   if(modelPanel&&modelHome.parentNode)modelHome.after(modelPanel);
   if(helpPanel&&helpHome.parentNode)helpHome.after(helpPanel);
  }
  if(voiceLab){
   if(next==='chat')voiceDock.append(voiceLab);
   else if(voiceParent)voiceParent.insertBefore(voiceLab,voiceAnchor);
  }
  activeView=next;
  panel.hidden=next!=='chat';workspace.hidden=next!=='dictionary';settings.hidden=next!=='settings';
  toggle.hidden=next!=='dictionary';
  for(const [name,button] of Object.entries(navButtons)){
   button.setAttribute('aria-current',name===next?'page':'false');
  }
  if(next==='chat')input.focus({preventScroll:true});
  return true;
 }
 for(const [name,button] of Object.entries(navButtons))button.onclick=()=>showView(name);
 navDictionary.setAttribute('aria-current','page');

 function source(entry,parent){const card=node('article','');card.className='entry';card.dataset.sourceId=entry.id;card.append(node('h3',entry.title),node('p',entry.summary));const warning=node('div','');warning.className='warning';warning.append(node('h4','注意事項'),node('p',entry.warning));const steps=node('ol','');entry.steps.forEach(s=>steps.append(node('li',s)));card.append(warning,node('h4','手順（原文・省略なし）'),steps,node('p',entry.items));for(const s of entry.sources){const a=node('a',s.label);a.href=s.url;a.target='_blank';a.rel='noopener noreferrer';card.append(a,node('br',''));}parent.append(card);}

 // Offline catalog browsing never needs a loaded model or a speech session.
 const browsePanel=node('details','');browsePanel.id='browseDictionary';browsePanel.className='surface browse-panel';
 const browseSummary=node('summary','全88件の防災辞書を一覧で見る');
 const browseLead=node('p','キーワードまたはカテゴリで原文を絞り込めます。AI検索を使わず、保存済みの辞書だけで動きます。');
 const browseControls=node('div','');browseControls.className='browse-controls';
 const browseLabel=node('label','辞書内の文字検索'),browseInput=node('input','');
 browseInput.type='search';browseInput.id='browseQuery';browseInput.placeholder='例：津波・停電・トイレ';browseLabel.htmlFor=browseInput.id;
 const categoryLabel=node('label','カテゴリ'),categorySelect=node('select','');categorySelect.id='browseCategory';categoryLabel.htmlFor=categorySelect.id;
 const allOption=node('option','すべてのカテゴリ');allOption.value='';categorySelect.append(allOption);
 for(const name of [...new Set(corpus.map(entry=>entry.category))]){
  const option=node('option',name);option.value=name;categorySelect.append(option);
 }
 browseControls.append(browseLabel,browseInput,categoryLabel,categorySelect);
 const browseCount=node('p','');browseCount.className='small';browseCount.id='browseCount';
 const browseList=node('div','');browseList.className='browse-results';browseList.setAttribute('aria-label','辞書の記事');
 const browseArticle=node('div','');browseArticle.id='browseArticle';browseArticle.setAttribute('aria-live','polite');
 function renderBrowse(){
  const query=browseInput.value.normalize('NFKC').toLowerCase().trim(),category=categorySelect.value;
  const matches=corpus.filter(entry=>(!category||entry.category===category)&&(!query||[entry.title,entry.summary,entry.category].some(s=>s.normalize('NFKC').toLowerCase().includes(query))));
  browseCount.textContent='一致した原文 '+matches.length+' / '+corpus.length+'件';
  browseList.replaceChildren();
  for(const entry of matches){
   const b=node('button',entry.title);b.type='button';b.dataset.browseEntry=entry.id;
   b.onclick=()=>{browseArticle.replaceChildren();source(entry,browseArticle);for(const item of browseList.querySelectorAll('button'))item.setAttribute('aria-pressed',String(item===b));};
   browseList.append(b);
  }
  browseArticle.replaceChildren();
 }
 browseInput.addEventListener('input',renderBrowse);categorySelect.addEventListener('change',renderBrowse);
 browsePanel.append(browseSummary,browseLead,browseControls,browseCount,browseList,browseArticle);
 document.querySelector('.search-side').append(browsePanel);
 browsePanel.addEventListener('toggle',()=>{if(browsePanel.open)renderBrowse();});

 function render(){const nearBottom=log.scrollHeight-log.clientHeight-log.scrollTop<100,top=log.scrollTop;log.replaceChildren();for(const message of engine.history){const bubble=node('div','');bubble.className=`bubble ${message.role}`;bubble.append(node('strong',message.role==='user'?'あなた':'防災辞書'),node('p',message.text));
  if(message.role==='assistant'){
   for(const c of message.candidates||[]){const fitStatus={candidate:'適用候補（安全性未確認）','needs-confirmation':'要確認','not-applicable':'適用外'}[c.applicability?.status]||'関連情報・適用未確認';const b=node('button',`${c.category} · ${c.title}（${fitStatus}）`);b.type='button';b.dataset.sourceChoice=c.id;b.disabled=message.selection!==engine.state.selection||!engine.state.pending.includes(c.id)||engine.busy;b.onclick=()=>{try{engine.choose(c.id,message.selection);render();}catch(e){status.textContent=e.message;}};bubble.append(b);}
   for(const c of message.choices||[]){const b=node('button',c);b.type='button';b.disabled=message!==engine.history.at(-1)||engine.busy;b.onclick=()=>{input.value=c;form.requestSubmit();};bubble.append(b);}
   for(const e of message.entries||[])source(e,bubble);
   if(message.entries){for(const text of ['もっと詳しく','ほかの状況なら？']){const b=node('button',text);b.type='button';b.disabled=message!==engine.history.at(-1)||engine.busy;b.onclick=()=>{input.value=text;form.requestSubmit();};bubble.append(b);}}
   if(message.diagnostics){const d=node('details','');d.append(node('summary','検索の診断'),node('pre',JSON.stringify(message.diagnostics,null,2)));bubble.append(d);}
  }log.append(bubble);}
  stop.disabled=!engine.busy;
  if(nearBottom)log.scrollTop=log.scrollHeight;else log.scrollTop=top;
  panel.dataset.state=JSON.stringify({history:engine.history.map(({entries,...m})=>({...m,entryIds:entries?.map(e=>e.id)})),state:engine.state});
 }
 toggle.onclick=()=>showView('chat');
 stop.onclick=()=>{epoch++;controller.stop();engine.cancel();send.disabled=false;status.textContent='会話の検索を停止しました。入力と履歴は残しています。';render();};
 back.onclick=()=>showView('dictionary');
 clear.onclick=()=>{epoch++;if(engine.busy)controller.stop();engine.clear();send.disabled=false;status.textContent='会話の文脈を解除しました。モデル保存は維持しています。';render();};
 form.onsubmit=async event=>{event.preventDefault();if(engine.busy)return;
  // The existing button is the single authority for Moonshine busy/listening gating.
  // Do not initialise a second speech/runtime path or change recognition callbacks.
  if(document.querySelector('#search').disabled||!document.querySelector('#voiceListen').disabled){status.textContent='音声入力の停止・モデル解放または検索処理の終了後に送信してください。';return;}
  const seq=++epoch;send.disabled=true;status.textContent='条件を確認しています…';try{const text=input.value;const pending=engine.send(text,document.querySelector('#mode').value);render();await pending;if(seq===epoch){input.value='';status.textContent='';render();}}catch(e){if(seq===epoch)status.textContent=e.message;}finally{if(seq===epoch)send.disabled=false;}
 };
 document.querySelector('#stop').addEventListener('click',()=>{epoch++;engine.cancel();send.disabled=false;status.textContent='会話の検索を停止しました。再送信できます。';render();});
 if(['localhost','127.0.0.1'].includes(location.hostname))Object.defineProperty(window,'bosaiConversation',{value:engine});
}
