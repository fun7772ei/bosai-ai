#!/usr/bin/env node
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {compareAsrReports} from '../src/voice-cer.js';
const args=process.argv.slice(2),get=flag=>args[args.indexOf(flag)+1];
if(!args.includes('--tiny')||!args.includes('--base')){console.error('Usage: node scripts/voice-compare.mjs --tiny tiny-report.json --base base-report.json [--output comparison.json]');process.exitCode=2;}
else {
  const tiny=JSON.parse(await readFile(get('--tiny'),'utf8'));
  const base=JSON.parse(await readFile(get('--base'),'utf8'));
  const report=compareAsrReports(tiny,base),out=args.includes('--output')?get('--output'):null;
  if(out){await mkdir(dirname(out),{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+'\n');}
  console.log(JSON.stringify({paired:report.paired,unpaired:report.unpaired,tinyPairedCer:report.tinyPairedCer,basePairedCer:report.basePairedCer,deltaBaseMinusTiny:report.deltaBaseMinusTiny,output:out}));
}
