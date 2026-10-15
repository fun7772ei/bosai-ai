#!/usr/bin/env node
// Example: node scripts/voice-cer.mjs --model tiny --input recordings.json --output test-results/voice-tiny.json
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {evaluateAsrCases} from '../src/voice-cer.js';
const flags=Object.fromEntries(process.argv.slice(2).reduce((pairs,arg,index,all)=>{
  if(arg.startsWith('--'))pairs.push([arg.slice(2),all[index+1]]);
  return pairs;
},[]));
if(!['tiny','base'].includes(flags.model)){console.error('Specify --model tiny|base');process.exitCode=2;}
else {
  const cases=JSON.parse(await readFile(new URL('./evaluation/voice-ja-cases.json',import.meta.url),'utf8'));
  const capture=flags.input?JSON.parse(await readFile(flags.input,'utf8')):{results:[]};
  if(capture.model&&capture.model!==flags.model)throw Error('Input model does not match --model');
  const report=evaluateAsrCases(cases,capture.results,flags.model);
  if(flags.output){await mkdir(dirname(flags.output),{recursive:true});await writeFile(flags.output,JSON.stringify(report,null,2)+'\n');}
  console.log(JSON.stringify({model:report.model,measured:report.measured,unmeasured:report.unmeasured,aggregateCer:report.aggregateCer,output:flags.output||null}));
}
