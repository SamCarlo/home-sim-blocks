// Credits for every borrowed piece (13 §2, blocks task 24). Opened from the portfolio Settings tab.
// The engine line names the upstream repository as published (its MIT license asks for credit); no other UI copy
// uses that name (13 §1, DEVIATIONS).
import { h } from '../dom.js';
import { openModal } from '../modal.js';

/** Every borrowed library and art pack: {what, name, author, license, url}. Keep in step with app/vendor/VERSIONS.md. */
export const CREDITS = [
  { what: 'Block engine', name: 'Block world engine for three.js', author: 'vyse12138', license: 'MIT',
    url: 'https://github.com/vyse12138/minecraft-threejs' },
  { what: 'Textures', name: 'Voxel Pack', author: 'Kenney', license: 'CC0', url: 'https://kenney.nl/assets/voxel-pack' },
  { what: '3D drawing', name: 'three.js', author: 'the three.js authors', license: 'MIT', url: 'https://threejs.org' },
  { what: 'Spell check', name: 'nspell', author: 'Titus Wormer', license: 'MIT', url: 'https://github.com/wooorm/nspell' },
  { what: 'Dictionary', name: 'dictionary-en', author: 'Titus Wormer and the SCOWL authors', license: 'MIT and BSD',
    url: 'https://github.com/wooorm/dictionaries' },
  { what: 'Letter tone', name: 'VADER', author: 'C.J. Hutto and Eric Gilbert', license: 'MIT and Apache-2.0',
    url: 'https://github.com/vaderSentiment/vaderSentiment-js' },
];

/** The credits list as DOM (also used by tests through the modal). */
export function creditsList() {
  return h('ul', { class: 'pf-credits-list' }, CREDITS.map((c) => h('li', { class: 'pf-credit' },
    h('span', { class: 'pf-credit-what' }, c.what),
    h('span', { class: 'pf-credit-name' }, `${c.name} by ${c.author}`),
    h('span', { class: 'pf-credit-license muted' }, `License: ${c.license}`),
    h('a', { class: 'pf-credit-link', href: c.url, target: '_blank', rel: 'noopener noreferrer' }, c.url.replace(/^https:\/\//, '')))));
}

/** Opens the credits dialog over the portfolio. */
export function openCredits() {
  let modal;
  const content = h('div', { class: 'pf-credits' },
    h('h2', { class: 'pf-credits-title' }, 'Credits'),
    h('p', { class: 'muted pf-note' }, 'This game is built with free, open tools and art. Thank you to the people who share them.'),
    creditsList(),
    h('p', { class: 'muted pf-note' }, 'Textures: Kenney, CC0. Every person and business in the game is made up.'),
    h('div', { class: 'pf-credits-foot' },
      h('button', { type: 'button', class: 'btn pf-credits-close', onClick: () => modal.close() }, 'Close')));
  modal = openModal({ label: 'Credits', content, className: 'pf-credits-modal' });
  return modal;
}
