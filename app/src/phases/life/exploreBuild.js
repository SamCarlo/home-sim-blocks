// Building inside Explore (13 §9, blocks task 17). Browser only. The 9-slot hotbar (`.life-hotbar`: 1–9 and scroll pick a
// slot, the chosen block's name is shown and announced), break (left click / B) and place (right click, Shift + click / P)
// on the crosshair's face, every action checked by the pure world/buildRules.js `canEdit`; a refusal shows a short toast.
// Each edit updates the rendered world at once and goes into an in-memory edits Map (volume index → id, world/edits.js
// format). Task 18: starts from the saved edits (`saved` + `savedBase`), reports every change through `onEdit(edits)` (the
// caller batches it into the store), warns "Your world is almost full" at 90 % of WORLD.maxEdits and refuses new edits at the cap.
import { h } from '../../ui/dom.js';
import { BLOCK_BUILD } from '../../config.js';
import { fullness } from '../../world/worldState.js';
import { blockById } from '../../world/blocks.js';
import { idx } from '../../world/volume.js';
import { canEdit, hotbarFor, placeCell } from '../../world/buildRules.js';

const FULL_TEXT = 'Your world is full. Break something first.';
const TEX = new URL('../../../vendor/kenney-voxel/', import.meta.url);

/**
 * createBuilder({world, contract, location, player, status}) → {el (hotbar), toast (element), slot(), select(i), cycle(step),
 * breakBlock(), placeBlock(), onKey(e) → bool, edits(), dispose()}. `player` is the live firstPerson player (feet + body),
 * `status` an aria-live element for announcements. `saved` (Map index → id) and `savedBase` (Map index → generated id) carry
 * the builds already in the save; `onEdit(edits)` runs after every change.
 */
export function createBuilder({ world, contract, location, player, status, saved = null, savedBase = null, onEdit = null }) {
  const volume = world.volume;
  const bar = hotbarFor(location);
  const allowed = new Set(bar);
  const edits = new Map(saved ?? []);   // volume index → id now (only cells that differ from the world as generated)
  const base = new Map(savedBase ?? []); // volume index → the generated id, kept so undoing an edit drops it from `edits`
  let sel = 0, toastTimer = 0;

  const name = h('p', { class: 'life-hotbar-name', 'aria-hidden': 'true' });
  const slots = bar.map((id, i) => {
    const b = blockById(id);
    const swatch = h('span', { class: 'life-hotbar-swatch', 'aria-hidden': 'true' });
    swatch.style.backgroundImage = `url(${new URL(b.faces.side || b.faces.top, TEX).href})`;
    if (b.tint) swatch.style.backgroundColor = b.tint;
    return h('button', { class: 'life-hotbar-slot', type: 'button', 'aria-pressed': 'false', 'data-id': String(id), title: b.label,
      'aria-label': `${i + 1}: ${b.label}`, onClick: () => select(i, true) },
    swatch, h('span', { class: 'life-hotbar-key', 'aria-hidden': 'true' }, String(i + 1)));
  });
  const el = h('div', { class: 'life-hotbar', role: 'toolbar', 'aria-label': 'Blocks to place' }, name, h('div', { class: 'life-hotbar-row' }, ...slots));
  const fullNote = h('p', { class: 'life-hotbar-full', role: 'status', hidden: true }, 'Your world is almost full');
  el.prepend(fullNote);
  const toast = h('div', { class: 'life-explore-toast', role: 'status', 'aria-live': 'polite', hidden: true });

  function select(i, announce = false) {
    sel = ((i % bar.length) + bar.length) % bar.length;
    slots.forEach((s, j) => { s.setAttribute('aria-pressed', String(j === sel)); s.classList.toggle('is-selected', j === sel); });
    name.textContent = blockById(bar[sel]).label;
    el.dataset.selected = String(bar[sel]);
    if (announce) status.textContent = `${blockById(bar[sel]).label} selected`;
  }
  select(0);

  function say(text) {
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, BLOCK_BUILD.toastMs);
  }
  function showFullness() {
    const f = fullness(edits.size);
    fullNote.hidden = !f.almostFull;
    el.dataset.full = f.full ? 'full' : f.almostFull ? 'almost' : '';
  }
  showFullness();
  /** Write one cell. False (and the 13 §7 toast) when it would add an edit to a full world. */
  function record(c, id) {
    const i = idx(volume, c.x, c.y, c.z);
    const gen = base.has(i) ? base.get(i) : world.getBlock(c.x, c.y, c.z);
    if (!edits.has(i) && gen !== id && fullness(edits.size).full) { say(FULL_TEXT); return false; }
    if (!base.has(i)) base.set(i, gen);
    world.setBlock(c.x, c.y, c.z, id);
    if (base.get(i) === id) edits.delete(i); else edits.set(i, id);
    showFullness();
    onEdit?.(edits);
    return true;
  }
  const aim = () => world.pick(0, 0, BLOCK_BUILD.reach);

  /** Break the block under the crosshair. Returns the canEdit result plus the cell ({ok:false, reason:'empty'} for no block). */
  function breakBlock() {
    const hit = aim();
    if (!hit) { say('Nothing in reach. Move closer.'); return { ok: false, reason: 'empty' }; }
    const c = { x: hit.x, y: hit.y, z: hit.z };
    const r = canEdit(contract, c, 'break', hit.id, { player });
    if (!r.ok) { say(r.text); return { ...r, cell: c }; }
    const label = blockById(hit.id)?.label ?? 'Block';
    if (!record(c, 0)) return { ok: false, reason: 'full', cell: c };
    status.textContent = `${label} removed`;
    return { ...r, cell: c };
  }
  /** Place the selected block on the face under the crosshair. */
  function placeBlock() {
    const hit = aim();
    if (!hit) { say('Nothing in reach to build on. Move closer.'); return { ok: false, reason: 'empty' }; }
    const c = placeCell(hit), id = bar[sel];
    const r = canEdit(contract, c, 'place', id, { player, allowed });
    if (!r.ok) { say(r.text); return { ...r, cell: c }; }
    if (!record(c, id)) return { ok: false, reason: 'full', cell: c };
    status.textContent = `${blockById(id).label} placed`;
    return { ...r, cell: c };
  }
  /** Keydown handler for 1–9, B and P. True when it used the key. */
  function onKey(e) {
    if (e.type !== 'keydown' || e.repeat) return false;
    const m = /^Digit([1-9])$/.exec(e.code);
    if (m && Number(m[1]) <= bar.length) { select(Number(m[1]) - 1, true); return true; }
    if (e.code === 'KeyB') { breakBlock(); return true; }
    if (e.code === 'KeyP') { placeBlock(); return true; }
    return false;
  }

  return {
    el, toast,
    slot: () => ({ index: sel, id: bar[sel], label: blockById(bar[sel]).label }),
    bar: () => [...bar],
    select: (i) => select(i, true),
    cycle: (step) => select(sel + step, true),
    breakBlock, placeBlock, onKey,
    /** The session's edits, volume index → block id (13 §7 diff format; saved in task 18). */
    edits: () => edits,
    dispose() { clearTimeout(toastTimer); },
  };
}
