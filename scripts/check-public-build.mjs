import{readFileSync,readdirSync,existsSync}from'node:fs';import{createHash}from'node:crypto';
const files=[];function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const p=dir+'/'+e.name;e.isDirectory()?walk(p):files.push(p);}}walk('dist');
for(const p of files){if(/research|experiment\.worker|cpu\.worker|wllama|\.gguf$|\.onnx$/.test(p))throw Error('Research/model executable in public artifact: '+p);if(p.endsWith('.js')&&/new CpuSession|createCompletion\(|createChatCompletion\(|class SixController|load-llm/.test(readFileSync(p,'utf8')))throw Error('Generative execution path in '+p);}
const shell=JSON.parse(readFileSync('dist/shell.json'));for(const p of shell)if(!existsSync('dist/'+p.slice(2)))throw Error('Missing shell asset '+p);
for(const p of ['./index.html','./manifest.webmanifest','./apple-touch-icon.png','./model-notices.txt'])if(!shell.includes(p))throw Error('Missing offline asset '+p);
if(!files.some(p=>p.includes('ruri.worker')))throw Error('No embedding worker');if(files.some(p=>p.endsWith('research.html')))throw Error('Research HTML published');
const corpus=readFileSync('src/bosai-data.json');const vectors=JSON.parse(readFileSync('src/bosai-vectors.json'));if(createHash('sha256').update(corpus).digest('hex')!==vectors.corpusSha256)throw Error('Corpus vectors mismatch');if(JSON.parse(corpus).length!==88)throw Error('Not88');
console.log(JSON.stringify({publicFiles:files.length,shellAssets:shell.length,generativeRuntime:false,weights:false,corpus:88,embeddingIndex:true}));
