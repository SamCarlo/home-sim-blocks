// The "My home" menu's items (13 §10, blocks task 19). Pure: which lifestyle choices are open right now and why not.
// The UI (phases/life/homeMenu.js) renders one button per item; a disabled item shows its `note`.
import { canRelocate } from './relocation.js';

/** The home kinds that have something to upgrade (13 §10): houses and builds customize, renters and condos add plants. */
export const UPGRADE_KINDS = Object.freeze(['house', 'build', 'apartment', 'condo', 'shared']);

/** The menu stages (13 §8): never during the live month. */
export const HOME_MENU_STAGES = Object.freeze(['welcome', 'plan', 'summary']);

/** Whether this home kind has anything to upgrade. */
export function hasUpgrades(kind) {
  return UPGRADE_KINDS.includes(kind);
}

/**
 * The menu items, in order → `[{id 'explore'|'upgrade'|'move', label, disabled, note}]`. `explore` false hides Explore
 * (`?view=classic`); `exploreReady` false disables it while the world loads; `upgradeReady` = `life/upgrade.js` canUpgrade.
 */
export function homeMenuItems(state, { explore = true, exploreReady = true, upgradeReady = false } = {}) {
  const items = [];
  if (explore) {
    items.push({ id: 'explore', label: 'Explore & build', disabled: !exploreReady,
      note: exploreReady ? 'Walk around your place and build with blocks.' : 'Your home is still loading.' });
  }
  if (hasUpgrades(state.home?.kind)) {
    items.push({ id: 'upgrade', label: 'Upgrade this home', disabled: !upgradeReady,
      note: upgradeReady ? 'Add to your home. You pay only for what is new.' : 'Coming soon' });
  }
  const movable = canRelocate(state);
  const stage = state.life?.current?.stage ?? 'welcome';
  items.push({ id: 'move', label: 'Find a new place to live', disabled: !movable,
    note: movable ? 'Look for a new home. You can cancel until a new home says yes.'
      : stage === 'summary' ? 'You can look for a new place at the start of next month.' : 'You can’t move right now.' });
  return items;
}
