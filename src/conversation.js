// Deterministic, bounded dialogue. No language generation or safety certification.
import {corpus} from './beta-search.js';
import {topicsIn, factsIn, mergeFacts, focusFor, contextText} from './conversation-context.js';
import {contextualEvidence} from './conversation-evidence.js';
export const HISTORY_LIMIT = 40;
const emptyState = () => ({topics:[], facts:{}, situation:'', action:'', excluded:[], confirmed:[], referenceIds:[], pending:[], awaitingContext:false, selection:null});
const item = id => corpus.find(e => e.id === id);
export function conditions(text) {
  const excluded = [];
  const remove = span => { excluded.push(span); return ''; };
  // Prefer a typed contrast argument so '道路が冠水、車ではなく徒歩' keeps the scene.
  let positive = text.replace(/(水没した車|水没車|車椅子|車いす|車イス|自転車|電車|列車|ベビーカー|乳母車|自動車|車|運転|徒歩|歩行|津波|地震|電話番号|カロリー計算)(?:ではなく|じゃなく)(?:て)?[、,]?/g, (_, span) => remove(span));
  positive = positive.replace(/([^、。！？!?]{1,60}?)(?:ではなく|じゃなく)(?:て)?[、,]?/g, (_, span) => remove(span))
    .replace(/(?:診断|電話番号|カロリー計算)(?:を)?(?:求めていない|聞いていない|必要としていない)[、。]?/g, remove);
  return {positive:positive.trim(), excluded};
}
export function coverage(text) {
  if (/(?:今|現在|今日|近所|近く|ここ|この場所).*(?:安全|開設|開い|満員|営業|何人|人数|警報|水位)|(?:避難所|薬局).*(?:定員|収容人数|営業時間)/.test(text)) return '現在地や施設の最新状況は確認できません。自治体・気象庁などの最新情報を確認してください。';
  if (/(?:薬|インスリン).*(?:増や|追加|減ら|何錠|何単位)|(?:診断|処方)して/.test(text)) return '個人の薬の増減や診断は判断できません。医療者の指示を確認してください。';
  if (/何(?:cm|センチ|メートル|分|秒)|水深.*(?:まで|なら|限界)|(?:絶対|必ず).*安全/.test(text)) return '個別の数値限界や安全の保証は、この一般情報から判断できません。';
  if(/地震.*(?:何時に|いつ).*(?:起き|発生)|地震[がは].*(?:いつ|何時)|(?:いつ|何時).*地震.*(?:起き|発生)|地震.*(?:発生|起き).*(?:日時|日付|時刻)/.test(text)) return '地震の発生日時は予測できません。この辞書は一般的な備えと行動の参照用です。';
  return null;
}
export class Conversation {
  constructor(search) { this.search=search; this.generation=0; this.sequence=0; this.clear(); }
  clear() { this.generation++; this.history=[]; this.state=emptyState(); this.busy=false; this.sequence++; }
  invalidate() { this.sequence++; this.state.pending=[]; this.state.referenceIds=[]; this.state.confirmed=[]; this.state.selection=null; }
  forget() { this.invalidate(); this.state=emptyState(); }
  cancel() { this.generation++; this.busy=false; this.forget(); }
  remember(role,text,extra={}) { this.history.push({role,text,...extra}); if(this.history.length>HISTORY_LIMIT)this.history.splice(0,this.history.length-HISTORY_LIMIT); }
  reply(kind,text,extra={}) { const result={kind,text,...extra}; this.remember('assistant',text,result); return result; }
  clarify(text,extra={},keepContext=false) {
    if(keepContext) { this.invalidate(); this.state.awaitingContext=true; } else this.forget();
    return this.reply('clarify',text,{answerability:'needs-context',...extra});
  }
  choose(id,selection=this.state.selection) {
    if(this.busy || selection!==this.state.selection || !this.state.pending.includes(id) || !item(id)) throw Error('現在の候補から選んでください。');
    this.state.referenceIds=[id]; this.state.confirmed=[this.state.situation]; this.state.pending=[]; this.state.selection=null;
    return this.reply('source','選択した状況の一般情報です。現在の安全性や質問全体への適用は判断できません。',{entries:[item(id)],answerability:'user-confirmed-source'});
  }
  async send(raw,mode='hybrid') {
    const started=performance.now();
    const text=raw.trim(); if(!text || text.length>200)throw Error('1〜200文字で入力してください。'); if(this.busy)throw Error('会話の処理中です。');
    if(/^(リセット|話題をリセット|新しい話題)$/.test(text)) { this.clear(); this.remember('user',text); return this.clarify('前の文脈を解除しました。どのような状況ですか？'); }
    this.remember('user',text);
    if(/^(もっと詳しく|手順は[？?]?|注意事項は[？?]?|出典は[？?]?|それについて詳しく)$/.test(text)) {
      if(this.state.referenceIds.length)return this.reply('source','直前に選択した原文の概要・全手順・注意事項・出典です。',{entries:this.state.referenceIds.map(item),answerability:'user-confirmed-source'});
      return this.clarify('参照先がまだ確定していません。状況を入力し、候補から選んでください。');
    }
    if(/^(ほかの状況なら[？?]?|別の状況)$/.test(text))return this.clarify('別の状況を具体的に教えてください。前の原文を自動的に適用しません。');
    this.invalidate();
    const parsed=conditions(text), explicitTopics=topicsIn(parsed.positive), unavailable=coverage(parsed.positive);
    // P1: every unsupported branch revokes both selection AND pronoun context.
    if(unavailable) { this.forget(); return this.reply('unsupported',unavailable,{answerability:'outside-coverage'}); }
    const subjects=new Set((parsed.positive.match(/(?:私|自分|友人|家族|子ども|子供|相手|祖母|祖父|母|父|兄|姉|弟|妹)(?:は|が)/g)||[]).map(s=>s.slice(0,-1).replace(/^自分$/,'私')));
    if(subjects.size>1)return this.clarify('複数の人の状況を分けて確認します。まず誰の、どの場面について調べますか？');
    if(explicitTopics.length>1 && !explicitTopics.includes('避難生活'))return this.clarify('複数の災害が含まれています。まずどの場面について調べますか？',{choices:explicitTopics});
    const changed=explicitTopics.length && this.state.topics.length && explicitTopics.some(t=>!this.state.topics.includes(t));
    const follow=/^(それ|その|そこ|この場合|では|じゃあ)/.test(parsed.positive) || (!explicitTopics.length && /^(寝室|室内|屋外|徒歩|車|寝て|寝てい|断水).{0,18}(です|ます|でした)$/.test(parsed.positive) && !!this.state.situation);
    if(changed)this.forget();
    if(follow && !this.state.situation)return this.clarify('「それ」が指す状況を具体的に教えてください。');
    const retain=!changed && (follow || parsed.excluded.length || this.state.awaitingContext);
    const facts=mergeFacts(retain?this.state.facts:{},factsIn(parsed.positive),parsed.excluded);
    let topics=explicitTopics.length?explicitTopics:retain?this.state.topics:[];
    if(!topics.length && facts.floodedRoad===true)topics=['大雨・浸水'];
    let query=parsed.positive;
    if(parsed.excluded.length && retain)query=`${contextText(topics,facts)}。${parsed.positive}`;
    else if(follow && !(this.state.awaitingContext && explicitTopics.length))query=`${this.state.situation}。${parsed.positive}`;
    if(query.length>200)return this.clarify('条件が長くなりました。調べたい状況を200文字以内でまとめ直してください。');
    if(!query || /^(それ|そこ|そう|はい)[？?。]*$/.test(query))return this.clarify('どの状況や行動を指しているか教えてください。');
    this.state.topics=topics; this.state.facts=facts; this.state.situation=query; this.state.excluded=[...new Set([...this.state.excluded,...parsed.excluded])].slice(-12);
    this.state.action=facts.movement==='walk'?'歩行':facts.movement==='drive'?'車の移動':'';
    if(facts.road && ['wheelchair','bicycle','rail','stroller'].includes(facts.movement))return this.clarify('この移動手段に固有の通行方法や安全性を、この辞書では判断できません。自動車や徒歩の原文を代用せず、誰のどの場面か、必要な一般情報を分けて教えてください。',{},true);
    if(facts.movement==='mixed')return this.clarify('徒歩と車のどちらの場面を調べますか？',{choices:['徒歩です','車です']},true);
    if(topics.includes('大雨・浸水') && ['walk','drive'].includes(facts.movement) && facts.floodedRoad===undefined && !facts.vehicleFlooded)return this.clarify('移動する道路は冠水していますか？大雨だけでは冠水した状況と判断しません。',{choices:['道路が冠水しています','道路は冠水していません']},true);
    const focus=focusFor(topics,facts), prefix=focus?contextText(topics,facts):'';
    if(prefix && !query.startsWith(prefix))query=`${prefix}。${query}`;
    if(query.length>200)return this.clarify('条件が長くなりました。調べたい状況を200文字以内でまとめ直してください。');
    const generation=++this.generation; this.busy=true;
    try {
      const rawRun=await this.search(query,mode,{topics,facts,focus}); if(generation!==this.generation)throw Error('会話を中断しました。');
      const run=contextualEvidence(rawRun,focus);
      const diagnostics={actual:run.actual,fallback:run.fallback,timings:{...run.timings,conversationMs:performance.now()-started},query,topics,facts,excluded:this.state.excluded,evidence:run.evidence};
      if(run.scope.kind==='unsupported') { this.forget(); return this.reply('unsupported',run.scope.reason,{answerability:'outside-coverage',diagnostics}); }
      if(run.scope.kind==='clarify')return this.clarify(run.scope.reason,{choices:run.scope.choices,diagnostics},true);
      if(!run.results.length) { this.forget(); return this.reply('unknown','この辞書で根拠を確認できません。関連する言葉だけで答えがあるとは判断しません。',{answerability:'no-evidence',diagnostics}); }
      this.state.awaitingContext=false; this.state.pending=run.results.map(r=>r.entry.id); this.state.selection=++this.sequence;
      return this.reply('confirm',focus?'確認できた状況・対象行動に対応する原文候補です。適用範囲や現在の安全性は未確認です。条件と注意事項を確認して選んでください。':'意味が近い原文が見つかりましたが、質問に十分答えられるかは未確認です。状況に合う項目がなければ補足してください。',{
        candidates:run.results.map(r=>({id:r.entry.id,title:r.entry.title,category:r.entry.category,fit:r.fit||'unverified',provenance:r.provenance||'retrieval'})),
        selection:this.state.selection, answerability:focus?'context-compatible-unverified':'unverified-candidates',diagnostics});
    } finally { if(generation===this.generation)this.busy=false; }
  }
}
