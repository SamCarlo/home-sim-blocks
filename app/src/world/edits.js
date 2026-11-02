// Edit diffs for saves (13 §7, homeblocks 04). Pure: no DOM and no Node-only APIs (btoa/atob run in browsers and Node).
// An edit set is a Map<index, id> of cells that differ from the generated base volume.
// Packed form = base64 of: varint count, then `count` varint deltas of the sorted indices (first one from 0), then one
// byte per block id in the same order.

import { clone } from './volume.js';

/** Every cell where `current` differs from `base` → Map<index, id> (ascending index order). */
export function diff(base, current) {
  sameSize(base, current);
  const a = base.data, b = current.data;
  const out = new Map();
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) out.set(i, b[i]);
  return out;
}

/** A new volume: `base` with `edits` (Map or packed string) written in. Indices outside the volume are skipped. */
export function apply(base, edits) {
  const v = clone(base);
  for (const [i, id] of asMap(edits)) if (i >= 0 && i < v.data.length) v.data[i] = id;
  return v;
}

/** Map<index, id> → packed base64 string. */
export function pack(edits) {
  const m = asMap(edits);
  const keys = [...m.keys()].sort((x, y) => x - y);
  const bytes = [];
  writeVarint(bytes, keys.length);
  let prev = 0;
  for (const k of keys) {
    if (!Number.isInteger(k) || k < 0) throw new Error(`pack: bad index ${k}`);
    writeVarint(bytes, k - prev);
    prev = k;
  }
  for (const k of keys) bytes.push(m.get(k) & 0xff);
  return toBase64(Uint8Array.from(bytes));
}

/** Packed string → Map<index, id>. '' / null / undefined → an empty Map. Throws on a corrupt string. */
export function unpack(str) {
  const out = new Map();
  if (!str) return out;
  const bytes = fromBase64(str);
  const r = { pos: 0 };
  const count = readVarint(bytes, r);
  const keys = new Array(count);
  let prev = 0;
  for (let n = 0; n < count; n++) { prev += readVarint(bytes, r); keys[n] = prev; }
  if (r.pos + count !== bytes.length) throw new Error('unpack: corrupt edits (length mismatch)');
  for (let n = 0; n < count; n++) out.set(keys[n], bytes[r.pos + n]);
  return out;
}

/** Number of edits in a packed string without unpacking it all (0 for empty). */
export function countEdits(str) {
  if (!str) return 0;
  return readVarint(fromBase64(str.slice(0, 16)), { pos: 0 });
}

/**
 * Carry edits from an old generated base to a new one (an upgrade). An edit is dropped when the renovation changed
 * that cell (`oldBase[i] !== newBase[i]`); kept edits that now equal the new base disappear (no longer a change).
 * Returns {edits, dropped}; `edits` is packed when the input was a packed string, else a Map.
 */
export function rebase(oldBase, newBase, edits) {
  sameSize(oldBase, newBase);
  const o = oldBase.data, nb = newBase.data;
  const kept = new Map();
  let dropped = 0;
  for (const [i, id] of asMap(edits)) {
    if (o[i] !== nb[i]) { dropped++; continue; }
    if (nb[i] !== id) kept.set(i, id);
  }
  return { edits: typeof edits === 'string' ? pack(kept) : kept, dropped };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function asMap(edits) {
  if (edits instanceof Map) return edits;
  if (typeof edits === 'string' || edits == null) return unpack(edits);
  throw new Error('edits must be a Map or a packed string');
}

function sameSize(a, b) {
  if (a.size.x !== b.size.x || a.size.y !== b.size.y || a.size.z !== b.size.z) {
    throw new Error('volumes differ in size');
  }
}

function writeVarint(out, n) {
  while (n >= 0x80) { out.push((n % 0x80) | 0x80); n = Math.floor(n / 0x80); }
  out.push(n);
}

function readVarint(bytes, r) {
  let n = 0, mul = 1;
  for (;;) {
    if (r.pos >= bytes.length) throw new Error('unpack: corrupt edits (truncated varint)');
    const b = bytes[r.pos++];
    n += (b & 0x7f) * mul;
    if (b < 0x80) return n;
    mul *= 0x80;
  }
}

function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(str) {
  // countEdits passes a prefix; trim to whole 4-char groups so atob accepts it.
  const s = str.length % 4 === 0 ? str : str.slice(0, str.length - (str.length % 4));
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
