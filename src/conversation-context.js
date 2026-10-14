// A small, explicit scene schema. Unknown facts stay unknown; rain does not imply a flooded road.
export const hazardPatterns = [
  ['津波', /津波|引き波|引き潮/], ['地震', /地震|揺れ/],
  ['大雨・浸水', /大雨|洪水|冠水|浸水|水没|台風|激しい雨/],
  ['避難生活', /避難所|在宅避難|車中泊/],
];
export const topicsIn = text => hazardPatterns.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
const segmenter = new Intl.Segmenter('ja', {granularity:'word'});
const wordsIn = text => new Set([...segmenter.segment(text.normalize('NFKC'))].filter(s=>s.isWordLike).map(s=>s.segment));
const automobileNouns = new Set(['車','自動車','乗用車','軽自動車','自家用車','クルマ','くるま','車両','マイカー','トラック','バス','タクシー','四輪車']);
export const vehicleNoun = '(?:'+[...automobileNouns].sort((a,b)=>b.length-a.length).join('|')+')';
const roadNouns = new Set(['道','道路','路面','経路','歩道','車道','通学路','通勤路','側道','私道','国道','県道','市道','農道','林道','一般道','高速道路','有料道路','幹線道路','生活道路','避難経路','地下道','アンダーパス']);
const mobilityModes = [['wheelchair',/車椅子|車いす|車イス/],['bicycle',/自転車/],['rail',/電車|列車|鉄道|新幹線|地下鉄|汽車/],['stroller',/ベビーカー|乳母車/]];
// Predicate polarity is tied to a route mention, not to an arbitrary 'ない' elsewhere.
const floodTerm = '(?:冠水|浸水|水浸し)';
const negativePredicate = '(?:(?:は|が|も)?(?:して(?:い|おり)?(?:ません|ない|なかった)|したこと(?:は|が)(?:ありません|ない)|ありません|ない|無い|なし|無し)|(?:では|じゃ)(?:ない|ありません))';
const negativeFlood = new RegExp(floodTerm+negativePredicate,'g');
const uncertainFlood = new RegExp(floodTerm+'(?:している|していない|した)?(?:の)?か(?:どうか)?[^、。]{0,8}(?:不明|分から|わから|分かりません|わかりません)','g');
const mask = (text,pattern) => text.replace(pattern,span=>' '.repeat(span.length));
export function factsIn(input) {
  const text=input.normalize('NFKC'), facts={};
  const roadText=mask(text,/路面電車|電車|列車|鉄道|新幹線|地下鉄|汽車/g);
  const segments=[...segmenter.segment(roadText)];
  const boundaries=new Set(segments.flatMap(s=>[s.index,s.index+s.segment.length]));
  const roadLexicon=new RegExp([...roadNouns,'冠水路'].sort((a,b)=>b.length-a.length).join('|'),'g');
  const routes=[...roadText.matchAll(roadLexicon)].filter(m=>boundaries.has(m.index)&&boundaries.has(m.index+m[0].length)).map(m=>({index:m.index,word:m[0]}));
  const road=routes.length>0;
  if(road)facts.road=true;
  const routePrefix='^(?:の|には|では|は|が|に|も)?(?:まだ|もう|すでに)?';
  const routeNegative=new RegExp(routePrefix+floodTerm+negativePredicate);
  const roadWaterAbsent=new RegExp('^(?:の上)?(?:には|は|に|が)?(?:もう)?水(?:は|が)(?:ありません|ない|無い|なし)');
  const negativeModifier=new RegExp(floodTerm+negativePredicate+'(?:の)?$');
  const questionFlood=new RegExp(floodTerm+'(?:しています|している|してます|していた|した|です|'+negativePredicate+')(?:(?:の|ん)?(?:です|でしょう|だろう)?(?:か(?!ら|つ)|[?？])|よね[?？]?)');
  let uncertain=questionFlood.test(text)||uncertainFlood.test(text)||/(?:冠水|浸水)[^、。]{0,15}(?:ない|ません)(?:とは言えない|わけではない|とは限らない)/.test(text);
  uncertainFlood.lastIndex=0;
  const soakedAbsent=/^(?:(?:は|が|には)[^、。！？]{0,16})?水に(?:つか|浸か)って(?:い)?(?:ない|ません)/;
  const dry=routes.some(r=>soakedAbsent.test(text.slice(r.index+r.word.length))||routeNegative.test(text.slice(r.index+r.word.length))||roadWaterAbsent.test(text.slice(r.index+r.word.length))||negativeModifier.test(text.slice(0,r.index)));
  // Mask denied/unknown predicates before looking for explicit affirmative assertions.
  // Mere occurrence of 冠水/浸水 is no longer enough to manufacture a positive fact.
  let affirmed=mask(mask(text,negativeFlood),uncertainFlood);
  affirmed=affirmed.replace(/非(?:冠水|浸水)/g,span=>' '.repeat(span.length));
  const wetPredicate=new RegExp(routePrefix+'(?:冠水|浸水)(?:しています|している|してます|していて|しており|しました|した|です|だ|(?=[、。！？]|$))');
  const soakedPredicate=new RegExp('^(?:(?:は|が|には)[^、。！？]{0,16})?水に(?:つか|浸か)(?:っています|っている|ってます|っていて|っており|りました|った|る)');
  const wetModifier=/(?:冠水|浸水)(?:した|している|してしまった)?$|水浸しの?$|水に(?:つか|浸か)(?:った|っている)(?:の)?$/;
  const questionTail=/^(?:な)?(?:の|ん)?(?:です|でしょう|だろう)?(?:か(?!ら|つ)|[?？])/;
  // Apply the same question test to water-presence predicates, not only 冠水/浸水.
  uncertain ||= routes.some(r=>{
    const suffix=text.slice(r.index+r.word.length);
    return [routeNegative,roadWaterAbsent,soakedAbsent,wetPredicate,soakedPredicate].some(pattern=>{
      const match=pattern.exec(suffix);
      return !!match&&questionTail.test(suffix.slice(match[0].length));
    })||((negativeModifier.test(text.slice(0,r.index))||wetModifier.test(text.slice(0,r.index)))&&questionTail.test(suffix));
  });
  const wet=routes.some(r=>wetPredicate.test(affirmed.slice(r.index+r.word.length))||soakedPredicate.test(affirmed.slice(r.index+r.word.length))||wetModifier.test(affirmed.slice(0,r.index))||(r.word==='冠水路'&&affirmed.slice(r.index,r.index+3)==='冠水路'&&!/非$/.test(affirmed.slice(0,r.index))));
  if(uncertain||(dry&&wet))facts.floodedRoad=null;
  else if(dry)facts.floodedRoad=false;
  else if(wet)facts.floodedRoad=true;
  else if(/冠水|浸水|水浸し|水につか|水に浸か/.test(text))facts.floodedRoad=null;
  const walk = /徒歩|歩く|歩い|歩行|歩き/.test(text);
  // A parked/abandoned vehicle is not the actor's current mode of travel.
  const leftVehicle = new RegExp('(?:'+[...automobileNouns].join('|')+')(?:を|から).*(?:置いて|離れて|降りて)').test(text);
  const modes = mobilityModes.filter(([,pattern])=>pattern.test(text)).map(([mode])=>mode);
  const autoText = text.replace(/車椅子|車いす|車イス|自転車|電車|列車|鉄道|新幹線|地下鉄|汽車|ベビーカー|乳母車/g,'');
  const autoWords = wordsIn(autoText);
  const automobile = [...autoWords].some(word=>automobileNouns.has(word)&&!(word==='車両'&&modes.includes('rail')));
  const drive = (automobile || (!modes.length && autoWords.has('運転'))) && !(walk && leftVehicle);
  if (walk || drive) facts.goal = 'movement';
  if (modes.length) facts.movement = automobile || modes.length>1 ? 'mixed' : modes[0];
  else if (walk || drive) facts.movement = walk && drive ? 'mixed' : walk ? 'walk' : 'drive';
  const vehicleDenial=new RegExp(vehicleNoun+'[^、。]*水没'+negativePredicate+'|(?:水没|浸水)'+negativePredicate+'(?:の)?'+vehicleNoun+'|(?:水没|浸水)(?:した)?'+vehicleNoun+negativePredicate+'|車内[^、。]*水[^、。]*入って(?:い)?(?:ない|ません)');
  const vehicleAffirmation=new RegExp('水没(?:した|している|してしまった)?'+vehicleNoun+'|'+vehicleNoun+'[^、。]*水没(?:しています|している|してます|していた|した|です)?|車内[^、。]*水[^、。]*入(?:っています|っている|ってます|りました|った|る)');
  const denial=vehicleDenial.exec(autoText), assertion=vehicleAffirmation.exec(autoText);
  const vehicleQuestion=[denial,assertion].some(match=>match&&questionTail.test(autoText.slice(match.index+match[0].length)));
  if(vehicleQuestion) facts.vehicleFlooded=null;
  else if(denial) facts.vehicleFlooded=false;
  else if((!modes.length||automobile)&&assertion) facts.vehicleFlooded=true;
  // Identity nouns and transition verbs are independent event cues: conversational
  // answers often omit the noun. A denied event never changes the current vehicle.
  const eventTails=[...autoText.matchAll(new RegExp('(?:別の|他の|違う|新しい)'+vehicleNoun,'g'))]
    .map(match=>autoText.slice(match.index+match[0].length));
  for(const match of autoText.matchAll(/乗り換え|乗換え|乗り替え/g))eventTails.push(autoText.slice(match.index));
  for(const directTail of eventTails){
    const tail=directTail.split(/[、。！？?]/)[0];
    const transition=/(?:乗り換|乗換|乗り替)/.exec(tail);
    const verbTail=transition?tail.slice(transition.index):'';
    const deniedAction=/(?:て|で)(?:は|も)?(?:い|おり)?(?:ません|ない|なかった)|(?:え|わ|し)(?:ません(?:でした)?|ない|なかった|ず|ぬ)|(?:つもり|予定|意思)(?:は|が)?(?:ありません|ない)|(?:の)?では(?:ない|ありません|なく)|わけではない/.test(verbTail);
    const questionedAction=/(?:か$|かどうか|不明|分から|わから)/.test(verbTail);
    const directDenied=new RegExp('^'+negativePredicate).test(tail)||/^(?:で(?:は)?|じゃ)(?:ない|ありません|なかった|なく)/.test(tail);
    const intendedAction=/(?:たい|つもり|予定|べき|ほうが)/.test(tail);
    const completedAction=/(?:乗り換え|乗換え|乗り替え)(?:ました|た(?!い|ら)|て(?:います|いる|ます)|済み)/.test(verbTail);
    if(questionTail.test(directTail)||questionedAction||(!directDenied&&!deniedAction&&(intendedAction||(transition&&!completedAction))))facts.vehicleChangeQuestion=true;
    else if(!directDenied&&!deniedAction)facts.vehicleChanged=true;
  }
  if (/靴|長靴|サンダル|履物/.test(text) && !/(?:進ん|歩い|渡っ).*(?:いい|よい|大丈夫|安全|問題ない)/.test(text)) facts.goal = 'footwear';
  if (/(?:高台|高い(?:所|場所)|丘|高所).*(?:間に合わ|時間が(?:ない|ありませ)|時間.*足り|たどり着けない|行けない)|(?:時間がない|間に合わない).*(?:高台|高い場所)/.test(text)) facts.unreachableHeight = true;
  if (/高台.*(?:時間はある|間に合う)|間に合わないわけではない/.test(text)) facts.unreachableHeight = false;
  return facts;
}
export function mergeFacts(previous, current, excluded) {
  const facts = {...previous};
  for (const span of excluded) {
    const denied = factsIn(span);
    for (const key of Object.keys(denied)) delete facts[key];
    if (denied.movement === 'drive') delete facts.vehicleFlooded;
  }
  // A vehicle-specific scene does not follow a person onto a new travel mode.
  // An explicitly restated current vehicle condition remains available.
  if ((current.vehicleChanged || (current.movement && current.movement !== 'drive')) && current.vehicleFlooded === undefined) delete facts.vehicleFlooded;
  const merged = {...facts, ...current};
  delete merged.vehicleChangeQuestion;
  delete merged.vehicleChanged; // An event, not a durable property of this vehicle.
  return merged;
}
export function focusFor(topics, facts) {
  if (topics.includes('津波') && facts.unreachableHeight === true) return 'tsunami-time';
  if (!topics.includes('津波') && facts.vehicleFlooded) return 'vehicle-escape';
  if (!topics.includes('津波') && facts.floodedRoad === true) {
    if (facts.goal === 'footwear') return 'flood-footwear';
    if (facts.movement === 'walk') return 'flood-walk';
    if (facts.movement === 'drive') return 'flood-drive';
  }
  return null;
}
export function contextText(topics, facts) {
  return [topics.join('・'), facts.road && '道路', facts.floodedRoad === true && '道路が冠水しています',
    facts.floodedRoad === false && '道路は冠水していません',
    facts.movement === 'walk' && '徒歩で移動', facts.movement === 'drive' && '車で移動',
    facts.vehicleFlooded && '車内へ水が入っています', facts.unreachableHeight && '高台へ行く時間がありません',
  ].filter(Boolean).join('。');
}
