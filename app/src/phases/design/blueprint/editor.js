// Blueprint editor screen (07 §5, tasks 39–40): an SVG plan of the lot with select / move / resize / draw / delete,
// door and window tools, the keyboard, zoom and pan, 50-step undo/redo, templates, roof/exterior/yard panels, the
// budget bar and a status bar. The working blueprint is a draft in state.home.blueprint. The 3D split view (task 41,
// view3d.js) rebuilds after each change; Move in takes an optional pet. Upgrade mode (blocks task 21, `state.upgrade` set):
// the draft is a copy in `state.upgrade.blueprint`, the budget panel shows the renovation cost and cash, Renovate commits.
import { h } from '../../../ui/dom.js';
import { confirmDialog } from '../../../ui/modal.js';
import { formatMoney } from '../../../util/format.js';
import { byId } from '../../../data/locations/index.js';
import { section } from '../pickerParts.js';
import { ROOM_TYPES, ROOM_TYPE_IDS, addRoom, buildArea, createBlueprint, findFreeSpot, footprintArea, lotOf,
  removeRoom, resizeRoom, moveRoom, roomAt, roomName, roomArea, setRoomType, toggleOpening, editWindow } from './model.js';
import { moveYardItem, removeYardItem, YARD_KINDS } from './yard.js';
import { buildContext, moveInBuild } from './moveIn.js';
import { createBlueprintView } from './view3d.js';
import { PET_LABELS } from '../houseModel.js';
import { seedFor } from '../../../util/rng.js';
import { budgetPanel, checksPanel, outsidePanel, renovationPanel, yardPanel } from './panels.js';
import { styleFamily } from '../../../data/styleFamilies.js';
import { problemRoomIds, validateBlueprint } from './validate.js';
import { TEMPLATES, TEMPLATE_IDS, applyTemplate } from './templates.js';
import { applyRoomAction, createHistory, drawRect, drawable, keyAction, moveRect, resizeRect, zoomView } from './tools.js';
import { fitView, lotMarkup, roomsMarkup, roomsView } from './canvas.js';
import { BLUEPRINT, DESIGN } from '../../../config.js';
import { renovationContext, renovationDraft, renovationQuote, afterRenovation, hasChanges, commitRenovation } from '../../../life/renovation.js';
import { cash } from '../../../finance/ledger.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const HANDLE_PX = 11;

