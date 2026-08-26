import { test } from 'node:test';
import assert from 'node:assert/strict';

import { decodeEntities, normalizePunctuation, stripHtml, clean, cleanLine } from '../scripts/lib/text.mjs';

// Dash fixtures are built by code point on purpose: the repo rule forbids
// literal em and en dashes in source files, so we never type one here.
const EN = String.fromCharCode(0x2013);
const EM = String.fromCharCode(0x2014);
const MINUS = String.fromCharCode(0x2212);
const NB_HYPHEN = String.fromCharCode(0x2011);

test('decodes named, decimal and hex entities', () => {
  assert.equal(decodeEntities('Tar &amp; Heel'), 'Tar & Heel');
  assert.equal(decodeEntities('caf&#233;'), 'café');
  assert.equal(decodeEntities('caf&#xe9;'), 'café');
  assert.equal(decodeEntities('a&nbsp;b'), 'a b');
});

test('leaves unknown entities untouched rather than mangling them', () => {
  assert.equal(decodeEntities('&notareal;'), '&notareal;');
});

test('normalises every dash variant down to a plain hyphen', () => {
  const input = `Feb 19${EN}20 and Mar 1${EM} 2 and ${MINUS} 3 and ${NB_HYPHEN} 4`;
  const out = normalizePunctuation(input);
  assert.equal(out, 'Feb 19-20 and Mar 1- 2 and - 3 and - 4');
  assert.ok(
    !new RegExp(`[${EN}${EM}${MINUS}${NB_HYPHEN}]`).test(out),
    `a dash survived normalisation: ${out}`,
  );
});

test('entity dashes are normalised too, since feeds emit both forms', () => {
  assert.equal(normalizePunctuation(decodeEntities('Feb 19&ndash;20')), 'Feb 19-20');
  assert.equal(normalizePunctuation(decodeEntities('Feb 19&mdash;20')), 'Feb 19-20');
});

test('normalises smart quotes and ellipses', () => {
  assert.equal(normalizePunctuation('“Hi” ‘there’…'), '"Hi" \'there\'...');
});

test('strips script and style bodies, not just the tags', () => {
  const html = '<div>Keep<script>var evil = 1;</script><style>.x{color:red}</style>This</div>';
  assert.equal(clean(html), 'Keep This');
});

test('stripHtml removes tags but keeps the text between them', () => {
  assert.match(stripHtml('<a href="#">link</a>'), /link/);
});

test('turns block tags into line breaks so text does not run together', () => {
  assert.equal(clean('<p>One</p><p>Two</p>'), 'One\nTwo');
  assert.equal(clean('a<br>b'), 'a\nb');
});

test('clean truncates on a word boundary and marks the cut', () => {
  const out = clean('alpha beta gamma delta epsilon', { maxLength: 14 });
  assert.equal(out, 'alpha beta...');
});

test('clean leaves short text unchanged and without an ellipsis', () => {
  assert.equal(clean('short one', { maxLength: 400 }), 'short one');
});

test('cleanLine collapses newlines for titles', () => {
  assert.equal(cleanLine('<p>Line one</p><p>Line two</p>'), 'Line one Line two');
});

test('handles null and undefined without throwing', () => {
  assert.equal(clean(null), '');
  assert.equal(clean(undefined), '');
  assert.equal(cleanLine(''), '');
});

test('full pipeline on a real Heel Life description', () => {
  const raw = '<p>NO EXPERIENCE REQUIRED! Come jump with us.</p>\r\n<p>&nbsp;</p>\r\n<p>We&rsquo;d love it&hellip;</p>';
  assert.equal(clean(raw), "NO EXPERIENCE REQUIRED! Come jump with us.\nWe'd love it...");
});
