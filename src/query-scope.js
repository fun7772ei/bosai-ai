// Scope triage, never a generated answer or a claim of answerability.
const normalize=s=>s.normalize('NFKC').toLowerCase();
const choices=['地震のとき','津波のとき','大雨・浸水のとき','在宅避難の支援について'];
export function assessQuestion(query){
 const q=normalize(query);
 const unavailable=(reason,code)=>({kind:'unsupported',reason,code,choices:[]});
 if(/パスワード|保険|補償額|給付金|見舞金|補助金|罹災証明|り災証明|電話番号|連絡先の番号|電話は何番|住所を|住所と|所在地を/.test(q))return unavailable('連絡先・認証情報・金額や制度の個別情報は、この辞書には収録していません。自治体や担当機関の案内を確認してください。','specific-facts');
 if(/何(単位|錠|ミリリットル|ml|mg)|投与量|用量|服用量|処方して|診断して|何の病気/.test(q))return unavailable('個人の診断や薬の量は判断できません。この辞書は医療者による指示の代わりにはなりません。','individual-medical');
 if(/火山|噴火|火山灰|雪崩|雪下ろし|大雪|原発|原子力|放射線|ミサイル|農薬|スポーツ|サッカー|野球|ケーキ|料理のレシピ/.test(q))return unavailable('その分野の具体的な情報は、この88件には収録していません。','outside-topics');
 const now=/(今夜|今朝|今|いま|本日|今日|明日|あす|現在|最新|この町|この地域|ここ|付近|近所|最寄り|近くの)/.test(q);
 const asksLive=/(予報|予想).*(何|高さ|メートル)|何メートル.*(予報|予想)|震度.*(いくつ|何|どのくらい)|警報.*(出ている|出てる|発表され|解除され(た|て)|ありますか)|避難所.*(開いて|開く|開設|空き|満員|住所|電話|どこ)|開いて.*避難所|雨量|降水量|水位.*(何|どのくらい)|通行止め.*(どこ|か)|停電.*(いつ|復旧)|何時.*(到着|到達)|到達.*何時/.test(q);
 const location=/(最寄り|近く|自宅|うち|私|現在地).*(避難所|避難場所).*(どこ|場所|教えて)|避難所.*(住所|電話|開いていますか|開設していますか)/.test(q);
 if((now&&asksLive)||location)return unavailable('現在の警報・予報・避難所の開設や、あなたの場所の安全性は確認できません。気象庁・自治体の最新の発表を確認してください。','live-local');
 const specific=/(在宅避難|避難所生活|地震|揺れ|津波|洪水|大雨|台風|浸水|下水|断水|停電|薬|アレルギー|食中毒|熱中症|低体温|妊|高齢|ペット|キキクル|警戒レベル|車中泊|消毒|歯|義歯|寝|布団|窓|ガラス|雷|竜巻)/.test(q);
 if(!specific&&(/水.*(こと|困|心配)|トイレ.*(心配|困|どう)|上.*(行|逃)|外.*怖|家.*残|避難.*(迷|いい|べき)|助けて|どうしたらいい/.test(q)))return{kind:'clarify',reason:'どの災害・状況について調べますか？条件を選ぶか、具体的な状況を追加してください。',choices:/トイレ/.test(q)?['断水したトイレ','地震中のトイレ','大雨による逆流']:/水/.test(q)?['飲料水・水分補給','断水時のトイレ','浸水・洪水']:choices,code:'needs-context'};
 return{kind:'related',reason:'検索は関連候補を探すものです。質問への答えが収録されている保証はありません。',choices:[],code:'candidates-only'};
}
export function filterHazard(rows,query){
 const q=normalize(query),tsunami=/津波|引き潮|引き波|津波フラッグ/.test(q),rain=/洪水|浸水|大雨|台風|線状降水帯|高潮|土砂|警戒レベル/.test(q);
 if(tsunami&&!rain)return rows.filter(r=>r.entry.category==='津波'||(r.entry.category==='地震'&&/海岸|川べり/.test(r.entry.title)));
 if(rain&&!tsunami)return rows.filter(r=>r.entry.category!=='津波');
 return rows;
}
