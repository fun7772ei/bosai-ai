import {voiceCorrectionCandidates} from './voice-correction.js';
// A review binds to the exact field and text. Stale suggestions cannot overwrite edits.
export function correctionReview(committed, current, {edited=false,provisional=false}={}) {
  if(edited||provisional||!committed||!current.endsWith(committed))return [];
  const prefix=current.slice(0,-committed.length);
  return voiceCorrectionCandidates(committed).candidates.map(c=>({...c,text:prefix+c.text,original:current}));
}
export function applyCorrection(target,candidate) {
  if(target.value!==candidate.original)return false;
  target.value=candidate.text;
  target.dispatchEvent(new Event('input',{bubbles:true}));
  return true;
}
