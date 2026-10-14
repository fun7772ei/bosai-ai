import { readFileSync, readdirSync, existsSync } from 'node:fs';
// Linux PSS over the full browser tree. Some managed kernels omit task/*/children,
// so discover children from PPid in /proc/*/status instead of silently counting root only.
export function browserRole(commandLine, isRoot = false) {
  return commandLine.match(/--type=([^\0\s]+)/)?.[1] || (isRoot ? 'browser' : 'other');
}
export function browserMemory(pid) {
  if (process.platform !== 'linux' || !existsSync('/proc')) return { supported: false, pssMiB: null, rssMiB: null, rendererPssMiB: null, rolePssMiB: {}, processes: 0, complete: false, unavailableCount: 0 };
  const children = new Map(), statuses = new Map();
  for (const entry of readdirSync('/proc').filter(name => /^\d+$/.test(name))) {
    try {
      const status = readFileSync(`/proc/${entry}/status`, 'utf8');
      const parent = Number(status.match(/^PPid:\s+(\d+)/m)?.[1]);
      const list = children.get(parent) || []; list.push(Number(entry)); children.set(parent, list); statuses.set(Number(entry), status);
    } catch {}
  }
  const seen = new Set(), unavailable = [];
  const roles = {};
  let pssKiB = 0, rssKiB = 0, processes = 0;
  function visit(current) {
    if (seen.has(current)) return; seen.add(current);
    try {
      const rollup = readFileSync(`/proc/${current}/smaps_rollup`, 'utf8');
      const processPss = Number(rollup.match(/^Pss:\s+(\d+)/m)?.[1] || 0);
      pssKiB += processPss;
      let role = current === pid ? 'browser' : 'other';
      try { role = browserRole(readFileSync(`/proc/${current}/cmdline`, 'utf8'), current === pid); } catch {}
      roles[role] = (roles[role] || 0) + processPss / 1024;
      rssKiB += Number(rollup.match(/^Rss:\s+(\d+)/m)?.[1] || 0); processes++;
    } catch {
      if (existsSync(`/proc/${current}/status`)) { unavailable.push(current); rssKiB += Number(statuses.get(current)?.match(/^VmRSS:\s+(\d+)/m)?.[1] || 0); }
    }
    for (const child of children.get(current) || []) visit(child);
  }
  visit(pid);
  return { pssMiB: pssKiB / 1024, rssMiB: rssKiB / 1024, processes, complete: processes > 0 && unavailable.length === 0, unavailableCount: unavailable.length, rolePssMiB: roles, rendererPssMiB: roles.renderer || 0 };
}
