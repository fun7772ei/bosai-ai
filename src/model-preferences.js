import { DEFAULT_MODEL, PREFERRED_MODEL, MODELS, getModel, modelDtypes } from './config.js';

export const MODEL_KEY = 'bosai-ai-selected-model';
export const LEGACY_DTYPE_KEY = 'bosai-ai-selected-dtype';
export const dtypeKey = modelKey => `bosai-ai-selected-dtype:${modelKey}`;

export function readDtype(storage, modelKey) {
  const saved = storage.getItem(dtypeKey(modelKey)) ?? (modelKey === DEFAULT_MODEL ? storage.getItem(LEGACY_DTYPE_KEY) : null);
  return modelDtypes(modelKey).includes(saved) ? saved : modelDtypes(modelKey)[0];
}
export function readSelection(storage) {
  const saved = storage.getItem(MODEL_KEY);
  const fallback = storage.getItem(LEGACY_DTYPE_KEY) !== null ? DEFAULT_MODEL : PREFERRED_MODEL;
  const modelKey = MODELS.some(model => model.key === saved) ? saved : fallback;
  return { modelKey, dtype: readDtype(storage, modelKey) };
}
export function saveSelection(storage, { modelKey, dtype }) {
  getModel(modelKey);
  if (!modelDtypes(modelKey).includes(dtype)) throw new Error('Unsupported dtype');
  storage.setItem(MODEL_KEY, modelKey);
  storage.setItem(dtypeKey(modelKey), dtype);
  if (modelKey === DEFAULT_MODEL) storage.setItem(LEGACY_DTYPE_KEY, dtype);
}
