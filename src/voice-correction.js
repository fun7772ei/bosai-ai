// Candidate-only ASR typo hints. Do not silently rewrite safety-critical speech.
const candidatePatterns = [
  {incorrect:'自信', correct:'地震', predicate:/自信が(?:発生した|発生しています|起きた)(?=$|[。！!、\s]|ら)/gu,
   reason:'「自信」と「地震」の同音異義語です。災害文脈か音声を確認してください。'}
];
export function voiceCorrectionCandidates(input) {
  const original = String(input ?? '');
  const candidates = [];
  for (const rule of candidatePatterns) {
    for (const match of original.matchAll(rule.predicate)) {
      // This is a suggestion, not a safe automatic substitution.
      const index=match.index;
      const text=original.slice(0,index)+rule.correct+original.slice(index+rule.incorrect.length);
      candidates.push({from:rule.incorrect,to:rule.correct,start:index,end:index+rule.incorrect.length,text,reason:rule.reason});
    }
  }
  return {original,autoApplied:false,candidates};
}
