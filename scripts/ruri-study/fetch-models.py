"""Pin/download genuine q8 assets, never commit weights. --refresh-manifest is explicit."""
import json,urllib.request,pathlib,hashlib,sys
manifest=pathlib.Path('research/ruri/models.json')
if '--refresh-manifest' in sys.argv:
 old=json.load(open('src/aux-assets.json'));models=[]
 models.append(dict(key='30m',repo='onnx-community/ruri-v3-30m-ONNX',revision='1b41a27f31213fc55a9c4653c067770e39406408',tokenizerRepo='cl-nagoya/ruri-v3-30m',tokenizerRevision='24899e5de370b56d179604a007c0d727bf144504',dimensions=256,license='Apache-2.0',dtype='q8',assets=[a for a in old if a['group']=='ruri']))
 for key,repo,revision,tokrev,dim in [('70m','sirasagi62/ruri-v3-70m-ONNX','1147652205469de118635c994c77ffed39eb915d','07a8b0aba47d29d2ca21f89b915c1efe2c23d1cc',384),('130m','onnx-community/ruri-v3-130m-ONNX','cbd305d39c17cc58375ceb29586996e7d98d48c0','e3114c6ee10dbab8b4b235fbc6dcf9dd4d5ac1a6',512)]:
  assets=[]
  for r,rev,files in [(repo,revision,['config.json','onnx/model_quantized.onnx']),('cl-nagoya/ruri-v3-'+key,tokrev,['tokenizer.json','tokenizer_config.json'])]:
   d=json.load(urllib.request.urlopen(f'https://huggingface.co/api/models/{r}/revision/{rev}?blobs=true'));siblings={x['rfilename']:x for x in d['siblings']}
   for f in files:
    x=siblings[f];url=f'https://huggingface.co/{r}/resolve/{rev}/{f}'
    sha=x.get('lfs',{}).get('sha256')
    if not sha:sha=hashlib.sha256(urllib.request.urlopen(url).read()).hexdigest()
    assets.append(dict(file=f,repo=r,revision=rev,url=url,bytes=x['size'],sha256=sha))
  models.append(dict(key=key,repo=repo,revision=revision,tokenizerRepo='cl-nagoya/ruri-v3-'+key,tokenizerRevision=tokrev,dimensions=dim,license='Apache-2.0',dtype='q8',assets=assets))
 manifest.write_text(json.dumps(models,ensure_ascii=False,indent=2)+'\n')
models=json.load(open(manifest));output=[]
for model in models:
 for a in model['assets']:
  p=pathlib.Path('test-results/ruri-study/assets')/model['key']/a['file'];p.parent.mkdir(parents=True,exist_ok=True)
  if not p.exists():
   existing=pathlib.Path('test-results/aux/ruri')/a['file']
   if model['key']=='30m' and existing.exists():
    import shutil;shutil.copyfile(existing,p)
   else:
    with urllib.request.urlopen(a['url'],timeout=180) as source,open(p,'wb') as dest:
     while chunk:=source.read(1024*1024):dest.write(chunk)
  h=hashlib.sha256()
  with open(p,'rb') as f:
   while chunk:=f.read(1024*1024):h.update(chunk)
  if p.stat().st_size!=a['bytes'] or h.hexdigest()!=a['sha256']:raise ValueError('Pinned model bytes mismatch: '+str(p))
  output.append(dict(a,modelKey=model['key'],localFile=str(p)))
 print(model['key'],'verified',sum(a['bytes'] for a in model['assets']),'bytes',flush=True)
pathlib.Path('test-results/ruri-study/assets.json').write_text(json.dumps(output,indent=2)+'\n')
