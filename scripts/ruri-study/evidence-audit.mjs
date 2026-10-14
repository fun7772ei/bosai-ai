// Manual source-text audit of all final danger+long Top1s. Gold labels and algorithms stay frozen.
import{read,}from'./evaluate.mjs';import{writeFileSync}from'node:fs';import{verifyFreeze}from'./verify-freeze.mjs';verifyFreeze();
const cases=read('scripts/evaluation/ruri-size-final-80.json').filter(c=>['danger','long'].includes(c.kind)),corpus=read('src/bosai-data.json');
const notes={
 'size-25/bosai-68':['related-incomplete','River observation is discouraged, but deep flooded-road walking is not directly addressed.'],
 'size-25/bosai-86':['related-incomplete','Low roads/underground entry is forbidden, but the specific deep walking situation is broader than this source scope.'],
 'size-26/bosai-84':['warning-present-intent-mismatch','The source DOES warn against deep/fast flooded walking and says shoes do not remove danger. Its footwear focus is a poor primary selection for permission to walk. Not fabricated source misinformation.'],
 'size-29/bosai-7':['supported-equivalent','Step3 explicitly forbids approaching coast/river until warning/advisory cancellation. Gold expected8; this source also answers the question.'],
 'size-29/bosai-6':['supported-equivalent','Step3 forbids returning to coast to observe or photograph. Sufficient for the asked return-to-watch action.'],
 'size-30/bosai-7':['related-incomplete','After-first-wave return guidance does not explicitly provide immediate exit-from-sea guidance before a wave.'],
 'size-31/bosai-6':['related-incomplete','Continuing evacuation is stated, but required higher ground instead of merely distance is missing.'],
 'size-32/bosai-67':['related-incomplete','Last-resort vertical shelter does not explicitly address a proposed underground shortcut.'],
 'size-32/bosai-68':['related-incomplete','River observation/pre-evacuation is not the proposed underground route.'],
 'size-32/bosai-84':['warning-present-intent-mismatch','Footwear and flooded-road warning do not directly cover underground entry.'],
 'size-39/bosai-56':['supported-equivalent','Rail guidance includes standing handholds, crew instructions and no self-opening doors/track entry. Gold expected subway57, but this overlapping source covers the asked actions.'],
 'size-41/bosai-29':['intent-mismatch','Chronic disease/treatment information does not address requested sleep and rest; treatment/diagnosis is explicitly disclaimed in query.'],
 'size-41/bosai-28':['intent-mismatch','Medicine shortage information does not address requested sleep and rest.'],
 'size-42/bosai-71':['intent-mismatch-risk','Submerged-car escape is explicitly negated by the query; it does not support parking/leaving a vehicle for earthquake evacuation.'],
 'size-43/bosai-84':['warning-present-intent-mismatch','Warning is present, but the footwear focus is explicitly disclaimed by this walking-permission question.'],
};
const audit={scope:'All20 final danger/long questions,12 conditions; manual source-text assessment by developer, not independent disaster-expert review. Gold IDs never modified. Other32 positive questions and OOD are not covered by this qualitative audit.',conditions:{},pairs:{}};
for(const variant of['baseline','improved'])for(const[key,modes]of Object.entries(read(`test-results/ruri-study/final-${variant}.json`).models))for(const[mode,data]of Object.entries(modes)){
 const rows=cases.map(q=>{const r=data.rows.find(r=>r.caseId===q.id),id=r.ids[0]||null,pair=q.id+'/'+id;let label,note;if(!id){label='abstained-answerable';note='Expected source exists, but no primary candidate was returned.';}else if(q.relevant.includes(id)){label='supported-direct';note='Selected expected direct source.';}else{if(!notes[pair])throw Error('Unreviewed evidence pair '+pair);[label,note]=notes[pair];}const e=corpus.find(e=>e.id===id);audit.pairs[pair]={query:q.query,sourceId:id,label,note,title:e?.title,steps:e?.steps,warning:e?.warning};return{caseId:q.id,sourceId:id,label};});const counts={};for(const r of rows)counts[r.label]=(counts[r.label]||0)+1;audit.conditions[`${variant}/${key}/${mode}`]={count:rows.length,counts,rows};
}
writeFileSync('docs/diagnostics/ruri-size-evidence-audit.json',JSON.stringify(audit,null,2)+'\n');console.log('Audited',Object.keys(audit.pairs).length,'unique query/source pairs');
