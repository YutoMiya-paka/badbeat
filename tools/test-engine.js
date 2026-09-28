'use strict';

const assert = require('node:assert/strict');
require('../engine.js');
const PE = globalThis.PokerEngine;
let checks = 0;
function check(name, fn) {
  try { fn(); checks++; }
  catch (e) { e.message = name + ': ' + e.message; throw e; }
}
function cards(text) {
  const out = [];
  for (let i = 0; i < text.length; i += 2) {
    const r = PE.RANKS.indexOf(text[i]), s = PE.SUITS.indexOf(text[i + 1]);
    assert.ok(r >= 0 && s >= 0, 'invalid test card ' + text.slice(i, i + 2));
    out.push(PE.makeCard(r, s));
  }
  return out;
}
function score(text) { return PE.evalCards(cards(text)); }

async function main() {
  check('parse AA vs KK', () => {
    const p = PE.parse('AA vs KK');
    assert.deepEqual(p.hero.map(PE.cardStr), ['As', 'Ah']);
    assert.deepEqual(p.vill.map(PE.cardStr), ['Kd', 'Kc']);
    assert.equal(p.autoSuits, true);
  });
  check('parse board includes 2s', () => {
    const p = PE.parse('AhKh vs QsQd フロップでオールイン Qc 8h 3h 2s 9d');
    assert.equal(p.street, 3);
    assert.deepEqual(p.board.map(PE.cardStr), ['Qc', '8h', '3h', '2s', '9d']);
  });
  check('parse Japanese hand names', () => {
    const p = PE.parse('キングスがエーシーズに負けた');
    assert.equal(p.hero.length, 2); assert.equal(p.vill.length, 2);
    assert.deepEqual(p.hero.map(c => c >> 2), [11, 11]);
    assert.deepEqual(p.vill.map(c => c >> 2), [12, 12]);
  });
  check('parse rejects no cards', () => assert.equal(PE.parse('今日3回負けた').error, 'none'));
  check('parse rejects incomplete flop all-in', () => assert.ok(PE.parse('AhAs vs KdKc フロップでオールイン').error));
  check('parse rejects duplicate cards', () => assert.ok(PE.parse('AhAs vs AhKc').error));

  check('wheel is a straight', () => assert.equal(PE.categoryOf(score('As2h3d4c5s9hKd')), 4));
  check('royal flush is a straight flush', () => assert.equal(PE.categoryOf(score('AsKsQsJsTs2d3c')), 8));
  check('full house', () => assert.equal(PE.categoryOf(score('AhAdAcKsKd2s3c')), 6));
  check('three pair selects top two pairs and best kicker', () => {
    const threePair = score('AsAhKdKcQsQh2d');
    const twoPair = score('AsAhKdKcJs9h2d');
    assert.equal(PE.categoryOf(threePair), 2);
    assert.ok(threePair > twoPair);
  });
  check('three pair ignores the third pair below the best two', () => {
    assert.equal(score('AsAhKdKcQsQhJd'), score('AsAhKdKcQsQh9d'));
  });

  const cases = [
    ['AsAh vs KdKc', 81.06],
    ['AKo vs QQ', 42.66],
    ['72o vs AA', 12.40]
  ];
  for (const [input, expected] of cases) {
    const parsed = PE.parse(input);
    assert.ok(!parsed.error, 'could not parse equity case ' + input);
    const res = await PE.analyze(parsed);
    const pct = res.allin.win * 100;
    check('equity ' + input, () => assert.ok(Math.abs(pct - expected) <= 0.05, `expected ${expected}%, got ${pct.toFixed(4)}%`));
  }
  console.log(`${checks} checks OK`);
}

main().catch(err => { console.error(err.stack || err); process.exitCode = 1; });
