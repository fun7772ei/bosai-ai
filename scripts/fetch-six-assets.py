"""Opt-in pinned auxiliary files; binary weights stay in ignored test-results/."""
import urllib.request,json,pathlib,hashlib
manifest=json.loads(pathlib.Path('src/aux-assets.json').read_text())
sets=[('ruri','onnx-community/ruri-v3-30m-ONNX','1b41a27f31213fc55a9c4653c067770e39406408',['config.json','onnx/model_quantized.onnx']),('ruri','cl-nagoya/ruri-v3-30m','24899e5de370b56d179604a007c0d727bf144504',['tokenizer.json','tokenizer_config.json']),('lfm-tokenizer','LiquidAI/LFM2.5-350M','9e6c6ccf47cd318696e137d381a7ded8fe4df09f',['tokenizer.json','tokenizer_config.json'])]
assets=[]
for group,repo,rev,files in sets:
 for name in files:
  url=f'https://huggingface.co/{repo}/resolve/{rev}/{name}'
  path=pathlib.Path('test-results/aux')/group/name;path.parent.mkdir(parents=True,exist_ok=True)
  if not path.exists():
   with urllib.request.urlopen(url) as src,open(path,'wb') as dst:
    while chunk:=src.read(1024*1024):dst.write(chunk)
  digest=hashlib.sha256(path.read_bytes()).hexdigest()
  expected=next(a for a in manifest if a['url']==url)
  if path.stat().st_size!=expected['bytes'] or digest!=expected['sha256']:
   raise ValueError(f'Pinned model asset mismatch: {group}/{name}; remove the invalid ignored file and retry')
  assets.append(dict(group=group,repo=repo,revision=rev,file=name,url=url,bytes=path.stat().st_size,sha256=digest,localFile=str(path)))
  print(group,name,path.stat().st_size,digest,flush=True)
pathlib.Path('test-results/six-assets.json').write_text(json.dumps(assets,indent=2)+'\n')
