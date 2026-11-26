(function (global) {
  'use strict';

  const HIRAGANA_FILLERS = Array.from(
    'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん'
  );
  const KATAKANA_FILLERS = Array.from(
    'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン'
  );

  function shuffle(arr) {
    return global.VocabLoader.shuffle(arr);
  }

  /**
   * Pick N distinct distractor items whose word, kana, and visible answer signature do not collide with `correctItem`.
   */
  function buildDistractors(correctItem, primaryPool, fallbackPool, config, count = 3) {
    const usedWords = new Set([correctItem.word]);
    const usedKana = new Set([correctItem.kana]);
    const usedSig = new Set([global.VocabLoader.getAnswerSignature(correctItem, config)]);
    const distractors = [];

    const scanPool = (pool) => {
      if (!pool || pool.length === 0) return;
      const shuffled = shuffle(pool);
      for (const item of shuffled) {
        if (distractors.length >= count) break;
        const sig = global.VocabLoader.getAnswerSignature(item, config);
        if (usedWords.has(item.word) || usedKana.has(item.kana) || (sig && usedSig.has(sig))) {
          continue;
        }
        usedWords.add(item.word);
        usedKana.add(item.kana);
        if (sig) usedSig.add(sig);
        distractors.push(item);
      }
    };

    scanPool(primaryPool);
    if (distractors.length < count) {
      scanPool(fallbackPool);
    }

    return distractors;
  }

  /**
   * Build Multiple Choice question items with 4 shuffled options each.
   */
  function buildMultipleChoiceSession(sampledWords, pool, fullDataset, config) {
    return sampledWords.map((vocab, idx) => {
      const distractors = buildDistractors(vocab, pool, fullDataset, config, 3);
      const options = shuffle([vocab, ...distractors]);
      return {
        id: `mc-${idx}`,
        vocab,
        options,
      };
    });
  }

  /**
   * Check whether `chars` can be placed at (row, col) with direction ('across' | 'down') on a sparse grid map,
   * enforcing standard crossword adjacency rules (no unintended parallel touching or end-caps).
   */
  function canPlaceCrosswordWord(grid, chars, row, col, dir) {
    const dr = dir === 'down' ? 1 : 0;
    const dc = dir === 'across' ? 1 : 0;
    const key = (r, c) => `${r},${c}`;

    // Cell immediately before start and after end must be empty
    if (grid.has(key(row - dr, col - dc))) return { ok: false, intersections: 0 };
    if (grid.has(key(row + dr * chars.length, col + dc * chars.length))) {
      return { ok: false, intersections: 0 };
    }

    let intersections = 0;

    for (let i = 0; i < chars.length; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      const existing = grid.get(key(r, c));

      if (existing !== undefined) {
        if (existing !== chars[i]) {
          return { ok: false, intersections: 0 };
        }
        intersections += 1;
      } else {
        // Perpendicular neighbours of a newly written cell must be empty to prevent illegal glued letters
        if (dir === 'across') {
          if (grid.has(key(r - 1, c)) || grid.has(key(r + 1, c))) {
            return { ok: false, intersections: 0 };
          }
        } else {
          if (grid.has(key(r, c - 1)) || grid.has(key(r, c + 1))) {
            return { ok: false, intersections: 0 };
          }
        }
      }
    }

    return { ok: true, intersections };
  }

  /**
   * Build a single intersecting crossword puzzle board from a batch of words (uses kana chars, len 2..8).
   * Multi-pass greedy placement ensures dense 5-6 word intersecting grids.
   */
  function generateSingleCrossword(batchWords, pool, fullDataset, config, maxWords = 6) {
    const candidates = batchWords
      .filter((w) => {
        const len = Array.from(w.kana).length;
        return len >= 2 && len <= 8;
      })
      .sort((a, b) => Array.from(b.kana).length - Array.from(a.kana).length);

    if (candidates.length === 0) return null;

    const grid = new Map();
    const placed = [];
    const remaining = candidates.slice();
    const key = (r, c) => `${r},${c}`;

    const commitWord = (vocab, chars, row, col, dir) => {
      const dr = dir === 'down' ? 1 : 0;
      const dc = dir === 'across' ? 1 : 0;
      const cells = [];
      for (let i = 0; i < chars.length; i++) {
        const r = row + dr * i;
        const c = col + dc * i;
        grid.set(key(r, c), chars[i]);
        cells.push({ r, c, ch: chars[i] });
      }
      placed.push({ vocab, chars, row, col, dir, cells });
    };

    // Place first (longest) word horizontally at (0, 0)
    const first = remaining.shift();
    commitWord(first, Array.from(first.kana), 0, 0, 'across');

    // Multi-pass greedy intersection placement up to `maxWords`
    let progress = true;
    while (progress && placed.length < maxWords && remaining.length > 0) {
      progress = false;
      let bestOverall = null;

      for (let wIdx = 0; wIdx < remaining.length; wIdx++) {
        const vocab = remaining[wIdx];
        const chars = Array.from(vocab.kana);

        for (const [cellKey, cellChar] of grid.entries()) {
          const [gr, gc] = cellKey.split(',').map(Number);

          for (let ci = 0; ci < chars.length; ci++) {
            if (chars[ci] !== cellChar) continue;

            for (const dir of ['down', 'across']) {
              const startR = dir === 'down' ? gr - ci : gr;
              const startC = dir === 'across' ? gc - ci : gc;
              const check = canPlaceCrosswordWord(grid, chars, startR, startC, dir);
              if (!check.ok || check.intersections === 0) continue;

              let minR = startR;
              let maxR = startR + (dir === 'down' ? chars.length - 1 : 0);
              let minC = startC;
              let maxC = startC + (dir === 'across' ? chars.length - 1 : 0);

              for (const k of grid.keys()) {
                const [rr, cc] = k.split(',').map(Number);
                if (rr < minR) minR = rr;
                if (rr > maxR) maxR = rr;
                if (cc < minC) minC = cc;
                if (cc > maxC) maxC = cc;
              }

              const spanR = maxR - minR + 1;
              const spanC = maxC - minC + 1;
              if (spanR > 11 || spanC > 11) continue;

              const score = check.intersections * 25 - Math.abs(spanR - spanC) * 2 - (spanR + spanC);
              if (!bestOverall || score > bestOverall.score) {
                bestOverall = { wIdx, vocab, chars, startR, startC, dir, score };
              }
            }
          }
        }
      }

      if (bestOverall) {
        commitWord(
          bestOverall.vocab,
          bestOverall.chars,
          bestOverall.startR,
          bestOverall.startC,
          bestOverall.dir
        );
        remaining.splice(bestOverall.wIdx, 1);
        progress = true;
      }
    }

    // If only 1 word was placed (rare: zero shared kana in tiny batch), place a 2nd word detached nearby
    if (placed.length === 1 && remaining.length > 0) {
      const second = remaining.shift();
      commitWord(second, Array.from(second.kana), 2, 0, 'across');
    }

    // Normalise coordinates to 0..rows-1, 0..cols-1
    let minR = Infinity;
    let maxR = -Infinity;
    let minC = Infinity;
    let maxC = -Infinity;

    for (const k of grid.keys()) {
      const [r, c] = k.split(',').map(Number);
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
    }

    const rows = maxR - minR + 1;
    const cols = maxC - minC + 1;

    // Assign standard crossword clue numbers (top-to-bottom, left-to-right)
    const startNumberMap = new Map();
    const sortedEntries = placed
      .map((p, idx) => ({
        id: `cw-${idx}`,
        vocab: p.vocab,
        chars: p.chars,
        row: p.row - minR,
        col: p.col - minC,
        dir: p.dir,
        cells: p.cells.map((cell) => ({ r: cell.r - minR, c: cell.c - minC, ch: cell.ch })),
      }))
      .sort((a, b) => a.row - b.row || a.col - b.col || (a.dir === 'across' ? -1 : 1));

    let clueNum = 1;
    for (const entry of sortedEntries) {
      const sk = `${entry.row},${entry.col}`;
      if (!startNumberMap.has(sk)) {
        startNumberMap.set(sk, clueNum++);
      }
      entry.number = startNumberMap.get(sk);

      // Build 4 answer options (correct + 3 distractors of similar kana length where possible)
      const sameLenPool = pool.filter(
        (w) => Array.from(w.kana).length === entry.chars.length && w.kana !== entry.vocab.kana
      );
      const distractors = buildDistractors(
        entry.vocab,
        sameLenPool.length >= 3 ? sameLenPool : pool,
        fullDataset,
        config,
        3
      );
      entry.options = shuffle([entry.vocab, ...distractors]);
      entry.solved = false;
    }

    // Build cell matrix
    const cells = Array.from({ length: rows }, () => Array(cols).fill(null));
    for (const entry of sortedEntries) {
      for (const c of entry.cells) {
        if (!cells[c.r][c.c]) {
          cells[c.r][c.c] = {
            r: c.r,
            c: c.c,
            ch: c.ch,
            number: startNumberMap.get(`${c.r},${c.c}`) || null,
            entryIds: [],
            revealed: false,
          };
        }
        cells[c.r][c.c].entryIds.push(entry.id);
      }
    }

    return {
      rows,
      cols,
      cells,
      entries: sortedEntries,
    };
  }

  /**
   * Build sequential crossword boards covering the player's sampled words (up to 6 intersecting words per board).
   */
  function buildCrosswordBoards(sampledWords, pool, fullDataset, config, wordsPerBoard = 6) {
    // Filter to 2..8 kana words; top up from pool if needed
    const eligible = sampledWords.filter((w) => {
      const len = Array.from(w.kana).length;
      return len >= 2 && len <= 8;
    });
    const source =
      eligible.length > 0
        ? eligible
        : pool.filter((w) => {
            const len = Array.from(w.kana).length;
            return len >= 2 && len <= 8;
          });

    const queue = source.slice();
    const boards = [];
    const seenWords = new Set();

    while (queue.length > 0 && boards.length < 35) {
      const batch = [];
      const batchSize = Math.min(queue.length, Math.max(wordsPerBoard * 4, 24));
      for (let i = 0; i < batchSize; i++) {
        const w = queue[i];
        if (!seenWords.has(w.kana)) {
          batch.push(w);
        }
      }
      if (batch.length === 0) break;

      const remainingNeeded = Math.max(1, sampledWords.length - boards.reduce((s, b) => s + b.entries.length, 0));
      const targetOnBoard = Math.min(wordsPerBoard, remainingNeeded);
      const board = generateSingleCrossword(batch, pool, fullDataset, config, targetOnBoard);
      if (!board || board.entries.length === 0) break;

      // Keep at most `wordsPerBoard` placed entries on a board
      const usedKana = new Set(board.entries.map((e) => e.vocab.kana));
      for (const k of usedKana) seenWords.add(k);

      // Remove placed words from queue
      for (let i = queue.length - 1; i >= 0; i--) {
        if (usedKana.has(queue[i].kana)) {
          queue.splice(i, 1);
        }
      }

      boards.push(board);
      // Stop once we've placed at least `sampledWords.length` total entries or exhausted queue
      const totalPlaced = boards.reduce((sum, b) => sum + b.entries.length, 0);
      if (totalPlaced >= sampledWords.length) break;
    }

    return boards;
  }

  /**
   * Build sequential Wordsearch boards (horizontal & vertical words only, 6 words per board).
   */
  function buildWordsearchBoards(sampledWords, pool, config, wordsPerBoard = 6) {
    const eligible = sampledWords.filter((w) => {
      const len = Array.from(w.kana).length;
      return len >= 2 && len <= 8;
    });
    const source =
      eligible.length > 0
        ? eligible
        : pool.filter((w) => {
            const len = Array.from(w.kana).length;
            return len >= 2 && len <= 8;
          });

    const boards = [];
    for (let offset = 0; offset < source.length; offset += wordsPerBoard) {
      const slice = source.slice(offset, offset + wordsPerBoard);
      const board = generateSingleWordsearch(slice, config);
      if (board && board.words.length > 0) {
        boards.push(board);
      }
    }
    return boards;
  }

  function generateSingleWordsearch(batchWords, config) {
    // Deduplicate kana on the same board
    const uniqueWords = [];
    const seen = new Set();
    for (const w of batchWords) {
      if (!seen.has(w.kana)) {
        seen.add(w.kana);
        uniqueWords.push(w);
      }
    }
    if (uniqueWords.length === 0) return null;

    const maxWordLen = Math.max(...uniqueWords.map((w) => Array.from(w.kana).length));
    const size = Math.max(8, Math.min(11, maxWordLen + 3));
    const grid = Array.from({ length: size }, () => Array(size).fill(null));
    const placedWords = [];

    // Sort longest first for higher placement success
    const ordered = uniqueWords
      .slice()
      .sort((a, b) => Array.from(b.kana).length - Array.from(a.kana).length);

    ordered.forEach((vocab, idx) => {
      const chars = Array.from(vocab.kana);
      if (chars.length > size) return;

      // Alternate preferred orientation so boards always have a lively mix of horizontal & vertical lines
      const dirs = idx % 2 === 0 ? ['across', 'down'] : ['down', 'across'];
      let placed = null;

      for (const dir of dirs) {
        const maxR = dir === 'down' ? size - chars.length : size - 1;
        const maxC = dir === 'across' ? size - chars.length : size - 1;
        const candidates = [];

        for (let r = 0; r <= maxR; r++) {
          for (let c = 0; c <= maxC; c++) {
            let valid = true;
            let overlap = 0;
            for (let i = 0; i < chars.length; i++) {
              const rr = dir === 'down' ? r + i : r;
              const cc = dir === 'across' ? c + i : c;
              const cell = grid[rr][cc];
              if (cell !== null && cell !== chars[i]) {
                valid = false;
                break;
              }
              if (cell === chars[i]) overlap += 1;
            }
            if (valid) {
              candidates.push({ r, c, dir, overlap });
            }
          }
        }

        if (candidates.length > 0) {
          // Prefer occasional overlaps or random clean placement
          const shuffled = shuffle(candidates);
          shuffled.sort((a, b) => b.overlap - a.overlap);
          const pick = shuffled[Math.floor(Math.random() * Math.min(6, shuffled.length))];
          placed = pick;
          break;
        }
      }

      if (placed) {
        const cells = [];
        for (let i = 0; i < chars.length; i++) {
          const rr = placed.dir === 'down' ? placed.r + i : placed.r;
          const cc = placed.dir === 'across' ? placed.c + i : placed.c;
          grid[rr][cc] = chars[i];
          cells.push({ r: rr, c: cc, ch: chars[i] });
        }
        placedWords.push({
          id: `ws-${idx}`,
          vocab,
          chars,
          dir: placed.dir,
          startR: placed.r,
          startC: placed.c,
          endR: cells[cells.length - 1].r,
          endC: cells[cells.length - 1].c,
          cells,
          found: false,
        });
      }
    });

    // Choose script-appropriate filler pool
    let fillerPool = HIRAGANA_FILLERS;
    if (config && config.kanaMode === 'katakana') {
      fillerPool = KATAKANA_FILLERS;
    } else if (config && config.kanaMode === 'both') {
      const hasKata = placedWords.some((w) => w.vocab.kanaType === 'katakana');
      const hasHira = placedWords.some((w) => w.vocab.kanaType === 'hiragana');
      fillerPool = hasKata && !hasHira ? KATAKANA_FILLERS : HIRAGANA_FILLERS;
    }

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (grid[r][c] === null) {
          grid[r][c] = fillerPool[Math.floor(Math.random() * fillerPool.length)];
        }
      }
    }

    return {
      size,
      grid,
      words: placedWords,
    };
  }

  /**
   * Build Jumble Words items with guaranteed-scrambled character arrays (kana length >= 2 with >= 2 unique chars).
   */
  function buildJumbleSession(sampledWords, pool) {
    const canScramble = (w) => {
      const chars = Array.from(w.kana);
      return chars.length >= 2 && new Set(chars).size >= 2;
    };

    const eligible = sampledWords.filter(canScramble);
    const source = eligible.length > 0 ? eligible : pool.filter(canScramble);

    return source.map((vocab, idx) => {
      const targetChars = Array.from(vocab.kana);
      let scrambled = targetChars.slice();

      for (let attempt = 0; attempt < 25; attempt++) {
        scrambled = shuffle(targetChars);
        if (scrambled.join('') !== targetChars.join('')) break;
      }
      // Deterministic swap fallback for 2-char words if shuffle matched target
      if (scrambled.join('') === targetChars.join('') && scrambled.length >= 2) {
        const firstDiff = scrambled.findIndex((ch) => ch !== scrambled[0]);
        if (firstDiff > 0) {
          const tmp = scrambled[0];
          scrambled[0] = scrambled[firstDiff];
          scrambled[firstDiff] = tmp;
        }
      }

      return {
        id: `jm-${idx}`,
        vocab,
        targetChars,
        scrambledChars: scrambled,
      };
    });
  }

  /**
   * Build authentic 1-character-difference Weaver / Word Ladders via wildcard bucket graph + BFS.
   * Each ladder has Start -> Step 1 -> [Step 2] -> Goal, where every step offers 4 touchable options.
   */
  function buildWeaverLadders(pool, fullDataset, config, targetLadders = 6) {
    const buildGraph = (items) => {
      const byKana = new Map();
      for (const item of items) {
        const len = Array.from(item.kana).length;
        if (len < 2 || len > 4) continue;
        if (!byKana.has(item.kana)) {
          byKana.set(item.kana, item);
        }
      }

      const buckets = new Map();
      for (const kana of byKana.keys()) {
        const chars = Array.from(kana);
        for (let i = 0; i < chars.length; i++) {
          const pattern = `${chars.length}:${i}:${chars.slice(0, i).join('')}*${chars.slice(i + 1).join('')}`;
          if (!buckets.has(pattern)) buckets.set(pattern, []);
          buckets.get(pattern).push(kana);
        }
      }

      const adj = new Map();
      for (const group of buckets.values()) {
        if (group.length < 2) continue;
        for (let i = 0; i < group.length; i++) {
          const a = group[i];
          if (!adj.has(a)) adj.set(a, new Set());
          for (let j = 0; j < group.length; j++) {
            if (i === j) continue;
            adj.get(a).add(group[j]);
          }
        }
      }

      return { byKana, adj };
    };

    // Try filtered pool first; if sparse, broaden to selected JLPT levels, then full dataset
    let graph = buildGraph(pool);
    if (graph.adj.size < 12) {
      const levelSet = new Set(config.levels || []);
      const broader = fullDataset.filter((item) => levelSet.has(item.level));
      graph = buildGraph(broader.length >= 20 ? broader : fullDataset);
    }
    if (graph.adj.size < 6) {
      graph = buildGraph(fullDataset);
    }

    const { byKana, adj } = graph;
    const allNodes = shuffle(Array.from(adj.keys()));
    const ladders = [];
    const usedStarts = new Set();

    // Helper: find shortest 2-step or 3-step path from `start`
    const findLadderFrom = (start) => {
      const parent = new Map([[start, null]]);
      const dist = new Map([[start, 0]]);
      const q = [start];
      const candidatesDepth2 = [];
      const candidatesDepth3 = [];

      while (q.length > 0) {
        const u = q.shift();
        const d = dist.get(u);
        if (d >= 3) continue;

        const neighbours = shuffle(Array.from(adj.get(u) || []));
        for (const v of neighbours) {
          if (!dist.has(v)) {
            dist.set(v, d + 1);
            parent.set(v, u);
            q.push(v);
            if (d + 1 === 2) candidatesDepth2.push(v);
            if (d + 1 === 3) candidatesDepth3.push(v);
          }
        }
      }

      // Prefer 3-step (4 words: Start -> Step1 -> Step2 -> Goal) or 2-step (3 words: Start -> Step1 -> Goal)
      const pickPool = candidatesDepth3.length > 0 ? candidatesDepth3 : candidatesDepth2;
      if (pickPool.length === 0) return null;

      const goal = pickPool[Math.floor(Math.random() * pickPool.length)];
      const path = [];
      let cur = goal;
      while (cur !== null) {
        path.unshift(cur);
        cur = parent.get(cur);
      }
      return path;
    };

    const allSameLenMap = new Map();
    for (const [k, item] of byKana.entries()) {
      const len = Array.from(k).length;
      if (!allSameLenMap.has(len)) allSameLenMap.set(len, []);
      allSameLenMap.get(len).push(item);
    }

    for (const startKana of allNodes) {
      if (ladders.length >= targetLadders) break;
      if (usedStarts.has(startKana)) continue;

      const pathKana = findLadderFrom(startKana);
      if (!pathKana || pathKana.length < 3) continue;

      usedStarts.add(startKana);
      const pathItems = pathKana.map((k) => byKana.get(k));
      const wordLen = Array.from(startKana).length;
      const sameLenItems = allSameLenMap.get(wordLen) || pool;

      // Build playable steps: for each rung from index 1 to path.length - 1, provide 4 touchable options
      const steps = [];
      for (let s = 1; s < pathItems.length; s++) {
        const prevItem = pathItems[s - 1];
        const targetItem = pathItems[s];
        const prevChars = Array.from(prevItem.kana);
        const targetChars = Array.from(targetItem.kana);
        const changedIndex = prevChars.findIndex((ch, idx) => ch !== targetChars[idx]);

        // Distractors: prefer other 1-char neighbours of prevItem (not equal to targetItem or already visited)
        const visitedSet = new Set(pathKana.slice(0, s + 1));
        const neighbourDistractors = shuffle(Array.from(adj.get(prevItem.kana) || []))
          .filter((k) => !visitedSet.has(k))
          .map((k) => byKana.get(k))
          .filter(Boolean);

        const distractors = [];
        const usedK = new Set([targetItem.kana, prevItem.kana]);
        for (const d of neighbourDistractors) {
          if (distractors.length >= 3) break;
          if (!usedK.has(d.kana)) {
            usedK.add(d.kana);
            distractors.push(d);
          }
        }
        // Top up distractors from same-length pool if fewer than 3 neighbours exist
        if (distractors.length < 3) {
          for (const d of shuffle(sameLenItems)) {
            if (distractors.length >= 3) break;
            if (!usedK.has(d.kana)) {
              usedK.add(d.kana);
              distractors.push(d);
            }
          }
        }

        steps.push({
          stepIndex: s,
          prevItem,
          targetItem,
          changedIndex,
          options: shuffle([targetItem, ...distractors]),
        });
      }

      ladders.push({
        id: `wv-${ladders.length}`,
        startItem: pathItems[0],
        goalItem: pathItems[pathItems.length - 1],
        pathItems,
        steps,
      });
    }

    return ladders;
  }

  global.PuzzleGenerators = {
    buildDistractors,
    buildMultipleChoiceSession,
    buildCrosswordBoards,
    buildWordsearchBoards,
    buildJumbleSession,
    buildWeaverLadders,
  };
})(window);