/** Mount the blueprint editor; returns unmount. */
export async function mount(container, { store }) {
  const state = store.getState();
  const loc = byId[state.home.locationId];
  const opts = state.paperwork?.options ?? {};
  const reno = !!state.upgrade;   // renovating the house the student lives in (blocks task 21)
  const ctx = reno ? renovationContext(state) : buildContext(state);
  const budgetCents = ctx.budgetCents;
  const palette = styleFamily(loc.styleFamily, loc.styleVariant)?.palettes?.[0] ?? null;
  let tab = 'rooms';
  let bp = reno ? structuredClone(renovationDraft(state)) : state.home.blueprint ?? createBlueprint(lotOf(loc), {
    solarKw: opts.siteUtilities?.solarKw ?? 0, catchmentGallons: opts.siteUtilities?.catchmentGallons ?? 0 });
  if (!reno && !state.home.blueprint) store.update((s) => { s.home.blueprint = bp; });
  const quote = () => renovationQuote(store.getState(), bp);

  const area = buildArea(bp);
  const yardArea = editWindow(bp.lot);
  const history = createHistory(BLUEPRINT.undoSteps);
  let sel = null;
  let tool = 'select';
  let view = roomsView(bp);
  let drag = null;          // {kind: move|resize|draw|pan, …}
  let preview = null;       // {id, rect} while moving/resizing
  let draft = null;         // rect while drawing
  let spaceHeld = false;
  let popover = null;
  let view3d = null;
  let pet = 'none';
  let alive = true;

  // ---- DOM ----
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', 'bp-svg');
  svg.setAttribute('tabindex', '0');
  svg.setAttribute('role', 'application');
  svg.setAttribute('aria-label', 'Floor plan editor. Pick a room under Your rooms, then arrows move it, Shift+arrows resize it, T changes its type, Delete removes it.');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  const lotLayer = document.createElementNS(SVGNS, 'g');
  const roomLayer = document.createElementNS(SVGNS, 'g');
  svg.append(lotLayer, roomLayer);
  lotLayer.innerHTML = lotMarkup(bp);

  const toolBtn = (id, label, title) => h('button', { class: `btn btn-secondary btn-small bp-tool bp-tool-${id}`, type: 'button', title,
    onClick: () => setTool(id) }, label);
  const actBtn = (cls, label, title, fn) => h('button', { class: `btn btn-secondary btn-small ${cls}`, type: 'button', title, 'aria-label': title, onClick: fn }, label);
  const undoBtn = actBtn('bp-undo', 'Undo', 'Undo (Ctrl+Z)', () => undo());
  const redoBtn = actBtn('bp-redo', 'Redo', 'Redo (Ctrl+Shift+Z)', () => redo());
  const toolbar = h('div', { class: 'bp-toolbar', role: 'toolbar', 'aria-label': 'Blueprint tools' },
    toolBtn('select', 'Select', 'Select, move and resize rooms and yard items'), toolBtn('draw', 'Draw room', 'Drag on the lot to draw a room'),
    toolBtn('door', 'Door', 'Click a wall between two rooms, or an outside wall, to add or remove a door'),
    toolBtn('window', 'Window', 'Click an outside wall to add or remove a window'),
    h('span', { class: 'bp-sep' }), undoBtn, redoBtn, h('span', { class: 'bp-sep' }),
    actBtn('bp-zoom-out', '−', 'Zoom out', () => zoomBy(1 / 1.25)), actBtn('bp-zoom-in', '+', 'Zoom in', () => zoomBy(1.25)),
    actBtn('bp-fit', 'Fit', 'Fit the lot', () => { view = fitView(bp); applyView(); }));
  const status = h('div', { class: 'bp-status', 'aria-live': 'polite' });
  const stageWrap = h('div', { class: 'dz-stage-wrap bp-stage' }, svg, toolbar, status);
  const panel = h('div', { class: 'dz-panel-body' });
  const moveBtn = h('button', { class: 'btn btn-primary dz-movein', type: 'button', disabled: true, onClick: () => moveIn() }, reno ? 'Renovate' : 'Move in');
  if (reno) moveBtn.classList.add('bp-renovate');
  const moveNote = h('div', { class: 'bp-movein-note', 'aria-live': 'polite' });
  const petSelect = h('label', { class: 'bp-row bp-pet' }, 'A pet ', h('select', { class: 'bp-pet-select', onChange: (e) => { pet = e.target.value; } },
    Object.entries(PET_LABELS).map(([id, label]) => h('option', { value: id }, id === 'none' ? label : `${label}, ${formatMoney(DESIGN.house.petCents[id])}`))));
  const view3dWrap = h('div', { class: 'dz-stage-wrap bp-3d', 'aria-label': '3D preview of your house' },
    h('p', { class: 'dz-loading muted' }, 'Loading 3D…'));
  const root = h('section', { class: 'dz bp bp-split' }, stageWrap, view3dWrap,
    h('aside', { class: 'dz-panel', 'aria-label': 'Blueprint' },
      h('p', { class: 'dz-eyebrow' }, `Phase 3 · ${loc.name}`),
      h('h1', { class: 'dz-title' }, reno ? 'Renovate your house' : 'Design your house'),
      h('p', { class: 'dz-intro muted' }, reno ? 'Add or change rooms and yard items. You pay only what the new plan costs more than your house, plus a permit.'
        : `Your lot is ${bp.lot.widthFt} × ${bp.lot.depthFt} ft. Draw rooms inside the dashed line, or start from a template and change it.`),
      panel, reno ? null : petSelect, moveBtn, moveNote));
  container.append(root);

  // ---- coordinates ----
  const D = bp.lot.depthFt;
  function toLot(ev) {
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX; pt.y = ev.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: p.x, y: D - p.y, sx: p.x, sy: p.y };
  }
  function toClient(x, y) {
    const pt = svg.createSVGPoint();
    pt.x = x; pt.y = D - y;
    const p = pt.matrixTransform(svg.getScreenCTM());
    return { x: p.x, y: p.y };
  }
  const ftPerPx = () => Math.max(view.w / (svg.clientWidth || 1), view.h / (svg.clientHeight || 1));

  // ---- state changes ----
  function save() { store.update((s) => { if (reno) s.upgrade.blueprint = bp; else s.home.blueprint = bp; }); view3d?.update(bp); }
  const exists = (id) => bp.rooms.some((r) => r.id === id) || bp.yard.some((y) => y.id === id);
  function commit(next) {
    if (!next || next === bp) return;
    history.push(bp);
    bp = next;
    fixSel();
    save();
    render();
  }
  function undo() { const prev = history.undo(bp); if (prev) { bp = prev; fixSel(); save(); render(); } }
  function redo() { const next = history.redo(bp); if (next) { bp = next; fixSel(); save(); render(); } }
  function fixSel() { if (sel && !exists(sel)) sel = null; }
  function setTool(id) { tool = id; closePopover(); render(); }
  function select(id) { sel = id; render(); }
  function applyView() { svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`); renderRooms(); }
  function zoomBy(f, cx = view.x + view.w / 2, cy = view.y + view.h / 2) { view = zoomView(view, f, cx, cy); applyView(); }

  // ---- rendering ----
  let result = validateBlueprint(bp, ctx);
  function renderRooms() {
    roomLayer.innerHTML = roomsMarkup(bp, { sel, preview, draft, problems: problemRoomIds(result), handleFt: HANDLE_PX * ftPerPx() });
  }
  function render() {
    result = validateBlueprint(bp, ctx);
    renderRooms();
    stageWrap.dataset.tool = spaceHeld ? 'pan' : tool;
    for (const b of toolbar.querySelectorAll('.bp-tool')) b.setAttribute('aria-pressed', String(b.classList.contains(`bp-tool-${tool}`)));
    undoBtn.disabled = !history.canUndo;
    redoBtn.disabled = !history.canRedo;
    const problems = result.errors.length;
    const after = reno ? afterRenovation(store.getState(), bp) : null;
    const costText = reno ? `Renovation ${formatMoney(quote().deltaCents)} of ${formatMoney(cash(store.getState()))} cash`
      : `Cost ${formatMoney(result.cost.totalCents)}${budgetCents != null ? ` of ${formatMoney(budgetCents)}` : ''}`;
    status.replaceChildren(
      h('span', null, `Area ${footprintArea(bp).toLocaleString('en-US')} sq ft`), h('span', null, `${bp.rooms.length} room${bp.rooms.length === 1 ? '' : 's'}`),
      h('span', { class: (reno ? !after.ok : budgetCents != null && result.cost.totalCents > budgetCents) ? 'bp-over' : null }, costText),
      h('span', { class: problems ? 'bp-bad' : 'bp-good' }, problems ? `${problems} to fix` : 'Plan OK'));
    fillPanel();
    const changed = !reno || hasChanges(store.getState(), bp);
    moveBtn.disabled = problems > 0 || !changed || (reno && !after.ok);
    const label = reno ? 'Renovate' : 'Move in';
    moveNote.replaceChildren(...(problems ? [h('p', { class: 'bp-movein-why' }, `${label} opens when these ${problems === 1 ? 'is' : 'are'} fixed:`),
      h('ul', { class: 'bp-movein-list' }, result.errors.map((e) => h('li', null, e.message)))]
      : !changed ? [h('p', { class: 'bp-movein-why' }, 'Change a room or a yard item to renovate.')]
        : reno && !after.ok ? [h('p', { class: 'bp-movein-why' }, `Not enough cash: ${formatMoney(-after.leftCents)} short.`)] : []));
  }
  async function moveIn() {
    if (reno) {
      const { voxHome } = await import('../../../world/voxHome.js');
      let res = null;
      store.update((s) => { res = commitRenovation(s, bp, { voxHomeFn: voxHome }); }, { checkpoint: 'upgrade-committed' });
      if (res && !res.ok) render();
      return;
    }
    let res = null;
    store.update((s) => { res = moveInBuild(s, bp, { pet }); }, { checkpoint: 'design-finalized' });
    if (res && !res.ok) {
      render();
      if (res.shortfallCents) moveNote.replaceChildren(h('p', { class: 'bp-movein-why' }, `Not enough savings for the pet: ${formatMoney(res.shortfallCents)} short. Pick No pet to move in.`));
    }
  }

  function fillPanel() {
    const focusKey = document.activeElement?.dataset?.focusKey;
    panel.replaceChildren();
    panel.append(reno ? renovationPanel(quote(), afterRenovation(store.getState(), bp)) : budgetPanel(result.cost, budgetCents));
    const tabs = [['rooms', 'Rooms'], ['outside', 'Roof & walls'], ['yard', 'Yard']];
    panel.append(h('div', { class: 'bp-tabs', role: 'tablist', 'aria-label': 'Design panels' }, tabs.map(([id, label]) => h('button', {
      class: `bp-tab bp-tab-${id}`, type: 'button', role: 'tab', 'aria-selected': String(tab === id), dataset: { focusKey: `tab-${id}` },
      onClick: () => { tab = id; fillPanel(); } }, label))));
    const item = bp.yard.find((y) => y.id === sel);
    if (item) {
      panel.append(section('Selected', h('p', { class: 'bp-room-name' }, `${YARD_KINDS[item.kind].label} · ${item.w} × ${item.h} ft`),
        h('div', { class: 'bp-row' },
          h('button', { class: 'btn btn-secondary btn-small bp-delete', type: 'button', onClick: () => commit(removeYardItem(bp, item.id)) }, 'Remove'),
          h('button', { class: 'btn btn-secondary btn-small', type: 'button', onClick: () => select(null) }, 'Done'))));
    }
    if (tab === 'outside') panel.append(outsidePanel(bp, { palette }, commit));
    else if (tab === 'yard') {
      panel.append(yardPanel(bp, ctx, (next) => {
        const added = next.yard.length > bp.yard.length;
        commit(next);
        if (added) { sel = bp.yard.at(-1).id; view = roomsView(bp); applyView(); }
      }));
    }
    else fillRooms();
    panel.append(checksPanel(result));
    if (focusKey) panel.querySelector(`[data-focus-key="${focusKey}"]`)?.focus();
  }

  function fillRooms() {
    const room = bp.rooms.find((r) => r.id === sel);
    const typeSelect = (value, onChange, key) => h('select', { class: 'bp-type-select', dataset: { focusKey: key }, onChange: (e) => onChange(e.target.value) },
      ROOM_TYPE_IDS.map((id) => h('option', { value: id, selected: id === value }, ROOM_TYPES[id].label)));
    if (room) {
      panel.append(section('Selected room',
        h('p', { class: 'bp-room-name' }, `${roomName(bp, room)} · ${room.w} × ${room.h} ft · ${roomArea(room)} sq ft`),
        h('label', { class: 'bp-row' }, 'Type ', typeSelect(room.type, (t) => commit(setRoomType(bp, room.id, t)), 'sel-type')),
        h('div', { class: 'bp-row' },
          h('button', { class: 'btn btn-secondary btn-small bp-delete', type: 'button', dataset: { focusKey: 'delete' },
            onClick: () => commit(removeRoom(bp, room.id)) }, 'Delete room'),
          h('button', { class: 'btn btn-secondary btn-small', type: 'button', onClick: () => select(null) }, 'Done')),
        h('p', { class: 'muted bp-help' }, 'Drag to move, drag the white squares to resize. Keys: arrows move, Shift+arrows resize, T changes the type, Delete removes.')));
    }
    // Keyboard path to a room (12 §4): pick it here, then the plan takes focus so the arrow keys move it.
    if (bp.rooms.length) panel.append(section('Your rooms', h('div', { class: 'bp-row bp-room-list' }, bp.rooms.map((r) => h('button', {
      class: 'btn btn-secondary btn-small bp-room-pick', type: 'button', 'aria-pressed': String(r.id === sel), dataset: { focusKey: `pick-${r.id}` },
      onClick: () => { select(r.id); svg.focus({ preventScroll: true }); } }, roomName(bp, r))))));
    let addType = 'bedroom';
    panel.append(section('Add a room',
      h('div', { class: 'bp-row' },
        typeSelect(addType, (t) => { addType = t; }, 'add-type'),
        h('button', { class: 'btn btn-secondary btn-small bp-add', type: 'button', dataset: { focusKey: 'add' }, onClick: () => {
          const { w, h: d } = BLUEPRINT.newRoom;
          const spot = findFreeSpot(bp, w, d);
          if (!spot) return;
          const next = addRoom(bp, { type: addType, ...spot, w, h: d });
          sel = next.rooms.at(-1).id;
          commit(next);
        } }, 'Add')),
      h('p', { class: 'muted bp-help' }, 'Or choose Draw room and drag a rectangle on the lot.')));
    panel.append(section('Start from a template',
      h('div', { class: 'bp-templates' }, TEMPLATE_IDS.map((id) => h('button', {
        class: `bp-template bp-template-${id}`, type: 'button', dataset: { focusKey: `tpl-${id}` }, onClick: () => useTemplate(id) },
      h('strong', null, TEMPLATES[id].label), h('span', null, TEMPLATES[id].blurb)))),
      h('button', { class: 'btn btn-secondary btn-small bp-clear', type: 'button', disabled: !bp.rooms.length, onClick: clearAll }, 'Clear the lot')));
    panel.append(h('p', { class: 'muted bp-help' }, 'Doors and windows: pick the Door or Window tool, then click a wall. Click again to remove.'));
  }

  async function useTemplate(id) {
    if (bp.rooms.length && !(await confirmDialog({ title: `Use the ${TEMPLATES[id].label} template?`,
      message: 'This replaces the rooms you have now. You can undo it.', confirmLabel: 'Use template' }))) return;
    const next = applyTemplate(bp, id);
    if (next) { sel = null; commit(next); view = roomsView(bp); applyView(); }
  }
  async function clearAll() {
    if (!(await confirmDialog({ title: 'Clear the lot?', message: 'This removes every room. You can undo it.', confirmLabel: 'Clear' }))) return;
    sel = null;
    commit({ ...bp, rooms: [], openings: [] });
  }

  // ---- type popover after drawing ----
  function closePopover() { popover?.remove(); popover = null; draft = null; renderRooms(); }
  function openPopover(rect) {
    const c = toClient(rect.x + rect.w, rect.y + rect.h);
    const box = stageWrap.getBoundingClientRect();
    const choose = (type) => {
      const next = addRoom(bp, { type, ...rect });
      closePopover();
      sel = next.rooms.at(-1)?.id ?? null;
      commit(next);
      svg.focus();
    };
    popover = h('div', { class: 'bp-popover', role: 'dialog', 'aria-label': 'What kind of room?',
      onKeydown: (e) => { if (e.key === 'Escape') { e.stopPropagation(); closePopover(); svg.focus(); } } },
    h('p', { class: 'bp-popover-title' }, `What kind of room? (${rect.w} × ${rect.h} ft)`),
    h('div', { class: 'bp-popover-grid' }, ROOM_TYPE_IDS.map((id) => h('button', { class: 'bp-type-btn', type: 'button', dataset: { type: id },
      onClick: () => choose(id) }, h('span', { class: `bp-swatch bp-sw-${id}` }), ROOM_TYPES[id].label))),
    h('button', { class: 'btn btn-secondary btn-small bp-popover-cancel', type: 'button', onClick: () => { closePopover(); svg.focus(); } }, 'Cancel'));
    stageWrap.append(popover);
    const pw = popover.offsetWidth; const ph = popover.offsetHeight;
    popover.style.left = `${Math.min(Math.max(8, c.x - box.left + 8), box.width - pw - 8)}px`;
    popover.style.top = `${Math.min(Math.max(48, c.y - box.top), box.height - ph - 40)}px`;
    popover.querySelector('button')?.focus();
  }

  // ---- pointer ----
  function onDown(ev) {
    if (ev.button !== 0 && ev.button !== 1) return;
    if (popover) closePopover();
    svg.focus({ preventScroll: true }); // a scroll here would move the plan under the pointer
    const p = toLot(ev);
    const handle = ev.target.closest?.('[data-handle]')?.dataset.handle;
    const roomEl = ev.target.closest?.('[data-id]');
    const yardEl = ev.target.closest?.('[data-yard]');
    if (spaceHeld || ev.button === 1) drag = { kind: 'pan', sx: ev.clientX, sy: ev.clientY, view: { ...view } };
    else if (tool === 'door' || tool === 'window') {
      commit(toggleOpening(bp, { kind: tool, x: p.x, y: p.y, tol: Math.max(0.75, 9 * ftPerPx()) }));
      ev.preventDefault();
      return;
    }
    else if (handle && sel) drag = { kind: 'resize', handle, id: sel, start: bp.rooms.find((r) => r.id === sel) };
    else if (tool === 'draw') { drag = { kind: 'draw', p0: p }; draft = drawRect(p, p, area); }
    else if (yardEl && !roomEl) {
      const id = yardEl.dataset.yard;
      sel = id;
      drag = { kind: 'move-yard', id, p0: p, start: bp.yard.find((y) => y.id === id) };
      render();
    } else if (roomEl || roomAt(bp, p.x, p.y)) {
      const id = roomEl?.dataset.id ?? roomAt(bp, p.x, p.y).id;
      sel = id;
      tab = 'rooms';
      drag = { kind: 'move', id, p0: p, start: bp.rooms.find((r) => r.id === id) };
      render();
    } else {
      if (sel) { sel = null; render(); }
      drag = { kind: 'pan', sx: ev.clientX, sy: ev.clientY, view: { ...view } };
    }
    ev.preventDefault();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }
  function onMove(ev) {
    if (!drag) return;
    if (drag.kind === 'pan') {
      const k = ftPerPx();
      view = { ...drag.view, x: drag.view.x - (ev.clientX - drag.sx) * k, y: drag.view.y - (ev.clientY - drag.sy) * k };
      applyView();
      return;
    }
    const p = toLot(ev);
    if (drag.kind === 'move-yard') preview = { id: drag.id, rect: moveRect(drag.start, p.x - drag.p0.x, p.y - drag.p0.y, yardArea) };
    else if (drag.kind === 'move') preview = { id: drag.id, rect: moveRect(drag.start, p.x - drag.p0.x, p.y - drag.p0.y, area) };
    else if (drag.kind === 'resize') preview = { id: drag.id, rect: resizeRect(drag.start, drag.handle, p.x, p.y, area) };
    else if (drag.kind === 'draw') draft = drawRect(drag.p0, p, area);
    renderRooms();
  }
  function onUp() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    const d = drag; drag = null;
    if (!d) return;
    if (d.kind === 'move-yard' && preview) { const r = preview.rect; preview = null; commit(moveYardItem(bp, d.id, r.x, r.y)); }
    else if (d.kind === 'move' && preview) { const r = preview.rect; preview = null; commit(r.x === d.start.x && r.y === d.start.y ? bp : moveRoom(bp, d.id, r.x, r.y)); }
    else if (d.kind === 'resize' && preview) { const r = preview.rect; preview = null; commit(resizeRoom(bp, d.id, r)); }
    else if (d.kind === 'draw') {
      if (draft && drawable(draft) && bp.rooms.length < BLUEPRINT.maxRooms) openPopover(draft);
      else { draft = null; }
    }
    preview = null;
    renderRooms();
  }
  function onWheel(ev) {
    ev.preventDefault();
    const p = toLot(ev);
    zoomBy(ev.deltaY < 0 ? 1.15 : 1 / 1.15, p.sx, p.sy);
  }

  // ---- keyboard ----
  const typing = (t) => t instanceof Element && t.matches('input, select, textarea, [contenteditable="true"]');
  function onKey(ev) {
    if (document.querySelector('.modal-backdrop, [role="dialog"][aria-modal="true"]') || popover || typing(ev.target)) return;
    if (ev.key === ' ' && (ev.target === svg || ev.target === document.body)) { ev.preventDefault(); if (!spaceHeld) { spaceHeld = true; stageWrap.dataset.tool = 'pan'; } return; }
    const a = keyAction(ev);
    if (!a) return;
    ev.preventDefault();
    if (a.kind === 'undo') return undo();
    if (a.kind === 'redo') return redo();
    if (a.kind === 'zoom-in') return zoomBy(1.25);
    if (a.kind === 'zoom-out') return zoomBy(1 / 1.25);
    if (a.kind === 'fit') { view = fitView(bp); return applyView(); }
    if (a.kind === 'deselect') return select(null);
    if (sel && bp.yard.some((y) => y.id === sel)) {
      const it = bp.yard.find((y) => y.id === sel);
      if (a.kind === 'delete') commit(removeYardItem(bp, sel));
      else if (a.kind === 'move') commit(moveYardItem(bp, sel, it.x + a.dx, it.y + a.dy));
      return;
    }
    if (sel) commit(applyRoomAction(bp, sel, a, area));
  }
  function onKeyUp(ev) { if (ev.key === ' ' && spaceHeld) { spaceHeld = false; stageWrap.dataset.tool = tool; } }

  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('wheel', onWheel, { passive: false });
  document.addEventListener('keydown', onKey);
  document.addEventListener('keyup', onKeyUp);
  const ro = new ResizeObserver(() => renderRooms());
  ro.observe(svg);

  applyView();
  render();
  window.__blueprint = { get bp() { return bp; }, get sel() { return sel; }, get history() { return history.depth; },
    toClient, result: () => result, get view3d() { return view3d; }, quote: () => (reno ? quote() : null) };
  createBlueprintView(view3dWrap, { location: loc, palette: 0, seed: seedFor(state.meta.seed, 'build') }).then((v) => {
    view3dWrap.querySelector('.dz-loading')?.remove();
    if (!alive) { v?.dispose(); return; }
    view3d = v;
    v?.rebuildNow(bp);
  });
  document.body.dataset.ready = '1';
  return () => {
    alive = false;
    view3d?.dispose();
    ro.disconnect();
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    delete window.__blueprint;
    delete document.body.dataset.ready;
  };
}
