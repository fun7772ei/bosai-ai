import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyAnswerRequest} from '../src/question-intent.js';
import {assessQuestion} from '../src/query-scope.js';
import {Conversation} from '../src/conversation.js';
import {retrieve} from '../src/beta-search.js';
test('unrecorded disaster occurrence dates are not replaced by generic advice',async()=>{
 const queries=['地震の発生日は？','去年の地震は何月何日に発生しましたか？','地震が起きたのはいつですか','いつ津波が発生しましたか','この町の地震が何時に起きるか知りたい'];
 for(const q of queries){
  assert.equal(classifyAnswerRequest(q)?.kind,'incident-timestamp',q);
  assert.equal(assessQuestion(q).kind,'unsupported',q);
  assert.equal((await new Conversation(async text=>({...retrieve(text,'light'),actual:'light',timings:{}})).send(q)).kind,'unsupported',q);
 }
});
test('general disaster procedures and date-like informational titles remain searchable',()=>{
 for(const q of ['地震が起きたときの避難手順は？','地震発生時に何をすればいい？','地震のときに自宅でどう身を守る？','2026年から警戒レベルの名称が変わった？','津波が来たときの避難方法']){
  assert.equal(classifyAnswerRequest(q),null,q);
  assert.notEqual(assessQuestion(q).kind,'unsupported',q);
 }
});
test('a specific current road safety verdict is outside the static dictionary',()=>{
 for(const q of ['この道路は今通れますか','今日の通学路は安全ですか','現在この橋を渡れる？']){
  assert.equal(classifyAnswerRequest(q)?.kind,'current-road-safety',q);
  assert.equal(assessQuestion(q).kind,'unsupported',q);
 }
});
