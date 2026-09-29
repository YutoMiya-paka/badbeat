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
  check('looksDaily examples', () => {
    assert.equal(PE.looksDaily('KKで3回負けた'), true);
    assert.equal(PE.looksDaily('今日AAが2回割られた'), true);
    assert.equal(PE.looksDaily('AA vs KK'), false);
    assert.equal(PE.looksDaily('AhAs vs KdKc Qh 7c 2d Ks 9s'), false);
    assert.equal(PE.looksDaily('72o vs AA'), false);
  });
  check('parseDaily counts and leftovers', () => {
    let d=PE.parseDaily('今日キングス3回割られた、AKも8回中5回負けた');
    assert.deepEqual(d.items.map(x=>[x.label,x.n,x.k]),[['KK',null,3],['AK',8,5]]);
    d=PE.parseDaily('AAで4戦全敗'); assert.deepEqual([d.items[0].n,d.items[0].k],[4,4]);
    d=PE.parseDaily('KKでAAに2回負けた'); assert.equal(d.items[0].vill.r1,12); assert.equal(d.items[0].k,2);
    d=PE.parseDaily('QQ 三回やって三回とも負け'); assert.deepEqual([d.items[0].n,d.items[0].k],[3,3]);
    d=PE.parseDaily('AK何回も負けた'); assert.equal(d.items[0].vague,true);
    d=PE.parseDaily('今日ついてない'); assert.equal(d.items.length,0); assert.equal(d.leftovers.length,1);
  });
  check('parseDaily edge cases', () => {
    const nk = t => PE.parseDaily(t).items.map(i => [i.label, i.n, i.k, !!i.vill]);
    assert.deepStrictEqual(nk('AhKh 5回中4回負け'), [['AKs', 5, 4, false]]);
    assert.deepStrictEqual(nk('ロケットで2回飛ばされた。あとQQで、4回中3回やられた'), [['AA', null, 2, false], ['QQ', 4, 3, false]]);
    assert.deepStrictEqual(nk('3勝5敗 AK'), [['AK', 8, 5, false]]);
    assert.deepStrictEqual(nk('AAで3回やって1回も勝てなかった'), [['AA', 3, 3, false]]);
    assert.strictEqual(PE.looksDaily('今日AA vs KKで負けた'), false);
  });
  check('binomial and convolution tails', () => {
    assert.ok(Math.abs(PE.binomTail(3,3,.2)-.008)<1e-12);
    assert.ok(Math.abs(PE.binomTail(8,5,.55)-.477)<.002);
    assert.ok(Math.abs(PE.sumTail([{n:8,p:.55}],5)-PE.binomTail(8,5,.55))<1e-12);
  });
  check('handEquity estimates and speed', () => {
    const start=Date.now();
    const aa=PE.handEquity({r1:12,r2:12,suited:null},null);
    const kk=PE.handEquity({r1:11,r2:11,suited:null},{r1:12,r2:12,suited:null});
    const ak=PE.handEquity({r1:12,r2:11,suited:false},{r1:10,r2:10,suited:null});
    assert.ok(Math.abs(aa.eq-.85)<.04,`AA range equity ${aa.eq}`);
    assert.ok(Math.abs(kk.eq-.18)<.01,`KK vs AA ${kk.eq}`);
    assert.ok(Math.abs(ak.eq-.43)<.01,`AKo vs QQ ${ak.eq}`);
    assert.ok(Date.now()-start<600,`three samplesets took ${Date.now()-start}ms`);
  });
  console.log(`${checks} checks OK`);
}

main().catch(err => { console.error(err.stack || err); process.exitCode = 1; });
