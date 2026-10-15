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
