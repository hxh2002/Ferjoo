import { ref, watch, onScopeDispose, unref } from 'vue';
import { emptyCheckin, snapshot } from '../services/mobile-diagnosis.service.js';

const memory = new Map();
export const draftStorageKey = (accountId, kind = 'checkin') => `ferjoo:mobile:draft:${accountId || 'guest'}:${kind}`;
export function readDraft(accountId, kind, defaults) {
  const key = draftStorageKey(accountId, kind);
  let value = memory.get(key);
  if (!value) {
    try { value = JSON.parse(globalThis.localStorage?.getItem(key) || 'null'); } catch { value = null; }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return snapshot(defaults);
  const restored = snapshot(defaults);
  for (const key of Object.keys(defaults)) {
    if (value[key] !== undefined && typeof value[key] === typeof defaults[key]) restored[key] = snapshot(value[key]);
  }
  return restored;
}
export function writeDraft(accountId, kind, value) {
  const key = draftStorageKey(accountId, kind);
  memory.set(key, snapshot(value));
  try { globalThis.localStorage?.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
export function useCheckinDraft(accountId, { kind = 'checkin', defaults = emptyCheckin } = {}) {
  const draft = ref(defaults());
  const storageAvailable = ref(true);
  let activeAccount;
  const persist = () => { storageAvailable.value = writeDraft(activeAccount, kind, draft.value); };
  const stopAccount = watch(() => unref(accountId), (id) => {
    if (activeAccount !== undefined) persist();
    activeAccount = id || 'guest';
    draft.value = readDraft(activeAccount, kind, defaults());
  }, { immediate: true, flush: 'sync' });
  const stopDraft = watch(draft, persist, { deep: true, flush: 'sync' });
  function replace(value) { draft.value = { ...defaults(), ...snapshot(value) }; persist(); }
  onScopeDispose(() => { persist(); stopAccount(); stopDraft(); });
  return { draft, storageAvailable, persist, replace };
}
