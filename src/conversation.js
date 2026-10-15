// Deterministic, bounded dialogue. No language generation or safety certification.
import {corpus} from './beta-search.js';
import {understandRequest} from './request-understanding.js';
import {assessRequestScope} from './request-scope.js';
import {evaluateEvidence} from './conversation-applicability.js';
export const HISTORY_LIMIT = 40;
const emptyState = () => ({topics:[], facts:{}, assertions:{}, subject:null, situation:'', action:'', excluded:[], confirmed:[], referenceIds:[], pending:[], awaitingContext:false, selection:null});
const item = id => corpus.find(e => e.id === id);
export {conditions} from './request-understanding.js';
export const coverage=text=>{const scope=assessRequestScope(text);return scope.kind==='unsupported'?scope.reason:null;};
export class Conversation {
  constructor(search) { this.search=search; this.generation=0; this.sequence=0; this.clear(); }
  clear() { this.generation++; this.history=[]; this.turn=0; this.state=emptyState(); this.busy=false; this.sequence++; }
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
    const understanding=understandRequest(text,this.state,++this.turn);
    if(understanding.route==='unsupported'){this.forget();return this.reply('unsupported',understanding.scope.reason,{answerability:'outside-coverage'});}
    if(understanding.route==='clarify'){
      if(understanding.state)this.state=understanding.state;
      return this.clarify(understanding.reason,{choices:understanding.choices},understanding.keepContext);
    }
    const {query,topics,facts,focus,scope}=understanding;
    this.state=understanding.state;
    const generation=++this.generation; this.busy=true;
    try {
      const rawRun=await this.search(query,mode,{topics,facts,focus,scope}); if(generation!==this.generation)throw Error('会話を中断しました。');
      const run=evaluateEvidence(rawRun,focus,facts,topics);
      const diagnostics={actual:run.actual,fallback:run.fallback,timings:{...run.timings,conversationMs:performance.now()-started},query,topics,facts,excluded:this.state.excluded,assertions:this.state.assertions,evidence:run.evidence,applicability:run.applicability,excludedIds:run.evidence.excludedIds||[]};
      if(run.scope.kind==='unsupported') { this.forget(); return this.reply('unsupported',run.scope.reason,{answerability:'outside-coverage',diagnostics}); }
      if(run.scope.kind==='clarify')return this.clarify(run.scope.reason,{choices:run.scope.choices,diagnostics},true);
      if(!run.results.length) { this.forget(); return this.reply('unknown','この辞書で根拠を確認できません。関連する言葉だけで答えがあるとは判断しません。',{answerability:'no-evidence',diagnostics}); }
      const available=run.results.map(row=>({row,assessment:row.assessment}));
      const applicability=run.applicability;
      const excludedIds=run.evidence.excludedIds||[];
      this.state.awaitingContext=false; this.state.pending=available.map(x=>x.row.entry.id); this.state.selection=++this.sequence;
      return this.reply('confirm',focus?'確認できた状況・対象行動に対応する原文候補です。適用範囲や現在の安全性は未確認です。条件と注意事項を確認して選んでください。':'意味が近い原文が見つかりましたが、質問に十分答えられるかは未確認です。状況に合う項目がなければ補足してください。',{
        candidates:available.map(({row:r,assessment})=>({id:r.entry.id,title:r.entry.title,category:r.entry.category,fit:r.fit||'unverified',provenance:r.provenance||'retrieval',applicability:{id:r.entry.id,...assessment}})),
        selection:this.state.selection, answerability:focus?'context-compatible-unverified':'unverified-candidates',diagnostics:{...diagnostics,applicability,excludedIds:excludedIds}});
    } finally { if(generation===this.generation)this.busy=false; }
  }
}
