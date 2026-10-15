// Always attempt close even when stop fails, and never report an uncertain release as success.
export async function releaseVoiceResources(mic,{alreadyStopped=false}={}) {
  const errors=[];let closed=!mic;
  if(!alreadyStopped)try{await mic?.stop();}catch(e){errors.push('stop: '+(e?.message||String(e)));}
  try{await mic?.close();closed=true;}catch(e){errors.push('close: '+(e?.message||String(e)));}
  return {closed,errors,ok:errors.length===0};
}
