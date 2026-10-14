// A small, explicit scene schema. Unknown facts stay unknown; rain does not imply a flooded road.
export const hazardPatterns = [
  ['津波', /津波|引き波|引き潮/], ['地震', /地震|揺れ/],
  ['大雨・浸水', /大雨|洪水|冠水|浸水|水没|台風|激しい雨/],
  ['避難生活', /避難所|在宅避難|車中泊/],
];
export const topicsIn = text => hazardPatterns.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
const segmenter = new Intl.Segmenter('ja', {granularity:'word'});
const wordsIn = text => new Set([...segmenter.segment(text.normalize('NFKC'))].filter(s=>s.isWordLike).map(s=>s.segment));
const automobileNouns = new Set(['車','自動車','乗用車','軽自動車','自家用車','クルマ','くるま']);
const mobilityModes = [['wheelchair',/車椅子|車いす|車イス/],['bicycle',/自転車/],['rail',/電車|列車|鉄道/],['stroller',/ベビーカー|乳母車/]];
export function factsIn(text) {
  const facts = {};
  const road = /道路|冠水路|路面|経路/.test(text) || wordsIn(text).has('道');
  if (road) facts.road = true;
  // A shortage of drinking/tap water says nothing about water on a route.
  const route = '(?:道路|冠水路|路面|経路|道)';
  const dryRoad = new RegExp(route+'(?:には|では|は|が|に)?(?:まだ|もう)?(?:冠水|浸水)(?:は)?してい(?:ない|ません)');
  const noRoadWater = new RegExp(route+'(?:の上)?(?:には|は|に|が)?(?:もう)?水[はが]ない');
  const dry = road && (dryRoad.test(text) || noRoadWater.test(text) || /(?:冠水|浸水)していない(?:道路|道|経路)/.test(text));
  if (dry) facts.floodedRoad = false;
  else if (road && /冠水|浸水|水につか|水に浸か|水浸し|膝.*水|ひざ.*水/.test(text)) facts.floodedRoad = true;
  const walk = /徒歩|歩く|歩い|歩行|歩き/.test(text);
  // A parked/abandoned vehicle is not the actor's current mode of travel.
  const leftVehicle = /(?:車|自動車)(?:を|から).*(?:置いて|離れて|降りて)/.test(text);
  const modes = mobilityModes.filter(([,pattern])=>pattern.test(text)).map(([mode])=>mode);
  const autoText = text.replace(/車椅子|車いす|車イス|自転車|電車|列車|鉄道|ベビーカー|乳母車/g,'');
  const autoWords = wordsIn(autoText);
  const automobile = [...autoWords].some(word=>automobileNouns.has(word));
  const drive = (automobile || (!modes.length && autoWords.has('運転'))) && !(walk && leftVehicle);
  if (walk || drive) facts.goal = 'movement';
  if (modes.length) facts.movement = automobile || modes.length>1 ? 'mixed' : modes[0];
  else if (walk || drive) facts.movement = walk && drive ? 'mixed' : walk ? 'walk' : 'drive';
  if (/車.*水没してい(?:ない|ません)|車内.*水.*入ってい(?:ない|ません)/.test(text)) facts.vehicleFlooded = false;
  else if ((!modes.length || automobile) && /水没.*車|車.*水没|車内.*水.*入/.test(autoText)) facts.vehicleFlooded = true;
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
  return {...facts, ...current};
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
