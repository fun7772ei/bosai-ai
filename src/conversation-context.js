// A small, explicit scene schema. Unknown facts stay unknown; rain does not imply a flooded road.
export const hazardPatterns = [
  ['津波', /津波|引き波|引き潮/], ['地震', /地震|揺れ/],
  ['大雨・浸水', /大雨|洪水|冠水|浸水|水没|台風|激しい雨/],
  ['避難生活', /避難所|在宅避難|車中泊/],
];
export const topicsIn = text => hazardPatterns.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
export function factsIn(text) {
  const facts = {};
  const road = /道路|冠水路|路面|道[がはをの]|道.*水につか|水浸し.*道/.test(text);
  if (road) facts.road = true;
  const dry = /冠水してい(?:ない|ません)|冠水はしていない|浸水してい(?:ない|ません)|水[はが]ない/.test(text);
  if (dry) facts.floodedRoad = false;
  else if (road && /冠水|浸水|水につか|水に浸か|水浸し|膝.*水|ひざ.*水/.test(text)) facts.floodedRoad = true;
  const walk = /徒歩|歩く|歩い|歩行|歩き/.test(text);
  // A parked/abandoned vehicle is not the actor's current mode of travel.
  const leftVehicle = /(?:車|自動車)(?:を|から).*(?:置いて|離れて|降りて)/.test(text);
  const drive = /車|自動車|運転|車両/.test(text) && !(walk && leftVehicle);
  if (walk || drive) facts.goal = 'movement';
  if (walk || drive) facts.movement = walk && drive ? 'mixed' : walk ? 'walk' : 'drive';
  if (/車.*水没してい(?:ない|ません)|車内.*水.*入ってい(?:ない|ません)/.test(text)) facts.vehicleFlooded = false;
  else if (/水没.*車|車.*水没|車内.*水.*入/.test(text)) facts.vehicleFlooded = true;
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
