import { readFileSync, writeFileSync } from 'node:fs';
const corpus = JSON.parse(readFileSync(process.argv[2] || 'test-results/cpu-model-comparison.json'));
const timing = JSON.parse(readFileSync(process.argv[3] || 'test-results/cpu-model-timing.json'));
const median = values => { const sorted = values.filter(value => typeof value === 'number').sort((a,b) => a-b); return sorted.length ? (sorted[(sorted.length-1)>>1] + sorted[sorted.length>>1])/2 : null; };
const summary = corpus.models.map(result => {
  const measured = timing.models.find(item => item.model.key === result.model.key);
  const groups = Object.fromEntries(['common32','common64','recommended32'].map(group => {
    const samples = result.samples.filter(sample => sample.group === group);
    const original = samples.filter(sample => !['extract-shelter','copy-items','extract-closed','absent-bosai'].includes(sample.caseId));
    return [group, { total: samples.length, passed: samples.filter(sample => sample.pass).length, original12Passed: original.filter(sample => sample.pass).length, disaster4Passed: samples.filter(sample => sample.pass).length-original.filter(sample => sample.pass).length, medianTtftMs: median(samples.map(sample => sample.ttftMs)), medianElapsedMs: median(samples.map(sample => sample.elapsedMs)), medianTokensPerSecond: median(samples.map(sample => sample.tokensPerSecond)), medianDecodeTokensPerSecond: median(samples.map(sample => sample.decodeTokensPerSecond)), capped: samples.filter(sample => sample.outputLimitReached).length }];
  }));
  const peaks = Object.values(measured?.memory?.peaks || {});
  const peak = peaks.reduce((best, sample) => !best || sample.pssMiB > best.pssMiB ? sample : best, null);
  return { key: result.model.key, bytes: result.model.bytes, status: result.status, groups, firstNativeLoadMs: result.loads[0]?.loadMs, reloadNativeLoadMs: result.loads[1]?.loadMs, firstBlobMs: result.loads[0]?.blobMs, timingStatus: measured?.status, memoryPeak: peak, memoryBaseline: measured?.memory?.baseline, memoryIncompleteSamples: measured?.memory?.incompleteSamples || 0, lengths: measured?.lengthBenchmarks, stopped: result.stop?.stopped, reloaded: Boolean(result.afterReload?.text?.trim()), thinkingCharacters: result.samples.reduce((n, sample) => n + sample.reasoningCharacters, 0) };
});
writeFileSync('test-results/cpu-model-summary.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
