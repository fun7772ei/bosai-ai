// Lightweight policy comparison. This measures lexical retrieval, never real Ruri or Safari.
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const option=(key,fallback)=>process.argv.find(x=>x.startsWith('--'+key+'='))?.slice(key.length+3)||fallback;
const root=resolve(option('root','.'));
const {Conversation}=await import(pathToFileURL(resolve(root,'src/conversation.js')));
const {retrieve}=await import(pathToFileURL(resolve(root,'src/beta-search.js')));
const paths=option('cases','').split(',').filter(Boolean);
if(!paths.length)paths.push(...readdirSync('scripts/evaluation').filter(x=>/^conversation.*\.json$/.test(x)).map(x=>'scripts/evaluation/'+x));
const rows=[],hashes={};
for(const path of paths){
  const bytes=readFileSync(path);hashes[path]=createHash('sha256').update(bytes).digest('hex');
  for(const scenario of JSON.parse(bytes)){
    const engine=new Conversation(async(q,m,request)=>({...retrieve(q,'light',undefined,request?.scope),actual:'light',timings:{}}));
    let previous,previousSelection;
    for(const [index,turn] of scenario.turns.entries()){
      const result=await engine.send(turn.text,'light'),facts=structuredClone(engine.state.facts);
      const ids=result.candidates?.map(x=>x.id)||[];
      const row={path,id:scenario.id,turn:index+1,input:turn.text,expected:turn.kind,kind:result.kind,ids,facts,focus:result.diagnostics?.evidence?.focus??null};
      row.controlPass=result.kind===turn.kind&&(!turn.queryIncludes||!!result.diagnostics?.query.includes(turn.queryIncludes))&&(!turn.queryExcludes||!result.diagnostics?.query.includes(turn.queryExcludes));
      if(turn.noPending)row.controlPass&&=!engine.state.pending.length&&!engine.state.referenceIds.length;
      if(turn.absentFacts)row.controlPass&&=turn.absentFacts.every(key=>facts[key]===undefined);
      if(turn.facts)row.controlPass&&=Object.entries(turn.facts).every(([key,value])=>facts[key]===value);
      if(turn.notFocus)row.controlPass&&=row.focus!==turn.notFocus;
      if(turn.rejectPrevious){try{engine.choose(previous,previousSelection);row.controlPass=false;}catch{}}
      if(turn.needsConfirmationIds)row.controlPass&&=turn.needsConfirmationIds.every(id=>result.candidates?.find(c=>c.id===id)?.applicability.status==='needs-confirmation');
      if(turn.gold)row.goldRank=ids.indexOf(turn.gold)+1||null;
      if(turn.badIds)row.badTop3=ids.slice(0,3).filter(id=>turn.badIds.includes(id));
      if(turn.requiredIds)row.allRequiredFound=turn.requiredIds.every(id=>ids.includes(id));
      if(turn.choose&&ids.length)engine.choose(ids.includes(turn.gold)?turn.gold:ids[0]);
      previous=ids[0]||previous;previousSelection=result.selection??previousSelection;
      rows.push(row);
    }
  }
}
const summary={turns:rows.length,controlPassed:rows.filter(x=>x.controlPass).length,goldQueries:rows.filter(x=>'goldRank'in x).length,goldTop1:rows.filter(x=>x.goldRank===1).length,badTop3Queries:rows.filter(x=>x.badTop3?.length).length};
const out={commit:execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),workingTreeDirty:!!execFileSync('git',['-C',root,'status','--porcelain'],{encoding:'utf8'}).trim(),coreSha256:Object.fromEntries(['conversation.js','request-understanding.js','request-facts.js','request-scope.js','conversation-applicability.js','beta-search.js','beta-controller.js'].flatMap(name=>{try{return [['src/'+name,createHash('sha256').update(readFileSync(resolve(root,'src',name))).digest('hex')]];}catch{return []}})),mode:'lexical-only; not real-model/browser or independent expert evaluation',casesSha256:hashes,summary,rows};
writeFileSync(option('output','test-results/conversation-policy.json'),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(summary));
