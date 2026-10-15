"""Download native-probed Japanese model fixtures for non-commercial tests only. Never bundle weights."""
import json,pathlib,hashlib,subprocess,base64
# CRC32C (Castagnoli), as declared by the native manifest.
table=[]
for n in range(256):
 for _ in range(8):n=(n>>1)^0x82f63b78 if n&1 else n>>1
 table.append(n)
def crc32c(data):
 n=0xffffffff
 for byte in data:n=table[(n^byte)&255]^(n>>8)
 return base64.b64encode(((n^0xffffffff)&0xffffffff).to_bytes(4,"big")).decode()
report=json.load(open('test-results/moonshine-manifests.json'))
for model,row in report['models'].items():
 for group in row['manifest']['groups']:
  for f in group['files']:
   p=pathlib.Path('test-results/moonshine-assets')/model/f['name'];p.parent.mkdir(parents=True,exist_ok=True)
   h=p.with_suffix('.headers.txt')
   if not p.exists():subprocess.run(['curl','--fail','--silent','--show-error','--location','--header','Origin: https://fun7772ei.github.io','--dump-header',str(h),'--output',str(p),f['url']],check=True)
   # Check CORS even when reusing a previously downloaded local fixture.
   subprocess.run(['curl','--fail','--silent','--show-error','--location','--head','--header','Origin: https://fun7772ei.github.io','--dump-header',str(h),'--output','/dev/null',f['url']],check=True)
   headers=h.read_text()
   if 'access-control-allow-origin: *' not in headers.lower():raise ValueError('CDN CORS not confirmed: '+f['url'])
   if p.stat().st_size!=f['size']:raise ValueError('Wrong size: '+str(p))
   if f['checksum_type']!='crc32c' or crc32c(p.read_bytes())!=f['checksum']:raise ValueError('Manifest checksum mismatch: '+str(p))
   f.update(checksumVerified=True,corsVerified=True,localFile=str(p),sha256=hashlib.sha256(p.read_bytes()).hexdigest(),responseHeaders=headers)
   print(model,f['name'],p.stat().st_size,flush=True)
json.dump(report,open('test-results/moonshine-assets.json','w'),indent=2)
