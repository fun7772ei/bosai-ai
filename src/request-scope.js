// Intent-first boundary checks shared by dictionary search and conversational triage.
// Surface the unsupported answer kind; related embeddings cannot supply missing event facts.
const normalize=text=>String(text).normalize('NFKC').toLowerCase().replace(/\s+/g,'');
const disasters=/(地震|津波|洪水|水害|台風|土砂災害|噴火|竜巻)/;
const eventTime=/(発生(?:日|日時|年月日|時刻)|起きた日|起こった日|起きた日時|起こった日時|何月何日|何年何月|いつ(?:起き|起こ|発生)|(?:起き|起こ|発生)(?:た|した|する)のはいつ|何日に(?:起き|起こ|発生)|(?:起き|起こ|発生).{0,15}何時)/;
const reverseTime=/(いつ|何月何日|何年|何日|何時).{0,30}(地震|津波|洪水|台風).{0,25}(起き|発生|来た|来る)/;
const factualQuery=/(いつ|何年|何月|何日|何時|何分|日時|日付|発生日|発生時刻|年月日|時刻|知りたい|教えて|ですか|だった|でした|いつ頃)/;
const genericAction=/(備える|備え|対策|注意する|注意点|避難|身を守|どうする|手順|方法|したら|すべき|準備|ときの行動)/;
const forwardTime=/(地震|津波|洪水|台風).{0,20}(?:いつ|何時|何月何日).{0,15}(?:起き|発生|来る)/;
const dateQuestion=q=>((disasters.test(q) && eventTime.test(q) && factualQuery.test(q))||reverseTime.test(q)||forwardTime.test(q));
// Keep the boundary narrow: "地震が起きたときの避難手順" remains a supported general question.
function classifyBoundary(text){
  const q=normalize(text);
  const occurrence=dateQuestion(q);
  if(occurrence && (!genericAction.test(q)||/(発生日|発生日時|発生時刻|何月何日|いつ(?:起き|起こ|発生)|何時に(?:起き|発生))/.test(q))){
    return {kind:'incident-timestamp',reason:'特定の災害が実際に発生した日時や今後の発生時刻は、この固定辞書では調べられません。過去の記録には公的な記録、将来の予測には気象庁等の発表を確認してください。'};
  }
  // A road safety verdict depends on conditions this static dictionary cannot measure.
  const road=/(道路|歩道|車道|アンダーパス|通学路|橋|経路|ルート)/;
  const liveVerdict=/(今|現在|今日|ここ|この場所|付近|近く|近所|現時点)/;
  const safe=/(安全|通れ(?:る|ます|ない)|通行できる|通って(?:いい|もよい)|渡れ(?:る|ます)|通行可能|危険(?:ですか|かどうか))/;
  if(road.test(q)&&liveVerdict.test(q)&&safe.test(q)){
    return {kind:'current-road-safety',reason:'特定の道路や経路が現在安全かは、この辞書では確認できません。道路管理者や自治体の最新情報を確認してください。'};
  }
  return null;
}

// Scope triage, never a generated answer or a claim of answerability.

