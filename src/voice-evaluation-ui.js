import cases from '../scripts/evaluation/voice-ja-cases.json' with {type:'json'};
// Explicit per-attempt capture; drafts and corrections never enter the raw transcript.
export function mountVoiceEvaluation(parent,{model,getCommitted,isStopped}) {
  const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
  const panel=node('details',''),summary=node('summary','音声評価（28文・手動記録）');
  const note=node('p','同じ端末・環境で読み上げてください。「記録」は直前の録音で確定した原認識文を保存します。補正・手入力・暫定文は含めません。無音の失敗も実際の試行後に記録できます。データはこの画面内だけに保持し、書き出しは任意です。');
  const select=node('select','');select.setAttribute('aria-label','評価する文');
  for(const c of cases){const o=node('option',c.id+' '+c.reference);o.value=c.id;select.append(o);}
  const reference=node('p',cases[0].reference),record=node('button','直前の試行を記録'),download=node('button','評価JSONを書き出す'),status=node('p','未記録');
  record.type=download.type='button';status.setAttribute('role','status');
  const byModel=new Map();let lastAttempt=null;
  select.onchange=()=>reference.textContent=cases.find(c=>c.id===select.value).reference;
  record.onclick=()=>{
    const attempt=getCommitted();
    if(!isStopped()||!attempt||attempt.id===lastAttempt){status.textContent='新しく録音を開始し、停止してから記録してください。';return;}
    const key=model();
    if(!byModel.has(key))byModel.set(key,new Map());
    const rows=byModel.get(key);
    if(rows.has(select.value)){status.textContent='この文は記録済みです。再測定は新しいページで別の評価として実施してください。';return;}
    rows.set(select.value,{id:select.value,transcript:attempt.text,recordedAt:new Date().toISOString(),attemptId:attempt.id,provisionalAtStop:attempt.provisional});lastAttempt=attempt.id;
    status.textContent=rows.size+' / 28件を記録（'+model()+'）。';
  };
  download.onclick=()=>{
    const capture={schemaVersion:1,model:model(),userAgent:navigator.userAgent,createdAt:new Date().toISOString(),results:[...(byModel.get(model())?.values()||[])]};
    const url=URL.createObjectURL(new Blob([JSON.stringify(capture,null,2)],{type:'application/json'})),a=node('a','');a.href=url;a.download='voice-'+model()+'-capture.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  panel.append(summary,note,select,reference,record,download,status);parent.append(panel);
}
