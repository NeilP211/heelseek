import { test } from 'node:test';
import assert from 'node:assert/strict';

import { detectFreeFood, detectFree } from '../scripts/lib/tags.mjs';

const ev = (over = {}) => ({ title: '', description: '', categories: [], benefits: [], ...over });

test('trusts the Heel Life Free Food benefit tag above everything else', () => {
  assert.equal(detectFreeFood(ev({ benefits: ['Free Stuff', 'Free Food'] })), true);
});

test('catches the common explicit phrasings', () => {
  for (const phrase of [
    'Free pizza for everyone',
    'Dinner will be provided',
    'Light refreshments served',
    'Come for the free bagels',
    'Lunch provided, RSVP required',
    'Snacks provided at the door',
  ]) {
    assert.equal(detectFreeFood(ev({ description: phrase })), true, `missed: ${phrase}`);
  }
});

test('catches the real Welcome Wednesdays wording from the alumni feed', () => {
  const real = ev({
    title: 'For Students: Welcome Wednesdays With Bagels and Coffee',
    description: 'Stop by Wednesdays this semester for bagels and coffee, while supplies last.',
  });
  assert.equal(detectFreeFood(real), true);
});

test('a bare food noun needs a giving verb nearby', () => {
  assert.equal(detectFreeFood(ev({ description: 'A lecture on the pizza industry in Italy' })), false);
  assert.equal(detectFreeFood(ev({ description: 'We will have pizza at the meeting' })), true);
});

test('does not fire on food-as-a-topic events', () => {
  for (const phrase of [
    'A panel on food insecurity in Orange County',
    'Food for thought: a reading series',
    'Campus food drive, please donate',
    'Research seminar on food safety regulation',
    'Food justice teach-in',
  ]) {
    assert.equal(detectFreeFood(ev({ description: phrase })), false, `false positive: ${phrase}`);
  }
});

test('an explicit handout still wins over a topic word', () => {
  const mixed = ev({
    title: 'Food insecurity panel',
    description: 'A discussion of food insecurity. Free pizza will be provided.',
  });
  assert.equal(detectFreeFood(mixed), true);
});

test('detects free admission phrasings', () => {
  assert.equal(detectFree(ev({ description: 'This event is free and open to the public.' })), true);
  assert.equal(detectFree(ev({ description: 'Admission is free with student ID' })), true);
  assert.equal(detectFree(ev({ explicitFree: true })), true);
});

test('a real ticket price overrides loose free wording', () => {
  assert.equal(detectFree(ev({ description: 'free parking nearby', ticketCost: '$25' })), false);
});

test('a zero or empty cost does not by itself claim free', () => {
  assert.equal(detectFree(ev({ description: 'A lecture' })), false);
});

test('empty input is safe', () => {
  assert.equal(detectFreeFood(ev()), false);
  assert.equal(detectFree(ev()), false);
});
