// The original 24/38 set is regression data now. Preserve its labels and historical freeze.
// Current engine hashes are checked by the versioned runner, not rewritten into the v1 freeze.
if (!process.argv.some(x=>x.startsWith('--cases='))) process.argv.push('--cases=scripts/evaluation/conversation-final-24.json');
if (!process.argv.some(x=>x.startsWith('--tag='))) process.argv.push('--tag=conversation-v2-regression');
await import('./conversation-v2-browser-check.mjs');