const choices=['地震のとき','津波のとき','大雨・浸水のとき','在宅避難の支援について'];
export function assessRequestScope(query){
 const q=normalize(query);
 const unavailable=(reason,code)=>({kind:'unsupported',reason,code,choices:[]});
 const boundary=classifyBoundary(q);
 if(boundary)return unavailable(boundary.reason,boundary.kind);
 if(/パスワード|保険|補償額|給付金|見舞金|補助金|罹災証明|り災証明|電話番号|連絡先の番号|電話は何番|住所を|住所と|所在地を/.test(q))return unavailable('連絡先・認証情報・金額や制度の個別情報は、この辞書には収録していません。自治体や担当機関の案内を確認してください。','specific-facts');
 if(/何(単位|錠|ミリリットル|ml|mg)|投与量|用量|服用量|処方して|診断して|何の病気/.test(q))return unavailable('個人の診断や薬の量は判断できません。この辞書は医療者による指示の代わりにはなりません。','individual-medical');
 if(/火山|噴火|火山灰|雪崩|雪下ろし|大雪|原発|原子力|放射線|ミサイル|農薬|スポーツ|サッカー|野球|ケーキ|料理のレシピ/.test(q))return unavailable('その分野の具体的な情報は、この88件には収録していません。','outside-topics');
 const now=/(今夜|今朝|今|いま|本日|今日|明日|あす|現在|最新|この町|この地域|ここ|付近|近所|最寄り|近くの)/.test(q);
 const asksLive=/(予報|予想).*(何|高さ|メートル)|何メートル.*(予報|予想)|震度.*(いくつ|何|どのくらい)|警報.*(出ている|出てる|発表され|解除され(た|て)|ありますか)|避難所.*(開いて|開く|開設|空き|満員|住所|電話|どこ)|開いて.*避難所|雨量|降水量|水位.*(何|どのくらい)|通行止め.*(どこ|か)|停電.*(いつ|復旧)|何時.*(到着|到達)|到達.*何時/.test(q);
 const location=/(最寄り|近く|自宅|うち|私|現在地).*(避難所|避難場所).*(どこ|場所|教えて)|避難所.*(住所|電話|開いていますか|開設していますか)/.test(q);
 if((now&&(asksLive||/警報|注意報|予報|予想/.test(q)))||location)return unavailable('現在の警報・予報・避難所の開設や、あなたの場所の安全性は確認できません。気象庁・自治体の最新の発表を確認してください。','live-local');
  if (/(?:今|現在|今日|近所|近く|ここ|この場所).*(?:安全|開設|開い|満員|営業|何人|人数|警報|水位)|(?:避難所|薬局).*(?:定員|収容人数|営業時間)/.test(q)) return unavailable('現在地や施設の最新状況は確認できません。自治体・気象庁などの最新情報を確認してください。','static-limits');
  if (/(?:薬|インスリン).*(?:増や|追加|減ら|何錠|何単位)|(?:診断|処方)して/.test(q)) return unavailable('個人の薬の増減や診断は判断できません。医療者の指示を確認してください。','static-limits');
  if (/何(?:cm|センチ|メートル|分|秒)|水深.*(?:まで|なら|限界)|(?:絶対|必ず).*安全/.test(q)) return unavailable('個別の数値限界や安全の保証は、この一般情報から判断できません。','static-limits');
 const specific=/(飲料水|水分補給|在宅避難|避難所生活|地震|揺れ|津波|洪水|大雨|台風|浸水|下水|断水|停電|薬|アレルギー|食中毒|熱中症|低体温|妊|高齢|ペット|キキクル|警戒レベル|車中泊|消毒|歯|義歯|寝|布団|窓|ガラス|雷|竜巻)/.test(q);
 if(!specific&&(/水.*(こと|困|心配)|トイレ.*(心配|困|どう)|上.*(行|逃)|外.*怖|家.*残|避難.*(迷|いい|べき)|助けて|どうしたらいい/.test(q)))return{kind:'clarify',reason:'どの災害・状況について調べますか？条件を選ぶか、具体的な状況を追加してください。',choices:/トイレ/.test(q)?['断水したトイレ','地震中のトイレ','大雨による逆流']:/水/.test(q)?['飲料水・水分補給','断水時のトイレ','浸水・洪水']:choices,code:'needs-context'};
 return{kind:'related',reason:'検索は関連候補を探すものです。質問への答えが収録されている保証はありません。',choices:[],code:'candidates-only'};
}
export function filterHazard(rows,query){
 const q=normalize(query),tsunami=/津波|引き潮|引き波|津波フラッグ/.test(q),rain=/洪水|浸水|大雨|台風|線状降水帯|高潮|土砂|警戒レベル/.test(q);
 if(tsunami&&!rain)return rows.filter(r=>r.entry.category==='津波'||(r.entry.category==='地震'&&/海岸|川べり/.test(r.entry.title)));
 if(rain&&!tsunami)return rows.filter(r=>r.entry.category!=='津波');
 return rows;
}

// Resolve only missing context from the typed frame; never reclassify a search string.
export function resolveRequestScope(scope,topics=[]) {
  return scope.kind==='clarify'&&topics.length ? {kind:'related',code:'candidates-only',choices:[],reason:'文脈を使って関連する原文候補を検索します。適用は未確認です。'} : scope;
}
export {classifyBoundary};
