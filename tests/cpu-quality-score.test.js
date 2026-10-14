import test from 'node:test';
import assert from 'node:assert/strict';
import { cases, holdouts, score } from '../scripts/cpu-quality-cases.mjs';

test('quality evaluation rejects observed omissions and extra items, accepting equivalent extraction notation', () => {
  const byId = id => [...cases, ...holdouts].find(item => item.id === id);
  assert.equal(score(byId('copy'), '晴れです。'), false);
  assert.equal(score(byId('copy'), '今日は晴れです。'), true);
  assert.equal(score(byId('summary'), '図書館の入口です。'), false);
  assert.equal(score(byId('food'), 'パンとタオル'), false);
  assert.equal(score(byId('food'), 'パン。'), true);
  assert.equal(score(byId('extract'), '午後3時、公園の入口です。'), true);
  assert.equal(score(byId('extract-alt'), '10:00 駅西口'), true);
  assert.equal(score(byId('extract-alt'), '10:00 駅の西口'), true);
  assert.equal(score(byId('extract-alt'), '11:00 駅西口'), false);
  assert.equal(score(byId('extract'), '午後3時、公園の入口、パン'), false);
  assert.equal(score(byId('absent'), '集合時刻なし'), false);
  assert.equal(score(byId('absent'), ''), false);
});
