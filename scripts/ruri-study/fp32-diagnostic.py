"""Analysis-only70 FP32 export download. Not an adoption candidate or a primary evaluation change."""
import pathlib,urllib.request,hashlib,json
m=next(m for m in json.load(open('research/ruri/models.json')) if m['key']=='70m')
a=dict(file='onnx/model.onnx',repo=m['repo'],revision=m['revision'],url=f"https://huggingface.co/{m['repo']}/resolve/{m['revision']}/onnx/model.onnx",bytes=280274114,sha256='b6cc766a100a5a6d9e645bb7786799c052dbdeef04776724452d99dd482dd150')
p=pathlib.Path('test-results/ruri-study/70m-fp32.onnx')
if not p.exists():
 with urllib.request.urlopen(a['url']) as src,open(p,'wb') as out:
  while chunk:=src.read(1024*1024):out.write(chunk)
h=hashlib.sha256()
with open(p,'rb') as f:
 while chunk:=f.read(1024*1024):h.update(chunk)
assert p.stat().st_size==a['bytes'] and h.hexdigest()==a['sha256']
a['localFile']=str(p);pathlib.Path('test-results/ruri-study/fp32-asset.json').write_text(json.dumps(a,indent=2)+'\n');print('Verified70 FP32 diagnostic',a['bytes'])
