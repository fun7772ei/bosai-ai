import { DEFAULT_MODEL, MODELS, getModel } from './config.js';

export const MODEL_KEY = 'bosai-ai-selected-model';
export const LEGACY_DTYPE_KEY = 'bosai-ai-selected-dtype';
export const dtypeKey = modelKey => `bosai-ai-selected-dtype:${modelKey}`;

export function readDtype(storage, modelKey) {
  const saved = storage.getItem(dtypeKey(modelKey)) ?? (modelKey === DEFAULT_MODEL ? storage.getItem(LEGACY_DTYPE_KEY) : null);
  return ['q4f16', 'q4'].includes(saved) ? saved : 'q4f16';
}
export function readSelection(storage) {
  const saved = storage.getItem(MODEL_KEY);
  const modelKey = MODELS.some(model => model.key === saved) ? saved : DEFAULT_MODEL;
  return { modelKey, dtype: readDtype(storage, modelKey) };
}
export function saveSelection(storage, { modelKey, dtype }) {
  getModel(modelKey);
  if (!['q4f16', 'q4'].includes(dtype)) throw new Error('Unsupported dtype');
  storage.setItem(MODEL_KEY, modelKey);
  storage.setItem(dtypeKey(modelKey), dtype);
  if (modelKey === DEFAULT_MODEL) storage.setItem(LEGACY_DTYPE_KEY, dtype);
}
