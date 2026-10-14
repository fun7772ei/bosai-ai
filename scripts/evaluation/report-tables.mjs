// Human-readable tables from measured data, without modifying experiment policies.
import {readFileSync} from 'node:fs';
const s=JSON.parse(readFileSync('docs/diagnostics/six-final-summary.json'));
const pct=(n,d)=>`${n}/${d} (${(100*n/d).toFixed(1)}%)`;
console.log('|方式|Top-1 / Top-3 / Top-5（56問）|AI意味合格（52問）|重大誤情報（全64問）|64問中のPSSピーク MiB|');
console.log('|---|---|---|---|---:|');
for(const [method,m]of Object.entries(s.methods)){const a=m.ai,r=m.retrieval;console.log(`|${method}|${r.top1} / ${r.top3} / ${r.top5}|${a?pct(a.semanticPassPrimary,52):'生成せず原文'}|${a?a.majorErrorsAll:'生成せず原文'}|${s.longRunMemory[method].peak.pssMiB.toFixed(0)}|`);}
console.log('\n|方式|全体ms|Embedding初期化ms|質問Embeddingms|LFM初期化ms|切替→LFM準備ms|TTFT ms|生成ms|PSSピークMiB|');
console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
const candidates=s.serialBrowser.runs.filter(r=>r.method!=='A'&&r.status!=='unavailable');
for(const r of [...candidates,s.serialBrowser.warmD,s.serialBrowser.dualColdF,s.serialBrowser.dualWarmF].filter(Boolean)){
 const t=r.timings,v=x=>Number.isFinite(x)?x.toFixed(1):'—';console.log(`|${r.method}${r.dual?' dual':''}${t.llmWarm?' warm':''}|${v(t.totalMs)}|${v(t.embeddingLoadMs)}|${v(t.embeddingMs)}|${v(t.llmLoadMs)}|${v(t.switchToLlmMs)}|${v(r.answer?.ttftMs)}|${v(t.answerMs)}|${v(r.browserPssPeakMiB)}|`);
}
console.log('\nAI detail:',JSON.stringify(Object.fromEntries(Object.entries(s.methods).filter(([,m])=>m.ai).map(([k,m])=>[k,m.ai])),null,2));
