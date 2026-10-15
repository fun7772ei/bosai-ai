// Intent-first boundary checks shared by dictionary search and conversational triage.
// Surface the unsupported answer kind; related embeddings cannot supply missing event facts.
const normalize=text=>String(text).normalize('NFKC').replace(/\s+/g,'');
const disasters=/(地震|津波|洪水|水害|台風|土砂災害|噴火|竜巻)/;
const eventTime=/(発生(?:日|日時|年月日|時刻)|起きた日|起こった日|起きた日時|起こった日時|何月何日|何年何月|いつ(?:起き|起こ|発生)|(?:起き|起こ|発生)(?:た|した|する)のはいつ|何日に(?:起き|起こ|発生)|(?:起き|起こ|発生).{0,15}何時)/;
const reverseTime=/(いつ|何月何日|何年|何日|何時).{0,30}(地震|津波|洪水|台風).{0,25}(起き|発生|来た|来る)/;
const factualQuery=/(いつ|何年|何月|何日|何時|何分|日時|日付|発生日|発生時刻|年月日|時刻|知りたい|教えて|ですか|だった|でした|いつ頃)/;
const genericAction=/(備える|備え|対策|注意する|注意点|避難|身を守|どうする|手順|方法|したら|すべき|準備|ときの行動)/;
const forwardTime=/(地震|津波|洪水|台風).{0,20}(?:いつ|何時|何月何日).{0,15}(?:起き|発生|来る)/;
const dateQuestion=q=>((disasters.test(q) && eventTime.test(q) && factualQuery.test(q))||reverseTime.test(q)||forwardTime.test(q));
// Keep the boundary narrow: "地震が起きたときの避難手順" remains a supported general question.
export function classifyAnswerRequest(text){
  const q=normalize(text);
  const occurrence=dateQuestion(q);
  if(occurrence && (!genericAction.test(q)||/(発生日|発生日時|発生時刻|何月何日|いつ(?:起き|起こ|発生)|何時に(?:起き|発生))/.test(q))){
    return {kind:'incident-timestamp',reason:'特定の災害が実際に発生した日時や今後の発生時刻は、この固定辞書では調べられません。過去の記録には公的な記録、将来の予測には気象庁等の発表を確認してください。'};
  }
  // A road safety verdict depends on conditions this static dictionary cannot measure.
  const road=/(道路|歩道|車道|アンダーパス|通学路|橋|経路|ルート)/;
  const liveVerdict=/(今|現在|今日|ここ|この場所|付近|近く|近所|現時点)/;
  const safe=/(安全|通れる|通行できる|通っていい|渡れる|通行可能|危険(?:ですか|かどうか))/;
  if(road.test(q)&&liveVerdict.test(q)&&safe.test(q)){
    return {kind:'current-road-safety',reason:'特定の道路や経路が現在安全かは、この辞書では確認できません。道路管理者や自治体の最新情報を確認してください。'};
  }
  return null;
}
