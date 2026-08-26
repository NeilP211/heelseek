// Text cleanup shared by the adapters. Source feeds hand us a mix of raw HTML,
// numeric entities, smart punctuation and non-breaking spaces.

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  hellip: '...', mdash: '-', ndash: '-', rsquo: "'", lsquo: "'",
  rdquo: '"', ldquo: '"', middot: '.', bull: '*', deg: ' degrees',
};

export function decodeEntities(input = '') {
  return input
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

/**
 * Fold typographic punctuation down to ASCII. Dashes in particular are
 * normalised to plain hyphens so nothing downstream renders an em or en dash.
 */
export function normalizePunctuation(input = '') {
  return input
    .replace(/[‐-―−]/g, '-')
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/…/g, '...')
    .replace(/[   ]/g, ' ');
}

export function stripHtml(input = '') {
  return input
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
}

export function collapse(input = '') {
  return input.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

/** Full pipeline: HTML in, clean single-line-ish plain text out. */
export function clean(input = '', { maxLength = 0 } = {}) {
  let out = collapse(normalizePunctuation(decodeEntities(stripHtml(String(input ?? '')))));
  if (maxLength > 0 && out.length > maxLength) {
    out = `${out.slice(0, maxLength).replace(/\s+\S*$/, '')}...`;
  }
  return out;
}

/** Shorter helper for titles and venue names, which should stay on one line. */
export function cleanLine(input = '', maxLength = 0) {
  return clean(input, { maxLength }).replace(/\n+/g, ' ').trim();
}
