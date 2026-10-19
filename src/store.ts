import { useSyncExternalStore } from 'react';
import type { CheckIn, Entry, Headache } from './types';

// 本地优先：所有记录先写 localStorage，再异步推到服务端；断网时留在 outbox 里，联网后补推。
const K_ENTRIES = 'hl:entries';
const K_OUTBOX = 'hl:outbox';
const K_CURSOR = 'hl:cursor';
const K_PIN = 'hl:pin';
const K_DEVICE = 'hl:device';

export const deviceId = (() => {
  let id = localStorage.getItem(K_DEVICE);
  if (!id) {
    id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(K_DEVICE, id);
  }
  return id;
})();

export function apiHeaders(pin = state.pin ?? ''): Record<string, string> {
  return {
    'x-pin': pin,
    'x-device': deviceId,
    'x-standalone': matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone ? '1' : '0',
    'content-type': 'application/json',
  };
}

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error' | 'bad_pin';

interface State {
  entries: Record<string, Entry>;
  outbox: string[];
  status: SyncStatus;
  lastSync: number | null;
  pin: string | null;
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

let state: State = {
  entries: load(K_ENTRIES, {}),
  outbox: load(K_OUTBOX, []),
  status: 'idle',
  lastSync: null,
  pin: localStorage.getItem(K_PIN),
};
const listeners = new Set<() => void>();

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  if (patch.entries) localStorage.setItem(K_ENTRIES, JSON.stringify(state.entries));
  if (patch.outbox) localStorage.setItem(K_OUTBOX, JSON.stringify(state.outbox));
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => select(state));
}

export const getState = () => state;

export function newId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function saveEntry(entry: Entry) {
  const e = { ...entry, updatedAt: Date.now() } as Entry;
  set({
    entries: { ...state.entries, [e.id]: e },
    outbox: state.outbox.includes(e.id) ? state.outbox : [...state.outbox, e.id],
  });
  scheduleSync();
  return e;
}

export function deleteEntry(id: string) {
  const e = state.entries[id];
  if (e) saveEntry({ ...e, deleted: true });
}

export function importEntries(list: Entry[]) {
  const entries = { ...state.entries };
  const outbox = new Set(state.outbox);
  for (const e of list) {
    if (!e?.id || !e.kind) continue;
    const cur = entries[e.id];
    if (!cur || cur.updatedAt < e.updatedAt) {
      entries[e.id] = e;
      outbox.add(e.id);
    }
  }
  set({ entries, outbox: [...outbox] });
  scheduleSync();
}

export async function verifyPin(pin: string) {
  const r = await fetch('/api/ping', { headers: apiHeaders(pin) });
  if (r.status === 401) return false;
  if (!r.ok) throw new Error(`服务器错误 ${r.status}`);
  localStorage.setItem(K_PIN, pin);
  set({ pin, status: 'idle' });
  sync();
  return true;
}

export function logout() {
  localStorage.removeItem(K_PIN);
  set({ pin: null });
}

let timer: ReturnType<typeof setTimeout> | undefined;
function scheduleSync() {
  clearTimeout(timer);
  timer = setTimeout(sync, 400);
}

let running: Promise<void> | null = null;
export function sync(): Promise<void> {
  if (!state.pin) return Promise.resolve();
  if (running) return running.then(() => { if (state.outbox.length) return sync(); });
  running = doSync().finally(() => { running = null; });
  return running;
}

async function doSync() {
  const headers = apiHeaders();
  set({ status: 'syncing' });
  try {
    if (state.outbox.length) {
      const pending = state.outbox.map((id) => state.entries[id]).filter(Boolean);
      const sentAt = new Map(pending.map((e) => [e.id, e.updatedAt]));
      const r = await fetch('/api/entries', { method: 'POST', headers, body: JSON.stringify({ entries: pending }) });
      if (r.status === 401) return set({ status: 'bad_pin' });
      if (!r.ok) throw new Error(String(r.status));
      // 推送期间又被改过的记录留在 outbox 里，下一轮再推
      set({ outbox: state.outbox.filter((id) => state.entries[id]?.updatedAt !== sentAt.get(id)) });
    }
    const cursor = Number(localStorage.getItem(K_CURSOR) || 0);
    const r = await fetch(`/api/entries?since=${cursor}`, { headers });
    if (r.status === 401) return set({ status: 'bad_pin' });
    if (!r.ok) throw new Error(String(r.status));
    const data = (await r.json()) as { entries: Entry[]; cursor: number };
    if (data.entries.length) {
      const entries = { ...state.entries };
      for (const e of data.entries) {
        const cur = entries[e.id];
        if (!cur || cur.updatedAt < e.updatedAt) entries[e.id] = e;
      }
      set({ entries });
    }
    localStorage.setItem(K_CURSOR, String(data.cursor));
    set({ status: 'idle', lastSync: Date.now() });
  } catch {
    set({ status: navigator.onLine ? 'error' : 'offline' });
  }
}

export function startAutoSync() {
  sync();
  addEventListener('online', () => sync());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  setInterval(() => { if (!document.hidden) sync(); }, 60_000);
}

// ---- 查询 ----
export function liveEntries(entries: Record<string, Entry>) {
  return Object.values(entries).filter((e) => !e.deleted);
}

export function headaches(entries: Record<string, Entry>) {
  return liveEntries(entries)
    .filter((e): e is Headache => e.kind === 'headache')
    .sort((a, b) => b.start.localeCompare(a.start));
}

export function checkins(entries: Record<string, Entry>) {
  const map: Record<string, CheckIn> = {};
  for (const e of liveEntries(entries)) if (e.kind === 'checkin') map[e.day] = e;
  return map;
}

export function checkinId(day: string) {
  return `checkin-${day}`;
}
