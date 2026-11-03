// Blocks task 24: every borrowed piece in app/vendor/VERSIONS.md is credited in-game (13 §2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../../app/src/ui/portfolio/credits.js', import.meta.url), 'utf8');

test('credits name the engine (author, license, repo) and Kenney CC0', () => {
  assert.match(src, /vyse12138/);
  assert.match(src, /github\.com\/vyse12138\/minecraft-threejs/);
  assert.match(src, /Kenney/);
  assert.match(src, /'CC0'/);
  for (const lib of ['three.js', 'nspell', 'dictionary-en', 'VADER']) assert.ok(src.includes(lib), lib);
});

test('no Minecraft naming in UI copy outside the credited repo address', () => {
  const lines = src.split('\n').filter((l) => /minecraft/i.test(l));
  assert.ok(lines.every((l) => /github\.com\/vyse12138\/minecraft-threejs|upstream repository/.test(l)), lines.join('\n'));
});
