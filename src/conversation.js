// Phase 2-alpha: deterministic dialogue, never a generator or a safety decision.
import {corpus} from './beta-search.js';
const hazards=[['津波',/津波|引き波|引き潮/],['地震',/地震|揺れ/],['大雨・浸水',/大雨|洪水|冠水|浸水|水没|台風/],['避難生活',/避難所|在宅避難|車中泊/]];
export const HISTORY_LIMIT=40;
export function conditions(text){
 const excluded=[];
 // Only explicit contrast spans. Unrecognised negation is not interpreted as an affirmative fact.
 const positive=text.replace(/([^、。！？!?]{1,60}?)(?:ではなく|じゃなく)(?:て)?[、,]?/g,(_,span)=>{excluded.push(span);return '';})
 .replace(/(?:診断|電話番号|カロリー計算)(?:を)?(?:求めていない|聞いていない|必要としていない)[、。]?/g,span=>{excluded.push(span);return '';});
 return {positive:positive.trim(),excluded};
}
export function coverage(text){
 if(/(?:今|現在|今日|近所|近く|ここ|この場所).*(?:安全|開設|開い|満員|営業|何人|人数|警報|水位)|(?:避難所|薬局).*(?:定員|収容人数|営業時間)/.test(text))return '現在地や施設の最新状況は確認できません。自治体・気象庁などの最新情報を確認してください。';
 if(/(?:薬|インスリン).*(?:増や|追加|減ら|何錠|何単位)|(?:診断|処方)して/.test(text))return '個人の薬の増減や診断は判断できません。医療者の指示を確認してください。';
 return null;
}
const topic=text=>hazards.filter(([,rx])=>rx.test(text)).map(([name])=>name);
const item=id=>corpus.find(e=>e.id===id);
export class Conversation{
 constructor(search){this.search=search;this.generation=0;this.clear();}
 clear(){this.generation++;this.history=[];this.state={topics:[],situation:'',action:'',excluded:[],confirmed:[],referenceIds:[],pending:[],awaitingContext:false};this.busy=false;}
 cancel(){this.generation++;this.busy=false;this.state.pending=[];}
 remember(role,text,extra={}){this.history.push({role,text,...extra});if(this.history.length>HISTORY_LIMIT)this.history.splice(0,this.history.length-HISTORY_LIMIT);}
 reply(kind,text,extra={}){const result={kind,text,...extra};this.remember('assistant',text,result);return result;}
 choose(id){if(this.busy||!this.state.pending.includes(id)||!item(id))throw Error('現在の候補から選んでください。');this.state.referenceIds=[id];this.state.confirmed=[this.state.situation];this.state.pending=[];return this.reply('source','選択した状況の一般情報です。現在の安全性や質問全体への適用は判断できません。',{entries:[item(id)],answerability:'user-confirmed-source'});}
 async send(raw,mode='hybrid'){
  const text=raw.trim();if(!text||text.length>200)throw Error('1〜200文字で入力してください。');if(this.busy)throw Error('会話の処理中です。');
  if(/^(リセット|話題をリセット|新しい話題)$/.test(text)){this.clear();this.remember('user',text);return this.reply('clarify','前の文脈を解除しました。どのような状況ですか？');}
  this.remember('user',text);
  if(/^(もっと詳しく|手順は[？?]?|注意事項は[？?]?|出典は[？?]?|それについて詳しく)$/.test(text)){
   if(this.state.referenceIds.length)return this.reply('source','直前に選択した原文の概要・全手順・注意事項・出典です。',{entries:this.state.referenceIds.map(item),answerability:'user-confirmed-source'});
   return this.reply('clarify','参照先がまだ確定していません。状況を入力し、候補から選んでください。');
  }
  if(/^(ほかの状況なら[？?]?|別の状況)$/.test(text)){this.state.pending=[];this.state.referenceIds=[];return this.reply('clarify','別の状況を具体的に教えてください。前の原文を自動的に適用しません。');}
  const parsed=conditions(text),topics=topic(parsed.positive);
  const unavailable=coverage(parsed.positive);
  if(unavailable){this.state.pending=[];this.state.referenceIds=[];this.state.awaitingContext=false;return this.reply('unsupported',unavailable,{answerability:'outside-coverage'});}
  const priorTopics=[...this.state.topics];
  if(/(?:私は|自分は).*(?:友人|家族|子ども|子供|相手).*(?:は|が)/.test(parsed.positive))return this.reply('clarify','複数の人の状況を分けて確認します。まず誰の、どの場面について調べますか？');
  const changed=topics.length&&this.state.topics.length&&topics.some(t=>!this.state.topics.includes(t));
  if(changed||parsed.excluded.length){this.state={topics:[],situation:'',action:'',excluded:parsed.excluded,confirmed:[],referenceIds:[],pending:[],awaitingContext:false};}
  if(topics.length>1&&!/避難生活/.test(topics.join(''))){this.state.pending=[];this.state.referenceIds=[];return this.reply('clarify','複数の災害が含まれています。まずどの場面について調べますか？',{choices:topics});}
  const follow=!parsed.excluded.length&&(/^(それ|その|そこ|この場合|では|じゃあ)/.test(parsed.positive)||(!topics.length&&/^(寝室|室内|屋外|徒歩|車|寝て|寝てい|断水).{0,18}(です|ます|でした)$/.test(parsed.positive)&&!!this.state.situation));
  let query=parsed.positive;
  if(parsed.excluded.length&&!topics.length&&priorTopics.length){this.state.topics=priorTopics;query=`${priorTopics.join('・')}。${query}`;}
  if(follow&&!(this.state.awaitingContext&&topics.length)){if(!this.state.situation)return this.reply('clarify','「それ」が指す状況を具体的に教えてください。');query=`${this.state.situation}。${parsed.positive}`;}
  // Never silently trim the user's conditions to fit the existing search path.
  if(query.length>200)return this.reply('clarify','条件が長くなりました。調べたい状況を200文字以内でまとめ直してください。');
  if(!query||/^(それ|そこ|そう|はい)[？?。]*$/.test(query))return this.reply('clarify','どの状況や行動を指しているか教えてください。');
  this.state.topics=topics.length?topics:(follow||parsed.excluded.length?this.state.topics:[]);this.state.situation=query;
  this.state.action=/歩|徒歩/.test(query)?'歩行':/運転|車で/.test(query)?'車の移動':'';
  this.state.referenceIds=[];this.state.pending=[];
  const generation=++this.generation;this.busy=true;
  try{
   const run=await this.search(query,mode);if(generation!==this.generation)throw Error('会話を中断しました。');
   this.state.awaitingContext=false;
   const diagnostics={actual:run.actual,fallback:run.fallback,timings:run.timings,query,topics:this.state.topics,excluded:this.state.excluded};
   if(run.scope.kind==='unsupported')return this.reply('unsupported',run.scope.reason,{answerability:'outside-coverage',diagnostics});
   if(run.scope.kind==='clarify'){this.state.awaitingContext=true;return this.reply('clarify',run.scope.reason,{choices:run.scope.choices,answerability:'needs-context',diagnostics});}
   if(!run.results.length)return this.reply('unknown','この辞書で根拠を確認できません。関連する言葉だけで答えがあるとは判断しません。',{answerability:'no-evidence',diagnostics});
   this.state.awaitingContext=false;this.state.pending=run.results.map(r=>r.entry.id);
   return this.reply('confirm','意味が近い原文が見つかりましたが、質問に十分答えられるかは未確認です。あなたの状況に合う項目はありますか？合わなければ状況を補足してください。',{candidates:run.results.map(r=>({id:r.entry.id,title:r.entry.title,category:r.entry.category})),answerability:'unverified-candidates',diagnostics});
  }finally{if(generation===this.generation)this.busy=false;}
 }
}
