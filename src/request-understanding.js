// Pure request interpretation and state transition. No retrieval, storage or UI dependencies.
import {topicsIn,factsIn,mergeFacts,focusFor,contextText,conditions} from './request-facts.js';
import {assessRequestScope,resolveRequestScope} from './request-scope.js';
/** @typedef {{value: boolean|string|null, polarity:'asserted'|'denied'|'unknown', subject:string, sourceTurn:number|null}} Assertion */
export {conditions} from './request-facts.js';

export function understandRequest(text, previous, turn=1) {
    let nextState;
    const clarify=(reason,extra={},keepContext=false)=>({route:'clarify',reason,...extra,keepContext,state:keepContext?nextState:null});
    const parsed=conditions(text), explicitTopics=topicsIn(parsed.positive);
    const directScope=assessRequestScope(parsed);
    if(directScope.kind==='unsupported')return {route:'unsupported',scope:directScope};
    const subjects=new Set((parsed.positive.match(/(?:私|自分|友人|家族|子ども|子供|相手|祖母|祖父|母|父|兄|姉|弟|妹)(?:は|が)/g)||[]).map(s=>s.slice(0,-1).replace(/^自分$/,'私')));
    if(subjects.size>1)return clarify('複数の人の状況を分けて確認します。まず誰の、どの場面について調べますか？');
    if(explicitTopics.length>1 && !explicitTopics.includes('避難生活'))return clarify('複数の災害が含まれています。まずどの場面について調べますか？',{choices:explicitTopics});
    const changed=explicitTopics.length && previous.topics.length && explicitTopics.some(t=>!previous.topics.includes(t));
    const incoming=factsIn(parsed.positive);
    const vehicleScene=previous.facts.movement==='drive'||previous.facts.vehicleFlooded!==undefined;
    const follow=parsed.identityCorrected||(vehicleScene&&incoming.vehicleTransitionMentioned)||/^(それ|その|そこ|この場合|では|じゃあ)/.test(parsed.positive) || (!explicitTopics.length && /^(寝室|室内|屋外|徒歩|車|寝て|寝てい|断水).{0,18}(です|ます|でした)$/.test(parsed.positive) && !!previous.situation);

    if(follow && !previous.situation)return clarify('「それ」が指す状況を具体的に教えてください。');
    const retain=!changed && (follow || parsed.excluded.length || previous.awaitingContext);
    const subject=subjects.values().next().value||null;
    if(retain && subject && previous.subject && subject!==previous.subject)return clarify('前の人の状況を引き継がず、誰のどの場面かを確認します。');
    const facts=mergeFacts(retain?previous.facts:{},incoming,parsed.excluded);
    const updatesFrame=retain&&['floodedRoad','movement','unreachableHeight','vehicleFlooded'].some(key=>previous.facts[key]!==undefined&&previous.facts[key]!==facts[key]);
    let topics=explicitTopics.length?explicitTopics:retain?previous.topics:[];
    if(!topics.length && facts.floodedRoad===true)topics=['大雨・浸水'];
    let query=parsed.positive;
    if((parsed.identityCorrected||parsed.excluded.length||updatesFrame) && retain)query=`${contextText(topics,facts)}。${parsed.positive}`;
    else if(follow && !(previous.awaitingContext && explicitTopics.length))query=`${contextText(topics,facts)}。${parsed.positive}`;
    if((follow && previous.situation.length+parsed.positive.length+1>200)||query.length>200)return clarify('条件が長くなりました。調べたい状況を200文字以内でまとめ直してください。');
    if(!query || /^(それ|そこ|そう|はい)[？?。]*$/.test(query))return clarify('どの状況や行動を指しているか教えてください。');
    const state=nextState={...previous, topics, facts, subject:subject||(retain?previous.subject:null), situation:query, excluded:[...new Set([...previous.excluded,...parsed.excluded])].slice(-12)};
    state.assertions=Object.fromEntries(Object.entries(facts).map(([key,value])=>[key, incoming[key]!==undefined ? {value,polarity:value===null?'unknown':value===false?'denied':'asserted',subject:subject||(retain?previous.subject:null)||'unspecified',sourceTurn:turn} : previous.assertions?.[key]||{value,polarity:'unknown',subject:'unspecified',sourceTurn:null}]));
    state.action=facts.movement==='walk'?'歩行':facts.movement==='drive'?'車の移動':'';
    if(incoming.vehicleChangeQuestion)return clarify('乗り換えは既に行った状況ですか、それとも検討中ですか？現在どの車の中にいるかを確認します。乗り換えの安全性はこの辞書では判断できません。',{},true);
    if(facts.vehicleFlooded===null)return clarify('この辞書は車内の現在の浸水状態を確認できません。分かっている車の状況と、調べたい一般情報を教えてください。',{},true);
    if(facts.road && ['wheelchair','bicycle','rail','stroller'].includes(facts.movement))return clarify('この移動手段に固有の通行方法や安全性を、この辞書では判断できません。自動車や徒歩の原文を代用せず、誰のどの場面か、必要な一般情報を分けて教えてください。',{},true);
    if(facts.movement==='mixed')return clarify('徒歩と車のどちらの場面を調べますか？',{choices:['徒歩です','車です']},true);
    if((topics.includes('大雨・浸水')||facts.floodedRoad===null) && ['walk','drive'].includes(facts.movement) && facts.floodedRoad==null && !facts.vehicleFlooded)return clarify('この辞書は道路の現在の冠水状況を確認できません。一般情報を調べるため、分かっている道路の状況を教えてください。',{choices:['道路が冠水しています','道路は冠水していません']},true);
    const focus=focusFor(topics,facts), prefix=focus?contextText(topics,facts):'';
    if(prefix && !query.startsWith(prefix))query=`${prefix}。${query}`;
    if(query.length>200)return clarify('条件が長くなりました。調べたい状況を200文字以内でまとめ直してください。');
    const scope=resolveRequestScope(directScope,topics);
    if(scope.kind==='unsupported')return {route:'unsupported',scope};
    if(scope.kind==='clarify')return clarify(scope.reason,{choices:scope.choices},true);
    return {route:'retrieve',query,scope,topics,facts,focus,state};
}
