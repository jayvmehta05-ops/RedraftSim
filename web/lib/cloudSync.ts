/**
 * Per-user cloud sync of everything the site keeps in the browser.
 *
 * - On sign-in, cloud rows newer than what this browser last saw are pulled into localStorage (saved leagues
 *   are merged, so a league on this device but not yet in the cloud is kept), then the page reloads once.
 * - While signed in, changed keys are pushed every few seconds.
 * - On sign-out, the synced keys are wiped from this browser so the next person sees nothing of yours.
 * - If a different account signs in on the same browser, the previous account's local copy is wiped first.
 * ESPN login cookies are never synced; they stay on the device that entered them.
 */
import type { SupabaseClient, User } from "@supabase/supabase-js";

export const SYNCED_KEYS = [
  "redraft27.savedLeagues", "redraft27.league", "redraft27.myManagers", "redraft27.myManager",
  "redraft27.profiles", "redraft27.toggles", "redraft27.keepers", "redraft27.keeperMode", "redraft.welcomeDismissed",
  "redraft27.botTuning",
];
const DEVICE_ONLY_ON_SIGNOUT = ["redraft27.espnAuth"];
const META_KEY = "redraft.syncMeta"; // { key: last cloud updated_at this browser has }
const USER_KEY = "redraft.syncedUser";
const RELOAD_GUARD = "redraft.justSynced";
const TABLE = "user_store";

type Row = { key: string; value: string; updated_at: string };

const read = (k: string) => {
  try { return localStorage.getItem(k); } catch { return null; }
};
const write = (k: string, v: string | null) => {
  try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage unavailable */ }
};
const meta = (): Record<string, string> => { try { return JSON.parse(read(META_KEY) ?? "{}"); } catch { return {}; } };

function wipeLocal() {
  [...SYNCED_KEYS, ...DEVICE_ONLY_ON_SIGNOUT, META_KEY, USER_KEY].forEach((k) => write(k, null));
}

/** Union of two savedLeagues maps (cloud wins on the same league). */
function mergeLeagues(cloud: string | null, local: string | null): string | null {
  try {
    const c = cloud ? JSON.parse(cloud) : {};
    const l = local ? JSON.parse(local) : {};
    return JSON.stringify({ ...l, ...c });
  } catch {
    return cloud ?? local;
  }
}

/** Pull on sign-in. Returns true if this browser's data changed (caller reloads). */
export async function pullOnSignIn(sb: SupabaseClient, user: User): Promise<boolean> {
  const previous = read(USER_KEY);
  if (previous && previous !== user.id) wipeLocal(); // another account used this browser
  const { data, error } = await sb.from(TABLE).select("key,value,updated_at").eq("user_id", user.id);
  if (error) throw error;
  const rows = (data ?? []) as Row[];
  const m = meta();
  let changed = false;
  for (const row of rows) {
    if (!SYNCED_KEYS.includes(row.key)) continue;
    if (m[row.key] && m[row.key] >= row.updated_at) continue; // we already have this version
    const local = read(row.key);
    const next = row.key === "redraft27.savedLeagues" ? mergeLeagues(row.value, local) : row.value;
    if (next !== local) {
      write(row.key, next);
      changed = true;
    }
    m[row.key] = row.updated_at;
  }
  write(META_KEY, JSON.stringify(m));
  write(USER_KEY, user.id);
  return changed;
}

let lastPushed: Record<string, string | null> = {};

/** Push keys that changed since the last push. */
export async function pushChanges(sb: SupabaseClient, user: User): Promise<number> {
  const m = meta();
  const upserts: { user_id: string; key: string; value: string }[] = [];
  const deletes: string[] = [];
  for (const k of SYNCED_KEYS) {
    const v = read(k);
    if (k in lastPushed && lastPushed[k] === v) continue;
    if (!(k in lastPushed) && v == null && !m[k]) { lastPushed[k] = v; continue; }
    if (v == null) deletes.push(k);
    else upserts.push({ user_id: user.id, key: k, value: v });
  }
  if (upserts.length) {
    const { data, error } = await sb.from(TABLE).upsert(upserts, { onConflict: "user_id,key" }).select("key,updated_at");
    if (error) throw error;
    for (const r of (data ?? []) as { key: string; updated_at: string }[]) m[r.key] = r.updated_at;
    upserts.forEach((u) => (lastPushed[u.key] = u.value));
  }
  if (deletes.length) {
    const { error } = await sb.from(TABLE).delete().eq("user_id", user.id).in("key", deletes);
    if (error) throw error;
    deletes.forEach((k) => { lastPushed[k] = null; delete m[k]; });
  }
  write(META_KEY, JSON.stringify(m));
  return upserts.length + deletes.length;
}

export function primeLastPushed() {
  lastPushed = {};
}

export async function signOutAndWipe(sb: SupabaseClient) {
  await sb.auth.signOut();
  wipeLocal();
  lastPushed = {};
}

/** Delete this user's cloud copy (the Google sign-in itself stays). */
export async function deleteCloudData(sb: SupabaseClient, user: User) {
  const { error } = await sb.from(TABLE).delete().eq("user_id", user.id);
  if (error) throw error;
}

export function reloadOnce(): boolean {
  try {
    if (sessionStorage.getItem(RELOAD_GUARD)) {
      sessionStorage.removeItem(RELOAD_GUARD);
      return false;
    }
    sessionStorage.setItem(RELOAD_GUARD, "1");
  } catch { /* ignore */ }
  window.location.reload();
  return true;
}
