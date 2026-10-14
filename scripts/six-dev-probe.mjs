import{createServer}from'vite';import{chromium}from'@playwright/test';import{createReadStream,readFileSync,writeFileSync,mkdtempSync,rmSync}from'node:fs';
import{getModel,modelFileUrl}from'../src/config.js';import{searchCases}from'./search-cases.mjs';import corpus from'../src/bosai-data.json'with{type:'json'};
const assets=JSON.parse(readFileSync('test-results/six-assets.json'));const lfm=getModel('lfm2-cpu');assets.push({url:modelFileUrl(lfm.file,lfm.key),bytes:lfm.weightBytes.q4_k_m,localFile:'test-results/lfm2-q4-k-m.gguf'});
const server=await createServer({configFile:false,server:{host:'127.0.0.1',port:4184,strictPort:true,hmr:false,watch:null},plugins:[{name:'fixtures',configureServer(s){s.middlewares.use('/six-test',(q,r)=>{r.setHeader('content-type','text/html');r.end('<title>Real six-method probe</title>');});s.middlewares.use('/six-asset',(q,r)=>{const asset=assets[Number(new URL(q.url,'http://localhost').searchParams.get('id'))];r.setHeader('Content-Length',asset.bytes);r.setHeader('access-control-allow-origin','*');createReadStream(asset.localFile).pipe(r);});}}]});
await server.listen();const profile=mkdtempSync('test-results/six-probe-profile-'),context=await chromium.launchPersistentContext(profile);const page=context.pages()[0];
await context.route('https://huggingface.co/**',async route=>{const i=assets.findIndex(a=>a.url===route.request().url());if(i<0)throw Error('Unexpected HF URL');await route.fulfill({status:302,headers:{location:'http://127.0.0.1:4184/six-asset?id='+i,'access-control-allow-origin':'*'}});});
const profiles=process.argv.includes('--profiles');
const output={queries:[],oracle:[],runtime:'Chromium CPU/WASM, not Safari'};
page.on('pageerror',e=>console.log('PAGE',e.message));await page.exposeFunction('notice',p=>{if(!p.update)console.log(JSON.stringify(p));});
try{await page.goto('http://127.0.0.1:4184/six-test');await page.evaluate(async()=>{const{ExperimentChannel}=await import('/src/experiment-client.js');window.channel=new ExperimentChannel(window.notice);window.restart=async()=>{await window.channel.dispose();window.channel=new ExperimentChannel(window.notice);};});
 const request=async(type,args={})=>page.evaluate(({type,args})=>window.channel.request(type,args),{type,args});
 if(!profiles){ await request('download',{group:'ruri'});output.embeddingLoad=await request('load-embedding');
 for(const item of searchCases){const result=await request('embed',{text:item.query});output.queries.push({...result,caseId:item.id,query:item.query});console.log('QUERY',item.id,result.elapsedMs);}
 await page.evaluate(()=>window.restart());}
 await request('download',{group:'lfm'});output.llmLoad=await request('load-llm');
 for(const style of profiles?['baseline','action','english']:['baseline'])for(const id of profiles?[0,2,30,35,36,38]:[0,2,35]){const item=searchCases[id],entries=item.relevant.slice(0,1).map(id=>corpus.find(e=>e.id===id));const result=await request('answer',{query:item.query,entries,style});output.oracle.push({caseId:item.id,style,query:item.query,...result});console.log('ORACLE',JSON.stringify(output.oracle.at(-1)));writeFileSync(profiles?'test-results/six-dev-profiles.json':'test-results/six-dev-probe.json',JSON.stringify(output,null,2));}
 await page.evaluate(()=>window.channel.dispose());writeFileSync(profiles?'test-results/six-dev-profiles.json':'test-results/six-dev-probe.json',JSON.stringify(output,null,2));
}finally{await context.close();rmSync(profile,{recursive:true,force:true});await server.close();}
