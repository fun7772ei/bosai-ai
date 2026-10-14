// A finite concept vocabulary and typed coverage contract, independent of evaluation queries.
// No source text is rewritten, and cosine similarity is never interpreted as answerability.
import corpus from'../../src/bosai-data.json'with{type:'json'};
import facets from'./facets.json'with{type:'json'};
import{normalize}from'../../src/bosai-search.js';
import{assessQuestion}from'../../src/query-scope.js';
const concepts={
 tsunami:['津波','引き潮','引き波','津波フラッグ'],quake:['地震','揺れ','ぐらっ','ぐらぐら','揺ら'],rain:['大雨','洪水','冠水','浸水','台風','水没','増水','線状降水帯','土砂','高潮','帯状の雨雲'],shelter:['避難所','避難生活','体育館','車中泊','在宅避難'],power:['停電','断水','電気が戻','電気が止','電気が消'],
 sea:['海','海岸','浜'],flag:['津波フラッグ','赤白の旗','赤と白の旗'],body:['足','脚','血栓','むくみ','座りっぱなし'],office:['会社','職場','オフィス','デスク','棚'],subway:['地下鉄'],rail:['電車','列車','鉄道'],car:['車','運転','自動車'],carstay:['車中泊','車内生活','車で寝','車で生活'],cliff:['崖','がけ','山の斜面'],elevator:['エレベーター'],kitchen:['台所','キッチン','調理場'],bathroom:['風呂','浴槽','入浴'],toilet:['トイレ','便所','お手洗い'],indoor:['自宅','家の中','室内'],road:['道路','道','アンダーパス'],footwear:['靴','裸足','履物'],'home-support':['在宅避難','家で避難生活','自宅で避難生活','自宅で暮らす'],
 lightning:['雷'],tornado:['竜巻'],medicine:['薬','インスリン'],hydration:['飲料水','水分補給','水分'],heat:['熱中症','暑','蒸し暑'],cold:['低体温','寒','冷え'],mouth:['歯磨き','口腔','歯みがき'],denture:['入れ歯','義歯'],food:['食中毒','弁当','食品'],diet:['アレルギー','食事制限'],pet:['ペット','犬','猫'],privacy:['プライバシー','着替え'],infection:['感染','咳','発熱'],sleep:['寝','布団','眠','睡眠'],phone:['スマホ','スマートフォン'],fridge:['冷蔵庫','冷凍庫'],window:['窓','ガラス'],electricity:['家電','ブレーカー','通電','コンセント'],
 walk:['歩く','歩い','歩行','徒歩'],drive:['運転','車で','車高','走行','車両'],escape:['脱出','逃げ出'],evacuate:['避難','逃げ','移動'],
 credential:['パスワード','合言葉','暗証番号','認証'],contact:['電話番号','連絡先','所在地','住所'],administration:['保険','補償','給付','見舞金','補助金','減免','罹災証明','り災証明','申請書'],calculation:['計算','算出'],localBusiness:['営業時間','販売店','売っている店','病院名','どこの病院'],medicalDecision:['診断して','診断を','投与量','服用量','用量','処方して'],now:['現在','最新','今朝','今夜','本日','今日','明日','この地域','この町','今の'],live:['警報','注意報','予報','予想','震度','津波高','波の高さ','何メートル','開設','開いている','復旧','水位'],
};
const compiled=Object.fromEntries(Object.entries(concepts).map(([k,a])=>[k,a.map(normalize)]));
const hazards=['tsunami','quake','rain','shelter','power','lightning','tornado'];
const objects=[...new Set(facets.flatMap(f=>f.objects))];
const generic=new Set(['避難','災害','危険','安全','対策','行動','注意','水','情報','相談','場所','屋外','屋内','支援','移動','被災','判断','心配','不安','建物','必要','状況','場合','地震','津波','台風','大雨','避難所'].map(normalize));
const topicWords=[...new Set(corpus.flatMap(e=>e.keywords).map(normalize))].filter(s=>s.length>=2&&!generic.has(s));
const reason=(kind,code,text,choices=[])=>({kind,code,reason:text,choices});
const segmenter=new Intl.Segmenter('ja',{granularity:'word'});
const contentTerms=text=>[...segmenter.segment(String(text).normalize('NFKC'))].filter(s=>s.isWordLike&&((s.segment.match(/[一-龠]/g)||[]).length>=2||/[ァ-ヶ]{2}/.test(s.segment))&&!generic.has(normalize(s.segment))).map(s=>normalize(s.segment));
const df=new Map();for(const e of corpus)for(const t of new Set(contentTerms([e.title,e.summary,...e.steps,e.warning,...e.keywords].join(' '))))df.set(t,(df.get(t)||0)+1);
export function analyze(query){const q=normalize(query),found=new Set(Object.entries(compiled).filter(([,a])=>a.some(s=>q.includes(s))).map(([k])=>k));if([...segmenter.segment(q)].some(s=>s.segment==='いま'))found.add('now');const evidence=[...new Set(contentTerms(query))].filter(t=>df.has(t)&&df.get(t)<corpus.length*.2);return{contentEvidence:evidence,found:[...found],hazards:hazards.filter(k=>found.has(k)),objects:objects.filter(k=>found.has(k)),hasTopic:topicWords.some(w=>q.includes(w)),numeric:/何(?:分|時間|錠|単位|ミリ|グラム|キロ|リットル)|\d+(?:\.\d+)?\s*(?:単位|錠|mg|ml)/i.test(q)};}
export function scopeFor(query,intent=analyze(query)){
 const f=new Set(intent.found),base=assessQuestion(query);
 if(base.kind==='unsupported')return base;
 const missing=['credential','contact','administration','calculation','localBusiness','medicalDecision'].filter(k=>f.has(k));
 if(missing.length||intent.numeric)return reason('unsupported','uncovered-answer-kind','この辞書は一般的な手順の参照用です。個別の数値・計算・診断・認証情報・連絡先・店舗や制度の個別情報は確認できません。');
 if(f.has('now')&&f.has('live'))return reason('unsupported','live-facts','現在の災害状況や数値・開設状況は確認できません。気象庁や自治体の最新情報を確認してください。');
 const specific=intent.objects.some(k=>!['road','car','indoor','toilet'].includes(k))||intent.hazards.length||intent.contentEvidence.length;
 if(!specific||base.kind==='clarify'&&!intent.hazards.length&&!intent.objects.some(k=>!['road','car','indoor','toilet'].includes(k)))return reason('clarify','missing-context','どの災害・状況・行動について調べますか？具体的な条件を追加してください。',f.has('toilet')?['断水したトイレ','地震中のトイレ','大雨による逆流']:normalize(query).includes('水')?['飲料水・水分補給','断水時のトイレ','浸水・洪水']:['地震のとき','津波のとき','大雨・浸水のとき','避難所での生活']);
 return reason('related','evidence-candidates','一般情報の根拠候補です。類似度は質問への回答可能性を保証しません。');
}
export function constraints(intent){const f=new Set(intent.found);let actions=[];
 if(f.has('rain')){if(f.has('walk'))actions.push('walk-flood');if(f.has('drive'))actions.push(f.has('escape')?'vehicle-escape':'drive-flood');}
 const targets=['subway'].filter(k=>f.has(k));
 return{actions,targets};
}
export function compatible(facet,required){return(!required.actions.length||required.actions.some(a=>facet.actions.includes(a)))&&(!required.targets.length||required.targets.some(t=>facet.objects.includes(t)));}
export {facets};
