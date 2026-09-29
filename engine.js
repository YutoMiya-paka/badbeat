/* バッドビート相談所 — 計算エンジン（カード・役判定・勝率計算・入力の読み取り）
 * 画面やセリフには依存しない。Phase 2 の「1日まとめ」でも同じ関数を使う。 */
(function (root) {
  'use strict';

  var RANKS = '23456789TJQKA';
  var SUITS = 'shdc';
  var SUIT_SYM = ['♠', '♥', '♦', '♣'];
  var SUIT_FROM = { s: 0, h: 1, d: 2, c: 3, '♠': 0, '♥': 1, '♦': 2, '♣': 3 };
  var CAT_NAMES = ['ハイカード', 'ワンペア', 'ツーペア', 'スリーカード', 'ストレート',
    'フラッシュ', 'フルハウス', 'フォーカード', 'ストレートフラッシュ'];
  var STREET_NAMES = { 0: 'プリフロップ', 3: 'フロップ', 4: 'ターン', 5: 'リバー' };

  // カードは 0..51 の整数。rank = c >> 2（0 = 2, 12 = A）, suit = c & 3
  function makeCard(r, s) { return r * 4 + s; }
  function rankOf(c) { return c >> 2; }
  function suitOf(c) { return c & 3; }
  function cardStr(c) { return RANKS[c >> 2] + SUITS[c & 3]; }

  // ---------- 役判定 ----------
  var counts = new Uint8Array(13);
  var suitMask = new Int32Array(4);

  function popcount(x) {
    var n = 0;
    while (x) { x &= x - 1; n++; }
    return n;
  }
  // 5 連続の最上位を返す（13 = A ハイ, 4 = 5 ハイのホイール）。無ければ -1
  function straightHigh(mask) {
    var m = (mask << 1) | ((mask >> 12) & 1);
    for (var h = 13; h >= 4; h--) {
      if (((m >> (h - 4)) & 31) === 31) return h;
    }
    return -1;
  }
  function topBits(mask, n) {
    var out = 0;
    for (var r = 12; r >= 0 && n > 0; r--) {
      if (mask & (1 << r)) { out |= 1 << r; n--; }
    }
    return out;
  }
  // 5〜7 枚から最強の 5 枚の強さを整数で返す（大きいほど強い）。上位ビットが役の種類
  function evalCards(arr, len) {
    if (len === undefined) len = arr.length;
    counts.fill(0);
    suitMask[0] = suitMask[1] = suitMask[2] = suitMask[3] = 0;
    var all = 0, i, r;
    for (i = 0; i < len; i++) {
      var c = arr[i];
      r = c >> 2;
      counts[r]++;
      suitMask[c & 3] |= 1 << r;
      all |= 1 << r;
    }
    var flushMask = 0;
    for (i = 0; i < 4; i++) {
      if (popcount(suitMask[i]) >= 5) flushMask = suitMask[i];
    }
    if (flushMask) {
      var sf = straightHigh(flushMask);
      if (sf >= 0) return (8 << 26) | sf;
    }
    var quad = -1, t1 = -1, t2 = -1, p1 = -1, p2 = -1;
    for (r = 12; r >= 0; r--) {
      var n = counts[r];
      if (n === 4) quad = r;
      else if (n === 3) { if (t1 < 0) t1 = r; else if (t2 < 0) t2 = r; }
      else if (n === 2) { if (p1 < 0) p1 = r; else if (p2 < 0) p2 = r; }
    }
    if (quad >= 0) return (7 << 26) | (quad << 13) | topBits(all & ~(1 << quad), 1);
    if (t1 >= 0 && (t2 >= 0 || p1 >= 0)) return (6 << 26) | (t1 << 4) | Math.max(t2, p1);
    if (flushMask) return (5 << 26) | topBits(flushMask, 5);
    var st = straightHigh(all);
    if (st >= 0) return (4 << 26) | st;
    if (t1 >= 0) return (3 << 26) | (t1 << 13) | topBits(all & ~(1 << t1), 2);
    if (p2 >= 0) return (2 << 26) | (p1 << 17) | (p2 << 13) | topBits(all & ~(1 << p1) & ~(1 << p2), 1);
    if (p1 >= 0) return (1 << 26) | (p1 << 13) | topBits(all & ~(1 << p1), 3);
    return topBits(all, 5);
  }
  function categoryOf(score) { return score >>> 26; }

  // ---------- 勝率計算（残りのボードを全通り数える） ----------
  function tick() { return new Promise(function (res) { setTimeout(res, 0); }); }
  function choose(n, k) {
    if (k < 0 || k > n) return 0;
    var x = 1;
    for (var i = 1; i <= k; i++) x = x * (n - k + i) / i;
    return x;
  }

  async function equity(hero, vill, board, onProgress) {
    var known = {};
    hero.concat(vill, board).forEach(function (c) { known[c] = true; });
    var deck = [];
    for (var c = 0; c < 52; c++) if (!known[c]) deck.push(c);
    var k = 5 - board.length;
    var h = new Int32Array(7), v = new Int32Array(7);
    h[0] = hero[0]; h[1] = hero[1]; v[0] = vill[0]; v[1] = vill[1];
    board.forEach(function (bc, i) { h[2 + i] = bc; v[2 + i] = bc; });
    var win = 0, lose = 0, tie = 0, n = deck.length;

    function showdown() {
      var a = evalCards(h, 7), b = evalCards(v, 7);
      if (a > b) win++; else if (a < b) lose++; else tie++;
    }
    function rec(start, depth, pos) {
      if (depth === 0) { showdown(); return; }
      for (var i = start; i <= n - depth; i++) {
        h[pos] = v[pos] = deck[i];
        rec(i + 1, depth - 1, pos + 1);
      }
    }

    if (k === 0) {
      showdown();
    } else {
      var pos = 2 + board.length, total = choose(n, k), done = 0;
      for (var i = 0; i <= n - k; i++) {
        h[pos] = v[pos] = deck[i];
        rec(i + 1, k - 1, pos + 1);
        done += choose(n - i - 1, k - 1);
        if (k >= 4) {
          if (onProgress) onProgress(done / total);
          await tick();
        }
      }
    }
    var sum = win + lose + tie;
    return { win: win / sum, lose: lose / sum, tie: tie / sum, boards: sum };
  }

  // ターンまでのボード 4 枚から、リバーで相手が勝つ札・引き分けの札を数える
  function riverCards(hero, vill, board4) {
    var known = {};
    hero.concat(vill, board4).forEach(function (c) { known[c] = true; });
    var villWins = [], ties = [], total = 0;
    for (var c = 0; c < 52; c++) {
      if (known[c]) continue;
      total++;
      var b = board4.concat([c]);
      var a = evalCards(hero.concat(b), 7), d = evalCards(vill.concat(b), 7);
      if (d > a) villWins.push(c); else if (d === a) ties.push(c);
    }
    return { villWins: villWins, ties: ties, total: total };
  }

  // 1 ハンドの分析。spec = { hero:[c,c], vill:[c,c], board:[..0-5], street:0|3|4 }
  async function analyze(spec, onProgress) {
    var hero = spec.hero, vill = spec.vill, board = spec.board, street = spec.street;
    var steps = [];
    var streets = [0, 3, 4].filter(function (s) { return s >= street && s <= board.length; });
    for (var i = 0; i < streets.length; i++) {
      var s = streets[i];
      var e = await equity(hero, vill, board.slice(0, s), i === 0 ? onProgress : null);
      steps.push({ street: s, win: e.win, lose: e.lose, tie: e.tie, boards: e.boards });
    }
    var final = null;
    if (board.length === 5) {
      var a = evalCards(hero.concat(board), 7), b = evalCards(vill.concat(board), 7);
      final = {
        result: a > b ? 'win' : a < b ? 'lose' : 'tie',
        heroCat: categoryOf(a), villCat: categoryOf(b)
      };
    }
    var river = board.length >= 4 ? riverCards(hero, vill, board.slice(0, 4)) : null;
    var heroCatAtAllin = street >= 3 ? categoryOf(evalCards(hero.concat(board.slice(0, street)))) : null;
    var villCatAtAllin = street >= 3 ? categoryOf(evalCards(vill.concat(board.slice(0, street)))) : null;
    return {
      spec: spec, allin: steps[0], steps: steps, final: final, river: river,
      heroCatAtAllin: heroCatAtAllin, villCatAtAllin: villCatAtAllin
    };
  }

  // ---------- 入力の読み取り ----------
  var NAME_MAP = [
    [/エーシーズ|ロケット|ポケットエース/g, ' AA '],
    [/キングス|キンキン|カウボーイ/g, ' KK '],
    [/クイーンズ|レディース/g, ' QQ '],
    [/ジャックス|フックス/g, ' JJ '],
    [/ビッグスリック|エーケー/g, ' AK '],
    [/エースキング/g, ' AK ']
  ];
  var TOKEN_RE = /(?<![A-Za-z])((?:[2-9TJQKA][shdc♠♥♦♣])+|[2-9TJQKA]{2}[so]?)(?![A-Za-z])/gi;

  function detectStreet(text) {
    var t = text.toLowerCase();
    var words = [
      { s: 0, re: /プリ(フロ)?|ぷりふろ|pre(flop)?/ },
      { s: 3, re: /フロップ|ふろっぷ|flop/ },
      { s: 4, re: /ターン|たーん|turn/ }
    ];
    // 「〜でオールイン」のように、オールインの直前にある語を最優先
    var allin = t.search(/オールイン|おーるいん|all ?-?in|突っ込|つっこ|ぶっこ|入れた/);
    var best = null;
    words.forEach(function (w) {
      var re = new RegExp(w.re.source, 'g'), m;
      while ((m = re.exec(t))) {
        var score = allin >= 0 && m.index < allin ? allin - m.index : 10000 + m.index;
        if (!best || score < best.score) best = { s: w.s, score: score };
      }
    });
    return best ? best.s : null;
  }

  function parse(text) {
    var t = text.normalize('NFKC');
    NAME_MAP.forEach(function (p) { t = t.replace(p[0], p[1]); });
    t = t.replace(/\bv\.?s\.?\b|対/gi, ' / ');
    // 「10ハート」のようなマークの名前を記号に、ランクとしての「10」を T に（回数の「10回」などは触らない）
    t = t.replace(/(10|[2-9TJQKA])\s*(スペード|ハート|ダイヤ|クラブ)/gi, function (_, r, w) {
      return r + { 'スペード': 's', 'ハート': 'h', 'ダイヤ': 'd', 'クラブ': 'c' }[w];
    });
    t = t.replace(/(?<!\d)10\s*10(?!\d)/g, 'TT')
      .replace(/10(?=[shdc♠♥♦♣])/gi, 'T')
      .replace(/(?<=[2-9TJQKA])10(?![\d回戦勝敗])/gi, 'T')
      .replace(/(?<!\d)10(?=[2-9TJQKA](?![shdc♠♥♦♣])(?:[so](?![A-Za-z]))?(?![A-Za-z\d]))/gi, 'T');

    var items = [], m;
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(t))) {
      var tok = m[1];
      if (/[shdc♠♥♦♣]$/i.test(tok) && tok.length % 2 === 0 && !/^[2-9TJQKA]{2}s$/i.test(tok)) {
        for (var i = 0; i < tok.length; i += 2) {
          items.push({ card: makeCard(RANKS.indexOf(tok[i].toUpperCase()), SUIT_FROM[tok[i + 1].toLowerCase()]) });
        }
      } else if (/^[2-9TJQKA]{2}s$/i.test(tok) && tok[0].toUpperCase() === tok[1].toUpperCase()) {
        // 「KKs」など：ペアのスーテッドはありえないので K♠ K… ではなく読み違いとして扱う
        return { error: '「' + tok + '」が読めなかった。ペアに s（スーテッド）は付かないぞ。' };
      } else if (/^[2-9TJQKA]{2}s$/i.test(tok)) {
        items.push({ hand: [RANKS.indexOf(tok[0].toUpperCase()), RANKS.indexOf(tok[1].toUpperCase())], suited: true });
      } else {
        var last = tok[tok.length - 1].toLowerCase();
        items.push({
          hand: [RANKS.indexOf(tok[0].toUpperCase()), RANKS.indexOf(tok[1].toUpperCase())],
          suited: last === 'o' ? false : null
        });
      }
    }
    if (!items.length) return { error: 'none' };

    // 前から順に「自分 2 枚 → 相手 2 枚 → 残りはボード」と割り当てる
    var slots = [], idx = 0;
    function takeHand(label) {
      var it = items[idx];
      if (!it) return { error: label + 'の手札が見つからない。「AhAs vs KdKc」みたいに 2 人分書いてくれ。' };
      if (it.hand) { idx++; return { shorthand: it }; }
      var nx = items[idx + 1];
      if (!nx || nx.hand) return { error: label + 'の手札が 2 枚そろってない。' };
      idx += 2;
      return { cards: [it.card, nx.card] };
    }
    var heroT = takeHand('自分');
    if (heroT.error) return heroT;
    var villT = takeHand('相手');
    if (villT.error) return villT;
    var board = [];
    for (; idx < items.length; idx++) {
      if (items[idx].hand) return { error: 'ボードはスートまで書いてくれ（例: Qh 7c 2d）。' };
      board.push(items[idx].card);
    }
    if (board.length > 5) return { error: 'ボードが ' + board.length + ' 枚ある。多くても 5 枚だ。' };

    var used = {};
    var explicit = (heroT.cards || []).concat(villT.cards || [], board);
    for (var e = 0; e < explicit.length; e++) {
      if (used[explicit[e]]) return { error: cardStr(explicit[e]) + ' が 2 回出てくる。同じカードは 1 枚しかないぞ。' };
      used[explicit[e]] = true;
    }
    var autoSuits = false;
    function assign(hand, prefer, avoid) {
      var r1 = hand.hand[0], r2 = hand.hand[1];
      var order = prefer.slice().sort(function (a, b) { return (avoid[a] ? 1 : 0) - (avoid[b] ? 1 : 0); });
      function free(r, s) { return !used[makeCard(r, s)]; }
      var picks = null;
      if (r1 === r2) {
        var ss = order.filter(function (s) { return free(r1, s); });
        if (ss.length >= 2) picks = [makeCard(r1, ss[0]), makeCard(r1, ss[1])];
      } else if (hand.suited) {
        for (var i = 0; i < order.length && !picks; i++) {
          if (free(r1, order[i]) && free(r2, order[i])) picks = [makeCard(r1, order[i]), makeCard(r2, order[i])];
        }
      } else {
        for (var a = 0; a < order.length && !picks; a++) {
          for (var b = 0; b < order.length && !picks; b++) {
            if (a !== b && free(r1, order[a]) && free(r2, order[b])) picks = [makeCard(r1, order[a]), makeCard(r2, order[b])];
          }
        }
      }
      if (!picks) return null;
      used[picks[0]] = used[picks[1]] = true;
      autoSuits = true;
      return picks;
    }
    var hero = heroT.cards || assign(heroT.shorthand, [0, 1, 2, 3], {});
    if (!hero) return { error: '自分の手札のカードがボードや相手と重なって作れない。' };
    var heroSuits = {}; heroSuits[suitOf(hero[0])] = heroSuits[suitOf(hero[1])] = true;
    var vill = villT.cards || assign(villT.shorthand, [2, 3, 0, 1], heroSuits);
    if (!vill) return { error: '相手の手札のカードが重なって作れない。' };

    var street = detectStreet(t);
    var streetGuessed = street === null;
    if (street === null) street = 0;
    if (board.length < street) {
      return { error: STREET_NAMES[street] + 'でオールインなら、そのときのボード（' + street + ' 枚）も書いてくれ。' };
    }
    if (board.length === 1 || board.length === 2) {
      return { error: 'ボードは 3 枚（フロップ）から書いてくれ。' };
    }
    return { hero: hero, vill: vill, board: board, street: street, autoSuits: autoSuits, streetGuessed: streetGuessed };
  }

  // ---------- 1 日まとめ ----------
  function dailyNormalize(text) {
    var t = String(text).normalize('NFKC');
    // 漢数字（一〜九十九）を算用数字に。十の位と一の位を組み合わせて読む（二十一 → 21）
    var KD = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
    t = t.replace(/([一二三四五六七八九])?十([一二三四五六七八九])?|[一二三四五六七八九]/g, function (w, a, b) {
      if (w.indexOf('十') < 0) return String(KD[w]);
      return String((a ? KD[a] : 1) * 10 + (b ? KD[b] : 0));
    });
    NAME_MAP.forEach(function(p){ t=t.replace(p[0],p[1]); });
    return t;
  }
  var COUNT_RE = /\d+\s*(?:回|戦|敗|勝)|何回も|いっぱい|たくさん|めちゃくちゃ|ずっと/;
  function looksDaily(text) {
    var t = dailyNormalize(text);
    var p = parse(text);
    if (COUNT_RE.test(t)) return !(p && !p.error && p.board && p.board.length >= 3 && !p.autoSuits);
    // 回数が無くても「今日」などがあり、1 ハンドとして読めないときは 1 日まとめとして扱う
    return /今日|一日|1日/.test(t) && !!p.error;
  }
  // 最初の手を 1 つ読む。{ hero, label, start, end } か null
  function parseHandTokens(t) {
    var re = /([2-9TJQKA])([shdc♠♥♦♣])\s*([2-9TJQKA])([shdc♠♥♦♣])/i, m = re.exec(t);
    // 「99回」「22戦」のような回数の数字は手として読まない
    var re2 = /(?<![A-Za-z\d])([2-9TJQKA])([2-9TJQKA])([so])?(?![A-Za-z])(?!\s*(?:回|戦|勝|敗|中))/i, n = re2.exec(t);
    if (m && (!n || m.index <= n.index)) {
      var r1 = RANKS.indexOf(m[1].toUpperCase()), r2 = RANKS.indexOf(m[3].toUpperCase());
      var hi = Math.max(r1, r2), lo = Math.min(r1, r2), suited = hi === lo ? null : m[2].toLowerCase() === m[4].toLowerCase();
      return { hero: { r1: hi, r2: lo, suited: suited }, label: RANKS[hi] + RANKS[lo] + (hi === lo ? '' : suited ? 's' : 'o'),
        start: m.index, end: m.index + m[0].length };
    }
    if (!n) return null;
    var x = RANKS.indexOf(n[1].toUpperCase()), y = RANKS.indexOf(n[2].toUpperCase());
    var h2 = Math.max(x, y), l2 = Math.min(x, y), su = h2 === l2 ? null : n[3] ? n[3].toLowerCase() === 's' : null;
    return { hero: { r1: h2, r2: l2, suited: su }, label: RANKS[h2] + RANKS[l2] + (h2 === l2 ? '' : su === true ? 's' : su === false ? 'o' : ''),
      start: n.index, end: n.index + n[0].length };
  }
  var LOSS_WORD = /負け|割られ|やられ|飛ば|抜かれ|まくられ|刺され|敗/;
  function readCounts(body) {
    var n = null, k = null, m;
    var all = /全部|全敗|全て|すべて|1回も勝てな|とも負け/.test(body);
    body = body.replace(/1回も勝て[^\d]*/g, ' ').replace(/1日/g, ' ');
    if ((m = body.match(/(\d+)\s*勝\s*(\d+)\s*敗/))) { n = +m[1] + +m[2]; k = +m[2]; }
    else if ((m = body.match(/(\d+)\s*戦\s*全敗/))) { n = +m[1]; k = n; }
    else if ((m = body.match(/(\d+)\s*戦\s*(\d+)\s*勝/))) { n = +m[1]; k = Math.max(0, n - +m[2]); }
    else if ((m = body.match(/(\d+)\s*回?\s*勝って\s*(\d+)\s*回?\s*負/))) { n = +m[1] + +m[2]; k = +m[2]; }
    else if ((m = body.match(/(\d+)\s*回?\s*負けて\s*(\d+)\s*回?\s*勝/))) { n = +m[1] + +m[2]; k = +m[1]; }
    else if ((m = body.match(/(\d+)\s*(?:回|戦)?\s*(?:中|やって|オールインして|勝負して|して)\s*(\d+)\s*回?\s*(勝)?/))) {
      n = +m[1]; k = m[3] ? Math.max(0, n - +m[2]) : +m[2];
    }
    else if ((m = body.match(/(\d+)\s*(?:戦|回)\s*(\d+)\s*敗/))) { n = +m[1]; k = +m[2]; }
    else if ((m = body.match(/(\d+)/))) { k = +m[1]; if (all) n = k; }
    // 負け（k）がオールイン回数（n）より多い入力は丸めずにそのまま返す。画面側でエラーを出して聞き直す
    return { n: n, k: k };
  }
  function parseDaily(text) {
    var t = dailyNormalize(text), parts = t.split(/[。\n、,]+|あと|それと/), joined = [];
    parts.forEach(function (p) {
      if (!p.trim()) return;
      if (!parseHandTokens(p) && joined.length) joined[joined.length - 1] += ' ' + p; else joined.push(p);
    });
    var items = [], leftovers = [];
    joined.forEach(function (raw) {
      var one = parseHandTokens(raw);
      if (!one) { leftovers.push(raw.trim()); return; }
      var rest = raw.slice(one.end), two = parseHandTokens(rest);
      var body = raw.slice(0, one.start) + ' ' + (two ? rest.slice(0, two.start) + ' ' + rest.slice(two.end) : rest);
      var c = readCounts(body), vague = false;
      if (c.k === null && /何回も|いっぱい|たくさん|めちゃくちゃ|ずっと/.test(body)) vague = true;
      items.push({ label: one.label, hero: one.hero, vill: two ? two.hero : null, n: c.n, k: c.k, vague: vague, raw: raw.trim() });
    });
    return { items: items, leftovers: leftovers };
  }
  function mulberry32(a){return function(){var t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
  var DEFAULT_RANGE={text:'99以上のペア、AJs以上、KQs、AQo以上',hands:[]};
  (function(){for(var a=0;a<13;a++)for(var b=0;b<=a;b++){if(a===b&&a>=7)DEFAULT_RANGE.hands.push({r1:a,r2:b,suited:null});else if(a===12&&b===9)DEFAULT_RANGE.hands.push({r1:a,r2:b,suited:true});else if(a===12&&b>=10){DEFAULT_RANGE.hands.push({r1:a,r2:b,suited:true});DEFAULT_RANGE.hands.push({r1:a,r2:b,suited:false});}else if(a===11&&b===10)DEFAULT_RANGE.hands.push({r1:a,r2:b,suited:true});}})();
  function handEquity(hero,vill,samples){
    samples=samples||30000; var seed=2166136261, txt=String(hero.r1)+','+hero.r2+','+hero.suited+':'+(vill?JSON.stringify(vill):'range');for(var z=0;z<txt.length;z++)seed=Math.imul(seed^txt.charCodeAt(z),16777619);var rnd=mulberry32(seed>>>0);
    function combo(h){var out=[];for(var s=0;s<4;s++)for(var q=0;q<4;q++)if(h.r1!==h.r2||s<q){if(h.r1!==h.r2&&h.suited===true&&s!==q)continue;if(h.r1!==h.r2&&h.suited===false&&s===q)continue;out.push([makeCard(h.r1,s),makeCard(h.r2,q)]);}return out;}
    var hc=combo(hero), vc=vill?combo(vill):null, w=0,l=0,t=0;
    for(var i=0;i<samples;i++){var hh=hc[(rnd()*hc.length)|0], vv=null,deck=[];if(vc){var avail=vc.filter(function(x){return x[0]!==hh[0]&&x[0]!==hh[1]&&x[1]!==hh[0]&&x[1]!==hh[1];});vv=avail[(rnd()*avail.length)|0];}else{for(var q=0;q<DEFAULT_RANGE.hands.length;q++){var c=combo(DEFAULT_RANGE.hands[q]);for(var j=0;j<c.length;j++)if(!hh.includes(c[j][0])&&!hh.includes(c[j][1]))deck.push(c[j]);}vv=deck[(rnd()*deck.length)|0];}
      var used={};hh.concat(vv).forEach(function(c){used[c]=1;});deck=[];for(var c=0;c<52;c++)if(!used[c])deck.push(c);for(var q=deck.length-1;q>0;q--){var ix=(rnd()*(q+1))|0,x=deck[q];deck[q]=deck[ix];deck[ix]=x;}var board=deck.slice(0,5),a=evalCards(hh.concat(board)),b=evalCards(vv.concat(board));if(a>b)w++;else if(a<b)l++;else t++;
    }
    return {eq:(w+t/2)/samples,lose:l/samples,tie:t/samples,samples:samples,range:vill?null:DEFAULT_RANGE};
  }
  function binomTail(n,k,p){if(k<=0)return 1;if(k>n)return 0;var probs=[1];for(var i=0;i<n;i++){var next=new Array(probs.length+1).fill(0);for(var j=0;j<probs.length;j++){next[j]+=probs[j]*(1-p);next[j+1]+=probs[j]*p;}probs=next;}return probs.slice(k).reduce(function(a,b){return a+b;},0);}
  function sumTail(list,K){var d=[1];list.forEach(function(x){var next=new Array(d.length+x.n).fill(0);d.forEach(function(v,i){for(var j=0;j<=x.n;j++){var c=binomTail(x.n,j,x.p)-binomTail(x.n,j+1,x.p);next[i+j]+=v*c;}});d=next;});return d.slice(K).reduce(function(a,b){return a+b;},0);}

  root.PokerEngine = {
    RANKS: RANKS, SUITS: SUITS, SUIT_SYM: SUIT_SYM, CAT_NAMES: CAT_NAMES, STREET_NAMES: STREET_NAMES,
    makeCard: makeCard, rankOf: rankOf, suitOf: suitOf, cardStr: cardStr,
    evalCards: evalCards, categoryOf: categoryOf,
    equity: equity, riverCards: riverCards, analyze: analyze, parse: parse,
    looksDaily: looksDaily, parseDaily: parseDaily, handEquity: handEquity,
    binomTail: binomTail, sumTail: sumTail, DEFAULT_RANGE: DEFAULT_RANGE
  };
})(typeof window !== 'undefined' ? window : globalThis);
