// ErrorEvent fields are not enumerable and Safari may omit message entirely.
export function workerError(error, context = {}) {
  const name = error?.name || error?.error?.name || 'WorkerError';
  const fallback = name === 'QuotaExceededError' ? 'モデル保存領域の容量制限で失敗しました（QuotaExceededError）。' : 'Workerが起動・実行できませんでした。詳細を取得できません。診断JSONを保存してください。';
  return {
    ...context,
    name,
    message: error?.message || error?.error?.message || (typeof error === 'string' && error) || fallback,
    stack: error?.stack || error?.error?.stack || null,
    filename: error?.filename || null,
    lineno: error?.lineno || null,
    colno: error?.colno || null,
  };
}
