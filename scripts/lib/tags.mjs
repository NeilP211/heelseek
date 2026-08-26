// Derived tags: free admission, and the one students actually filter on, food.

/** Phrases that reliably mean edible food is being handed out. */
const FOOD_PHRASES = [
  'free food', 'free pizza', 'free breakfast', 'free lunch', 'free dinner',
  'free snacks', 'free coffee', 'free bagels', 'free donuts', 'free doughnuts',
  'free ice cream', 'free boba', 'free cookies', 'free candy', 'free treats',
  'food provided', 'food will be provided', 'food is provided', 'food served',
  'lunch provided', 'dinner provided', 'breakfast provided', 'snacks provided',
  'refreshments provided', 'refreshments will be served', 'light refreshments',
  'lunch will be provided', 'dinner will be provided', 'breakfast will be provided',
  'snacks will be provided', 'pizza will be provided', 'catered lunch',
  'lunch is served', 'complimentary breakfast', 'complimentary lunch',
  'complimentary refreshments', 'will be catered', 'food and drinks',
  'snacks and drinks', 'pizza and drinks', 'bagels and coffee',
  'coffee and pastries', 'while supplies last',
];

/** Bare nouns that only count when a giving verb is nearby. */
const FOOD_NOUNS = [
  'pizza', 'bagel', 'bagels', 'donut', 'donuts', 'doughnuts', 'snacks',
  'refreshments', 'breakfast', 'lunch', 'dinner', 'boba', 'ice cream',
  'cookies', 'barbecue', 'bbq', 'tacos', 'chick-fil-a', 'catering', 'catered',
];

const GIVING_VERBS = [
  'free', 'provided', 'serving', 'served', 'complimentary', 'grab a',
  'stop by for', 'enjoy', 'will have', 'we will have', 'come get',
  'on us', 'no cost', 'courtesy of', 'while supplies last',
];

/** Contexts where the word food appears but nobody is being fed. */
const FOOD_EXCLUSIONS = [
  'food insecurity', 'food for thought', 'food drive', 'food bank',
  'food pantry', 'food desert', 'food system', 'food policy', 'food science',
  'food safety', 'food waste', 'food justice', 'food studies', 'foodborne',
  'food security', 'no food', 'food is not', 'bring your own',
];

const FREE_PHRASES = [
  'free and open to the public', 'free admission', 'admission is free',
  'no cost', 'no charge', 'free of charge', 'free event', 'free to attend',
  'free for students', 'free with a onecard', 'free with student id',
  'registration is free', 'free tickets',
];

function hay(event) {
  return [event.title, event.description, (event.categories || []).join(' '), (event.benefits || []).join(' ')]
    .filter(Boolean)
    .join(' \n ')
    .toLowerCase();
}

function containsAny(text, needles) {
  return needles.some((n) => text.includes(n));
}

/**
 * A bare food noun counts only if a giving verb sits within ~60 characters,
 * which keeps "the economics of pizza delivery" out of the food filter.
 */
function nounNearVerb(text) {
  for (const noun of FOOD_NOUNS) {
    let idx = text.indexOf(noun);
    while (idx !== -1) {
      const window = text.slice(Math.max(0, idx - 60), idx + noun.length + 60);
      if (containsAny(window, GIVING_VERBS)) return true;
      idx = text.indexOf(noun, idx + 1);
    }
  }
  return false;
}

export function detectFreeFood(event) {
  const text = hay(event);
  const benefits = (event.benefits || []).map((b) => b.toLowerCase());
  // Heel Life tags this explicitly, so trust it before touching the text.
  if (benefits.some((b) => b.includes('free food'))) return true;

  if (containsAny(text, FOOD_EXCLUSIONS) && !containsAny(text, FOOD_PHRASES)) return false;
  if (containsAny(text, FOOD_PHRASES)) return true;
  return nounNearVerb(text);
}

export function detectFree(event) {
  const text = hay(event);
  if (event.explicitFree === true) return true;
  if (event.ticketCost && /\$\s*[1-9]/.test(String(event.ticketCost))) return false;
  return containsAny(text, FREE_PHRASES);
}

export const _internals = { FOOD_PHRASES, FOOD_EXCLUSIONS, nounNearVerb, hay };
