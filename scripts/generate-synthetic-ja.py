import pyopenjtalk, numpy as np, wave, json, pathlib
cases=json.loads(pathlib.Path('scripts/evaluation/synthetic-ja/cases.json').read_text())
root=pathlib.Path('scripts/evaluation/synthetic-ja');root.mkdir(exist_ok=True)
for case in cases:
 x,sr=pyopenjtalk.tts(case['reference']);x=np.clip(x,-32768,32767).astype(np.float32);x=x[:len(x)//3*3].reshape(-1,3).mean(axis=1).astype('<i2')
 p=root/(case['id']+'.wav')
 with wave.open(str(p),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000);w.writeframes(x.tobytes())
 case.update(file=str(p),seconds=len(x)/16000,source='Synthetic Open JTalk / pyopenjtalk-plus 0.4.1.post9 default voice; NOT human speech')
 print(case['id'],case['seconds'])
(root/'cases.json').write_text(json.dumps(cases,ensure_ascii=False,indent=2)+'\n')
