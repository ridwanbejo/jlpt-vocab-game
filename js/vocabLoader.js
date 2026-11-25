(function (global) {
  'use strict';

  const HIRAGANA_RE = /[\u3040-\u309F]/;
  const KATAKANA_RE = /[\u30A0-\u30FF]/;
  const KANJI_RE = /[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF々]/;

  /**
   * RFC 4180 compliant CSV parser (handles quoted fields, escaped quotes, embedded commas, CRLF/LF).
   * @param {string} text
   * @returns {string[][]}
   */
  function parseCSV(text) {
    const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < clean.length; i++) {
      const ch = clean[i];

      if (inQuotes) {
        if (ch === '"') {
          if (clean[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\r') {
        if (clean[i + 1] === '\n') {
          i++;
        }
        row.push(field);
        if (row.length > 1 || row[0] !== '') {
          rows.push(row);
        }
        row = [];
        field = '';
      } else if (ch === '\n') {
        row.push(field);
        if (row.length > 1 || row[0] !== '') {
          rows.push(row);
        }
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }

    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    return rows;
  }

  /**
   * Classify kana string as 'hiragana', 'katakana', or 'mixed'.
   * @param {string} kana
   * @returns {'hiragana' | 'katakana' | 'mixed'}
   */
  function classifyKana(kana) {
    const hasHira = HIRAGANA_RE.test(kana);
    const hasKata = KATAKANA_RE.test(kana);
    if (hasHira && !hasKata) return 'hiragana';
    if (hasKata && !hasHira) return 'katakana';
    return 'mixed';
  }

  /**
   * Assign easy / medium / hard tiers.
   * Uses the CSV `easiness` column directly when it has variance;
   * falls back to kana length tiers when all rows share a single default easiness value.
   * @param {Array<object>} items
   * @returns {boolean} true if fallback derivation was used
   */
  function assignDifficulty(items) {
    const numericEasiness = items
      .map((item) => item.easiness)
      .filter((v) => Number.isFinite(v));

    const minE = Math.min(...numericEasiness);
    const maxE = Math.max(...numericEasiness);
    const hasVariance = numericEasiness.length > 0 && Math.abs(maxE - minE) > 1e-6;

    if (hasVariance) {
      const sorted = [...numericEasiness].sort((a, b) => a - b);
      const p33 = sorted[Math.floor(sorted.length / 3)];
      const p66 = sorted[Math.floor((sorted.length * 2) / 3)];

      for (const item of items) {
        if (item.easiness >= p66) {
          item.difficulty = 'easy';
        } else if (item.easiness >= p33) {
          item.difficulty = 'medium';
        } else {
          item.difficulty = 'hard';
        }
      }
      return false;
    }

    // Fallback when CSV easiness is uniform (e.g. all rows = 2.5)
    for (const item of items) {
      const len = Array.from(item.kana).length;
      if (len <= 3) {
        item.difficulty = 'easy';
      } else if (len === 4) {
        item.difficulty = 'medium';
      } else {
        item.difficulty = 'hard';
      }
    }
    return true;
  }

  /**
   * Fetch and parse the JLPT vocabulary CSV.
   * Only uses: JLPT_Level, word, kana, definition, romaji, easiness.
   * @param {string} url
   */
  async function loadDataset(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} while loading ${url}`);
    }

    const csvText = await response.text();
    const rows = parseCSV(csvText);
    if (rows.length < 2) {
      throw new Error('CSV dataset is empty or missing rows.');
    }

    const headerMap = {};
    rows[0].forEach((col, idx) => {
      headerMap[col.trim().toLowerCase()] = idx;
    });

    const idxLevel = headerMap['jlpt_level'];
    const idxWord = headerMap['word'];
    const idxKana = headerMap['kana'];
    const idxDef = headerMap['definition'];
    const idxRomaji = headerMap['romaji'];
    const idxEasiness = headerMap['easiness'];

    if (
      idxLevel === undefined ||
      idxWord === undefined ||
      idxKana === undefined ||
      idxDef === undefined ||
      idxRomaji === undefined ||
      idxEasiness === undefined
    ) {
      throw new Error(
        'CSV is missing one or more required columns (JLPT_Level, word, kana, definition, romaji, easiness).'
      );
    }

    const items = [];
    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i];
      const level = (cols[idxLevel] || '').trim().replace(/^N/i, '');
      const word = (cols[idxWord] || '').trim();
      const kana = (cols[idxKana] || '').trim();
      const definition = (cols[idxDef] || '').trim();
      const romaji = (cols[idxRomaji] || '').trim();
      const easiness = parseFloat((cols[idxEasiness] || '').trim());

      if (!level || !word || !kana) continue;

      items.push({
        level,
        word,
        kana,
        definition,
        romaji,
        easiness: Number.isFinite(easiness) ? easiness : 2.5,
        hasKanji: KANJI_RE.test(word),
        kanaType: classifyKana(kana),
        difficulty: 'medium',
      });
    }

    const derivedEasiness = assignDifficulty(items);
    return {
      items,
      totalCount: items.length,
      derivedEasiness,
    };
  }

  /**
   * Filter vocabulary items based on user configuration.
   * @param {Array<object>} items
   * @param {{ levels: string[], kanaMode: string, easiness: string }} config
   */
  function filterWords(items, config) {
    const levelSet = new Set(config.levels);

    return items.filter((item) => {
      if (!levelSet.has(item.level)) return false;

      if (config.kanaMode === 'hiragana' && item.kanaType !== 'hiragana') {
        return false;
      }
      if (config.kanaMode === 'katakana' && item.kanaType !== 'katakana') {
        return false;
      }

      if (config.easiness && item.difficulty !== config.easiness) {
        return false;
      }

      return true;
    });
  }

  /**
   * Fisher-Yates in-place shuffle on a shallow copy.
   * @param {Array<any>} arr
   */
  function shuffle(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  /**
   * Sample N unique random words from the filtered pool.
   * @param {Array<object>} pool
   * @param {number} count
   */
  function sampleWords(pool, count) {
    return shuffle(pool).slice(0, Math.min(count, pool.length));
  }

  /**
   * Resolve the reading displayed on an Answer card:
   * - For Kanji words, switches between Romaji and Kana (hiragana/katakana) per `config.answerReading`.
   * - For Hiragana / Katakana question words (non-kanji), always uses Romaji.
   * @param {object} item
   * @param {{ answerReading?: 'romaji' | 'kana' }} config
   */
  function getAnswerReading(item, config) {
    if (config && config.answerReading === 'kana' && item.hasKanji) {
      return item.kana || item.romaji || '';
    }
    return item.romaji || '';
  }

  /**
   * Compute a normalised signature for the visible answer card text to avoid ambiguous duplicates on a single board.
   * @param {object} item
   * @param {{ showRomaji: boolean, showDefinition: boolean, answerReading?: string }} config
   */
  function getAnswerSignature(item, config) {
    const parts = [];
    if (config.showRomaji) {
      parts.push(getAnswerReading(item, config).trim().toLowerCase());
    }
    if (config.showDefinition) {
      parts.push((item.definition || '').trim().toLowerCase());
    }
    return parts.join('||');
  }

  /**
   * Split sampled words into sequential boards of `boardSize` (default 10 words + 10 answers = 20 cards per board).
   * Attempts to avoid duplicate word strings or identical visible answers on the same board.
   * @param {Array<object>} words
   * @param {{ showRomaji: boolean, showDefinition: boolean }} config
   * @param {number} boardSize
   * @returns {Array<Array<object>>}
   */
  function buildBoards(words, config, boardSize = 10) {
    const remaining = words.slice();
    const boards = [];

    while (remaining.length > 0) {
      const board = [];
      const seenWords = new Set();
      const seenAnswers = new Set();

      // First pass: pick non-colliding items for this board
      for (let i = 0; i < remaining.length && board.length < boardSize; ) {
        const item = remaining[i];
        const wordKey = item.word;
        const ansKey = getAnswerSignature(item, config);

        if (!seenWords.has(wordKey) && !seenAnswers.has(ansKey)) {
          board.push(item);
          seenWords.add(wordKey);
          seenAnswers.add(ansKey);
          remaining.splice(i, 1);
        } else {
          i++;
        }
      }

      // Second pass: if remaining items only had collisions, fill up to boardSize anyway
      while (board.length < boardSize && remaining.length > 0) {
        board.push(remaining.shift());
      }

      boards.push(board);
    }

    return boards;
  }

  global.VocabLoader = {
    loadDataset,
    filterWords,
    sampleWords,
    shuffle,
    getAnswerReading,
    getAnswerSignature,
    buildBoards,
  };
})(window);
