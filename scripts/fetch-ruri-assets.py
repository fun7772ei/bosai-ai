"""Explicit fixed-revision Ruri download for real-model tests; never writes weights to Git."""
import json,pathlib,hashlib,urllib.request
assets=[]
for a in json.load(open('src/aux-assets.json')):
 if a['group']!='ruri':continue
 p=pathlib.Path('test-results/aux/ruri')/a['file'];p.parent.mkdir(parents=True,exist_ok=True)
 if not p.exists():
  with urllib.request.urlopen(a['url']) as source,open(p,'wb') as dest:
   while chunk:=source.read(1024*1024):dest.write(chunk)
 if p.stat().st_size!=a['bytes'] or hashlib.sha256(p.read_bytes()).hexdigest()!=a['sha256']:raise ValueError('Invalid pinned asset: '+a['file'])
 assets.append(dict(a,localFile=str(p)))
pathlib.Path('test-results/ruri-assets.json').write_text(json.dumps(assets,indent=2)+'\n')
print('Verified',len(assets),'Ruri files:',sum(a['bytes'] for a in assets),'bytes')
