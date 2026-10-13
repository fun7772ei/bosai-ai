// ErrorEvent fields are not enumerable and Safari may omit message entirely.
export function workerError(error, context = {}) {
  return {
    ...context,
    name: error?.name || error?.error?.name || 'WorkerError',
    message: error?.message || error?.error?.message || (typeof error === 'string' && error) || 'Workerが起動・実行できませんでした。詳細を取得できません。診断JSONを保存してください。',
    stack: error?.stack || error?.error?.stack || null,
    filename: error?.filename || null,
    lineno: error?.lineno || null,
    colno: error?.colno || null,
  };
}
