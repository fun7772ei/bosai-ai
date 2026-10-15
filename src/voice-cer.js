// Lightweight, dependency-free Unicode code-point CER.
// NFKC/punctuation/spacing normalization is fixed and reported, not optional per model.
export function normalizeAsrText(text){
  return String(text??'').normalize('NFKC').toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu,'');
}
export function characterEdits(reference,hypothesis){
  const a=Array.from(normalizeAsrText(reference)), b=Array.from(normalizeAsrText(hypothesis));
  let previous=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    const current=[i];
    for(let j=1;j<=b.length;j++)current[j]=Math.min(
      previous[j]+1,current[j-1]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1)
    );
    previous=current;
  }
  return {edits:previous[b.length],referenceChars:a.length,hypothesisChars:b.length};
}
export function evaluateAsrCases(cases, results, model){
  if(!Array.isArray(cases)||!Array.isArray(results))throw Error('Cases and results must be arrays');
  if(!['tiny','base'].includes(model))throw Error('Model must be tiny or base');
  const references=new Map();
  for(const row of cases){
    if(typeof row.id!=='string'||typeof row.reference!=='string'||references.has(row.id))throw Error('Invalid/duplicate case');
    references.set(row.id,row);
  }
  const recognized=new Map();
  for(const row of results){
    if(!references.has(row.id)||recognized.has(row.id)||typeof row.transcript!=='string')throw Error('Unknown/duplicate case or invalid transcript: '+row.id);
    recognized.set(row.id,row.transcript);
  }
  let edits=0, chars=0, measured=0;
  const rows=cases.map(({id,category,reference})=>{
    if(!recognized.has(id))return {id,category,reference,transcript:null,edits:null,referenceChars:Array.from(normalizeAsrText(reference)).length,cer:null,status:'unmeasured'};
    const transcript=recognized.get(id),item=characterEdits(reference,transcript);
    edits+=item.edits;chars+=item.referenceChars;measured++;
    return {id,category,reference,transcript,...item,cer:item.referenceChars?item.edits/item.referenceChars:null,status:'measured'};
  });
  return {schemaVersion:1,model,metric:'CER',normalization:'NFKC + lowercase + remove Unicode whitespace/punctuation/symbols; Unicode code points',
    measured,unmeasured:cases.length-measured,total:cases.length,
    aggregateCer:measured&&chars?edits/chars:null,totalEdits:measured?edits:null,totalReferenceChars:measured?chars:null,rows};
}

/** Compare only matched, actually measured utterances; never turn missing into zero CER. */
export function compareAsrReports(tiny,base){
  if(tiny?.model!=='tiny'||base?.model!=='base'||tiny.normalization!==base.normalization)
    throw Error('Expected comparable tiny/base reports with identical normalization');
  const other=new Map(base.rows.map(row=>[row.id,row]));
  if(other.size!==base.rows.length||tiny.rows.length!==base.rows.length)throw Error('Case IDs differ');
  let tinyEdits=0,baseEdits=0,referenceChars=0,paired=0;
  const rows=tiny.rows.map(t=>{
    const b=other.get(t.id);
    if(!b||b.reference!==t.reference)throw Error('Case IDs or references differ: '+t.id);
    if(t.status!=='measured'||b.status!=='measured')
      return {id:t.id,status:'unpaired',tinyCer:t.cer,baseCer:b.cer,deltaBaseMinusTiny:null};
    if(t.referenceChars!==b.referenceChars)throw Error('Reference lengths differ: '+t.id);
    paired++;tinyEdits+=t.edits;baseEdits+=b.edits;referenceChars+=t.referenceChars;
    return {id:t.id,status:'paired',tinyCer:t.cer,baseCer:b.cer,deltaBaseMinusTiny:b.cer-t.cer};
  });
  return {schemaVersion:1,metric:'CER',normalization:tiny.normalization,paired,total:rows.length,unpaired:rows.length-paired,
    tinyPairedCer:paired&&referenceChars?tinyEdits/referenceChars:null,
    basePairedCer:paired&&referenceChars?baseEdits/referenceChars:null,
    deltaBaseMinusTiny:paired&&referenceChars?(baseEdits-tinyEdits)/referenceChars:null,rows};
}
