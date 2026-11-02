// The facts every renter document shares (05 §4, task 20): who the landlord is, the place, rent, deposit and move-in
// money. Pure. The terms object is also stored on the signed agreement, so the portfolio can rebuild the document
// later from the agreement alone (no choice snapshot needed).
import { LEASE } from '../../../config.js';
import { moveDates } from '../../../util/dates.js';
import { byId } from '../../../data/locations/index.js';
import { businessFor, peopleFor, phoneFor } from '../../../content/names.js';
import { upfrontLine, rentOf } from '../flow.js';

/** The renter variant of the chosen home: 'room' for shared, else 'apartment'. */
export const variantOf = (state) => (state.choice?.homeTypeId === 'shared' ? 'room' : 'apartment');

/**
 * Renter terms for this attempt: {variant, place, landlord, landlordContact, landlordPhone, unit, rentCents,
 * depositCents, firstMonthCents, applicationFeeCents, termMonths, startLabel, startMonth, roommates}. Seeded, so stable on
 * reload. The lease starts in the current life month (0 for a first home; later after a move, task 58).
 */
export function renterTerms(state) {
  const variant = variantOf(state);
  const loc = byId[state.choice?.locationId];
  const [owner, ...roommates] = peopleFor(state, 'household', 4);
  const company = businessFor(state, 'landlords', 'landlord');
  const contact = peopleFor(state, 'landlord-contact', 1)[0];
  const startMonth = state.life?.monthIndex ?? 0;
  return {
    variant,
    place: loc?.fullName ?? '',
    placeName: loc?.name ?? '',
    landlord: variant === 'room' ? owner : company,
    landlordContact: variant === 'room' ? owner : `${contact}, leasing manager`,
    landlordPhone: phoneFor(state, 'landlord'),
    unit: variant === 'room' ? 'Bedroom to be chosen in Phase 3' : 'Unit to be chosen in Phase 3',
    rentCents: rentOf(state),
    depositCents: upfrontLine(state, 'deposit')?.cents ?? 0,
    firstMonthCents: upfrontLine(state, 'first-month')?.cents ?? 0,
    applicationFeeCents: upfrontLine(state, 'application')?.cents ?? 0,
    termMonths: LEASE.termMonths,
    startLabel: startMonth > 0 ? moveDates(startMonth).moveInLabel : LEASE.startLabel,
    startMonth,
    roommates: variant === 'room' ? roommates.slice(0, 2).concat(owner) : [],
  };
}

/** The masked game ID shown instead of an SSN field (05 §4: there are no SSN fields). */
export function gameIdField(state) {
  const last4 = String((state?.meta?.seed ?? 4821) % 10000).padStart(4, '0');
  return { id: 'game-id', kind: 'computed', label: 'Game ID', width: 'half', compute: () => `•••-••-${last4}`,
    hint: 'Real forms ask for a Social Security number. Never type a real one into a game or a website.' };
}

/** The "parties" block at the top of a renter document. */
export function partiesFields(terms, { tenantLabel = 'Tenant' } = {}) {
  return [
    { id: 'p-landlord', kind: 'computed', label: terms.variant === 'room' ? 'Homeowner (landlord)' : 'Landlord',
      width: 'half', compute: () => terms.landlord },
    { id: 'p-contact', kind: 'computed', label: 'Contact', width: 'half',
      compute: () => `${terms.landlordContact} · ${terms.landlordPhone}` },
    { id: 'p-tenant', kind: 'computed', label: tenantLabel, width: 'half', compute: (v, s) => s?.player?.characterName ?? '' },
    { id: 'p-place', kind: 'computed', label: 'Address', width: 'half', compute: () => `${terms.unit}, ${terms.place}` },
  ];
}
