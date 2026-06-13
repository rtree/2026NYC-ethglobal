// Per-wallet off-chain store (plan/010 §16). Two impls behind one interface:
//   - memory   : Map (dev / e2e; default)
//   - firestore: REST (firestore.googleapis.com) via ADC, no SDK
// Docs are scoped users/{uid}/intents/{intentId}; transcript at .../transcript/{turnId}.
import { accessToken, PROJECT_ID } from "./gcp.js";
import type { IntentDoc, TranscriptTurn } from "./intentTypes.js";

export interface Store {
  listIntents(uid: string): Promise<IntentDoc[]>;
  getIntent(uid: string, intentId: string): Promise<IntentDoc | null>;
  putIntent(uid: string, doc: IntentDoc): Promise<void>;
  appendTurn(uid: string, intentId: string, turn: TranscriptTurn): Promise<void>;
  getTranscript(uid: string, intentId: string): Promise<TranscriptTurn[]>;
}

// ---------- memory ----------
class MemoryStore implements Store {
  private intents = new Map<string, IntentDoc>();
  private turns = new Map<string, TranscriptTurn[]>();
  private k(uid: string, id: string) {
    return `${uid}/${id}`;
  }
  async listIntents(uid: string) {
    return [...this.intents.entries()]
      .filter(([k]) => k.startsWith(`${uid}/`))
      .map(([, v]) => v)
      .sort((a, b) => b.createdAt - a.createdAt);
  }
  async getIntent(uid: string, intentId: string) {
    return this.intents.get(this.k(uid, intentId)) ?? null;
  }
  async putIntent(uid: string, doc: IntentDoc) {
    this.intents.set(this.k(uid, doc.intentId), doc);
  }
  async appendTurn(uid: string, intentId: string, turn: TranscriptTurn) {
    const k = this.k(uid, intentId);
    const list = this.turns.get(k) ?? [];
    list.push(turn);
    this.turns.set(k, list);
  }
  async getTranscript(uid: string, intentId: string) {
    return this.turns.get(this.k(uid, intentId)) ?? [];
  }
}

// ---------- firestore (REST) ----------
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// Firestore value <-> JS mapping (only the types we use).
/* eslint-disable @typescript-eslint/no-explicit-any */
function toFs(v: any): any {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  if (typeof v === "object") {
    const fields: Record<string, any> = {};
    for (const [k, val] of Object.entries(v)) fields[k] = toFs(val);
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}
function fromFs(v: any): any {
  if (!v) return null;
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("stringValue" in v) return v.stringValue;
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(fromFs);
  if ("mapValue" in v) {
    const out: Record<string, any> = {};
    for (const [k, val] of Object.entries(v.mapValue.fields ?? {})) out[k] = fromFs(val);
    return out;
  }
  return null;
}
function docToFields(obj: Record<string, any>) {
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = toFs(v);
  return fields;
}
function fieldsToDoc(fields: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields ?? {})) out[k] = fromFs(v);
  return out;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function fsFetch(path: string, init?: RequestInit) {
  const token = await accessToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  return res;
}

class FirestoreStore implements Store {
  private enc(uid: string) {
    return encodeURIComponent(uid);
  }
  async listIntents(uid: string): Promise<IntentDoc[]> {
    const res = await fsFetch(`/users/${this.enc(uid)}/intents`);
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`firestore list ${res.status}`);
    const data = (await res.json()) as { documents?: { fields: Record<string, unknown> }[] };
    const docs = (data.documents ?? []).map((d) => fieldsToDoc(d.fields) as unknown as IntentDoc);
    return docs.sort((a, b) => b.createdAt - a.createdAt);
  }
  async getIntent(uid: string, intentId: string): Promise<IntentDoc | null> {
    const res = await fsFetch(`/users/${this.enc(uid)}/intents/${encodeURIComponent(intentId)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`firestore get ${res.status}`);
    const data = (await res.json()) as { fields: Record<string, unknown> };
    return fieldsToDoc(data.fields) as unknown as IntentDoc;
  }
  async putIntent(uid: string, doc: IntentDoc): Promise<void> {
    const res = await fsFetch(
      `/users/${this.enc(uid)}/intents?documentId=${encodeURIComponent(doc.intentId)}`,
      { method: "POST", body: JSON.stringify({ fields: docToFields(doc as unknown as Record<string, unknown>) }) },
    );
    if (res.status === 409) {
      // exists -> overwrite via PATCH
      const patch = await fsFetch(
        `/users/${this.enc(uid)}/intents/${encodeURIComponent(doc.intentId)}`,
        { method: "PATCH", body: JSON.stringify({ fields: docToFields(doc as unknown as Record<string, unknown>) }) },
      );
      if (!patch.ok) throw new Error(`firestore patch ${patch.status}`);
      return;
    }
    if (!res.ok) throw new Error(`firestore put ${res.status}`);
  }
  async appendTurn(uid: string, intentId: string, turn: TranscriptTurn): Promise<void> {
    const res = await fsFetch(
      `/users/${this.enc(uid)}/intents/${encodeURIComponent(intentId)}/transcript`,
      { method: "POST", body: JSON.stringify({ fields: docToFields(turn as unknown as Record<string, unknown>) }) },
    );
    if (!res.ok) throw new Error(`firestore appendTurn ${res.status}`);
  }
  async getTranscript(uid: string, intentId: string): Promise<TranscriptTurn[]> {
    const res = await fsFetch(`/users/${this.enc(uid)}/intents/${encodeURIComponent(intentId)}/transcript`);
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`firestore transcript ${res.status}`);
    const data = (await res.json()) as { documents?: { fields: Record<string, unknown> }[] };
    return (data.documents ?? [])
      .map((d) => fieldsToDoc(d.fields) as unknown as TranscriptTurn)
      .sort((a, b) => a.at - b.at);
  }
}

let _store: Store | null = null;
export function store(): Store {
  if (_store) return _store;
  const mode = (process.env.INTENTOS_STORE ?? "memory").toLowerCase();
  _store = mode === "firestore" ? new FirestoreStore() : new MemoryStore();
  return _store;
}
