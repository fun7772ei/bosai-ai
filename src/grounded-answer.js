import policy from './six-policy.json' with { type: 'json' };
export const ANSWER_LIMIT = 64;
export const GROUNDING_STYLES = Object.freeze({
 baseline: '根拠だけを使い日本語で2文以内で答えてください。条件・否定・重要な注意を守り、推測しないでください。根拠で答えられなければ「根拠不足です。」と答えてください。',
 action: '根拠から質問への答えになる行動を1文、注意を1文で書いてください。日本語で60文字程度。根拠の否定と条件を変えず、情報を追加しないでください。答えがなければ「根拠不足です。」と書いてください。',
 english: 'Using ONLY the reference, answer the question in Japanese in 1-2 short sentences. Preserve negation, conditions and essential warnings. Do not add facts. If the reference cannot answer, say 根拠不足です。',
});
export function groundedPrompt(question,entries,style=policy.groundingStyle||'baseline'){
 if(typeof question!=='string'||!question.trim()||question.length>200)throw Error('質問は1〜200文字です。');
 if(!entries.length)throw Error('根拠項目がありません。');
 const escape=text=>String(text).replace(/<\|/g,'＜｜').replace(/\|>/g,'｜＞');
 const system=GROUNDING_STYLES[style];if(!system)throw Error('Unknown grounding style');
 const evidence=entries.map(entry=>`【${entry.title}】\n概要:${entry.summary}\n手順:\n${entry.steps.map((s,i)=>`${i+1}.${s}`).join('\n')}\n注意:${entry.warning}`).join('\n\n');
 // Same non-tool format as the pinned GGUF. Raw native tokenization adds BOS;
 // the matching HF postprocessor below accounts for it exactly once.
 return `<|im_start|>system\n${system}<|im_end|>\n<|im_start|>user\n質問:${escape(question.trim())}\n根拠:\n${escape(evidence)}<|im_end|>\n<|im_start|>assistant\n`;
}
export function groundedPlan(tokenizer,question,entries,{maxTokens=ANSWER_LIMIT,style}={}){
 const prompt=groundedPrompt(question,entries,style);const ids=tokenizer.encode(prompt,{add_special_tokens:true});
 const inputTokens=ids.length;
 return {prompt,inputTokens,maxTokens,contextTokens:512,evidenceIds:entries.map(e=>e.id),fits:inputTokens+maxTokens<=512};
}
export function checkGroundedResult(plan,result){
 const tokenCountMatches=result.promptTokens===plan.inputTokens;
 const completeSentence=/[。！？!?][」』）)]*$/.test(result.text.trim());
 const usable=tokenCountMatches&&!result.stopped&&!result.outputLimitReached&&result.finishReason==='stop'&&completeSentence&&!!result.text.trim();
 return {...result,usable,tokenCountMatches,completeSentence,inputTokens:plan.inputTokens,evidenceIds:plan.evidenceIds,reason:!tokenCountMatches?'token-count-mismatch':result.stopped?'stopped':result.outputLimitReached?'output-limit':!completeSentence?'incomplete-sentence':usable?'generated':'unconfirmed-finish'};
}
