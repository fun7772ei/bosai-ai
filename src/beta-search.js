import corpus from './bosai-data.json' with {type:'json'};
import vectors from './bosai-vectors.json' with {type:'json'};
import {createSearch} from './bosai-search.js';
import {semanticSearch,combineSearch} from './semantic-search.js';
import {assessRequestScope,filterHazard} from './request-scope.js';
const light=createSearch(corpus);
export {corpus};
export const BETA_POLICY=Object.freeze({threshold:.8,lightWeight:.5,limit:5,candidatePool:10});
export function retrieve(query,mode='hybrid',vector,scope=assessRequestScope(query)){
 if(scope.kind==='unsupported'||scope.kind==='clarify')return{scope,results:[]};
 const a=filterHazard(light(query,10),query);
 if(!vector||mode==='light')return{scope,results:a.slice(0,5)};
 const b=filterHazard(semanticSearch(corpus,vectors.vectors,vector,query,{threshold:BETA_POLICY.threshold,limit:88}),query).slice(0,10);
 return{scope,results:mode==='ruri'?b:combineSearch(a,b,{method:'score',weight:BETA_POLICY.lightWeight,limit:5})};
}
