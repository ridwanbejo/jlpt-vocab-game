(function (global) {
  'use strict';

  const CSV_PATH = 'assets/data/JLPT_vocab_master_list.csv';
  const CREDITS_PATH = 'CREDITS.md';
  const WORDS_PER_BOARD = 10;

  const MODE_META = {
    match: {
      name: 'Match Pairs',
      cta: 'Start Match Challenge',
      hint: 'Left-click a colourful Word block and its matching Answer card',
      unitSingle: 'pair',
      speedUnit: 'Match Pairs / Min',
      clearedLabel: 'Pairs Matched',
      boardWord: 'board',
      boardWordPlural: 'boards',
    },
    'multiple-choice': {
      name: 'Multiple Choices',
      cta: 'Start Multiple Choices',
      hint: 'Touch or click the correct answer from the 4 choices',
      unitSingle: 'answer',
      speedUnit: 'Answers / Min',
      clearedLabel: 'Questions Cleared',
      boardWord: 'set',
      boardWordPlural: 'sets',
    },
    crosswords: {
      name: 'Crosswords',
      cta: 'Start Crosswords',
      hint: 'Touch any horizontal or vertical line, then choose the right answer',
      unitSingle: 'word',
      speedUnit: 'Words / Min',
      clearedLabel: 'Words Solved',
      boardWord: 'crossword',
      boardWordPlural: 'crosswords',
    },
    wordsearch: {
      name: 'Wordsearch',
      cta: 'Start Wordsearch',
      hint: 'Touch & drag (or tap start → end) along a horizontal or vertical line',
      unitSingle: 'word',
      speedUnit: 'Words / Min',
      clearedLabel: 'Words Found',
      boardWord: 'grid',
      boardWordPlural: 'grids',
    },
    jumble: {
      name: 'Jumble Words',
      cta: 'Start Jumble Words',
      hint: 'Drag & drop character tiles to reorder and spell the word',
      unitSingle: 'word',
      speedUnit: 'Words / Min',
      clearedLabel: 'Words Reordered',
      boardWord: 'set',
      boardWordPlural: 'sets',
    },
    weaver: {
      name: 'Weaver / Word Ladder',
      cta: 'Start Weaver Ladder',
      hint: 'Touch the next 1-character step option to climb from Start to Goal',
      unitSingle: 'step',
      speedUnit: 'Steps / Min',
      clearedLabel: 'Ladder Steps',
      boardWord: 'ladder',
      boardWordPlural: 'ladders',
    },
  };

  let dataset = null;
  let phaserScene = null;
  let lastConfig = null;
  let creditsCache = null;

  const el = {
    gameContainer: document.getElementById('game-container'),
    configOverlay: document.getElementById('config-overlay'),
    resultsOverlay: document.getElementById('results-overlay'),
    datasetLoading: document.getElementById('dataset-loading'),
    configForm: document.getElementById('config-form'),
    easinessNote: document.getElementById('easiness-note'),
    cardsMultiplierNote: document.getElementById('cards-multiplier-note'),
    poolSummary: document.getElementById('pool-summary'),
    btnStartGame: document.getElementById('btn-start-game'),

    wordCountRange: document.getElementById('word-count-range'),
    wordCountNumber: document.getElementById('word-count-number'),
    gameTimeRange: document.getElementById('game-time-range'),
    gameTimeNumber: document.getElementById('game-time-number'),
    gameTimeDisplay: document.getElementById('game-time-display'),
    toggleDefinition: document.getElementById('toggle-definition'),
    toggleRomaji: document.getElementById('toggle-romaji'),
    answerReadingWrap: document.getElementById('answer-reading-wrap'),

    sessionToolbar: document.getElementById('session-toolbar'),
    toolbarBoardBadge: document.getElementById('toolbar-board-badge'),
    toolbarHint: document.getElementById('toolbar-hint'),
    btnQuitGame: document.getElementById('btn-quit-game'),

    resultsBadge: document.getElementById('results-badge'),
    resultsTitle: document.getElementById('results-title'),
    resultsSubtitle: document.getElementById('results-subtitle'),
    resScore: document.getElementById('res-score'),
    resScoreUnit: document.getElementById('res-score-unit'),
    resPpm: document.getElementById('res-ppm'),
    resSpeedUnit: document.getElementById('res-speed-unit'),
    resClearedLabel: document.getElementById('res-cleared-label'),
    resCleared: document.getElementById('res-cleared'),
    resBoards: document.getElementById('res-boards'),
    resAccuracy: document.getElementById('res-accuracy'),
    resMistakes: document.getElementById('res-mistakes'),
    btnPlayAgain: document.getElementById('btn-play-again'),
    btnBackConfig: document.getElementById('btn-back-config'),

    btnCredits: document.getElementById('btn-credits'),
    creditsOverlay: document.getElementById('credits-overlay'),
    creditsContent: document.getElementById('credits-content'),
    btnCloseCredits: document.getElementById('btn-close-credits'),
    btnCloseCreditsX: document.getElementById('btn-close-credits-x'),
  };

  function formatMinutesPill(mins) {
    return mins === 60 ? '60m (1 hr)' : `${mins} min`;
  }

  function setTimeInputs(minutes) {
    const clamped = Math.min(60, Math.max(1, minutes));
    el.gameTimeRange.value = String(clamped);
    el.gameTimeNumber.value = String(clamped);
    el.gameTimeDisplay.textContent = formatMinutesPill(clamped);
  }

  /**
   * Initialise Phaser 3 game instance.
   */
  function initPhaser() {
    global.onPhaserSceneReady = (scene) => {
      phaserScene = scene;
      updatePoolPreview();
    };

    new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game-container',
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: '#002b7f',
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [global.JLPTMatchScene],
    });
  }

  /**
   * Read current user configuration from the form.
   */
  function readConfig() {
    const modeInput = document.querySelector('input[name="game-mode"]:checked');
    const gameMode = modeInput ? modeInput.value : 'match';

    const levelBoxes = Array.from(document.querySelectorAll('input[name="jlpt-level"]:checked'));
    const levels = levelBoxes.map((cb) => cb.value);

    const kanaInput = document.querySelector('input[name="kana-mode"]:checked');
    const kanaMode = kanaInput ? kanaInput.value : 'both';

    const easinessInput = document.querySelector('input[name="easiness"]:checked');
    const easiness = easinessInput ? easinessInput.value : 'easy';

    const answerReadingInput = document.querySelector('input[name="answer-reading"]:checked');
    const answerReading = answerReadingInput ? answerReadingInput.value : 'romaji';

    const rawCount = parseInt(el.wordCountNumber.value, 10);
    const wordCount = Number.isFinite(rawCount) ? Math.min(200, Math.max(10, rawCount)) : 20;

    const rawMinutes = parseInt(el.gameTimeNumber.value, 10);
    const minutes = Number.isFinite(rawMinutes) ? Math.min(60, Math.max(1, rawMinutes)) : 2;

    return {
      gameMode,
      levels,
      wordCount,
      kanaMode,
      easiness,
      showDefinition: el.toggleDefinition.checked,
      showRomaji: el.toggleRomaji.checked,
      answerReading,
      minutes,
    };
  }

  /**
   * Update live mode summary, multiplier readout, and vocabulary pool count preview.
   */
  function updatePoolPreview() {
    const cfg = readConfig();
    const meta = MODE_META[cfg.gameMode] || MODE_META.match;

    el.btnStartGame.textContent = meta.cta;

    if (el.answerReadingWrap) {
      el.answerReadingWrap.classList.toggle('disabled', !cfg.showRomaji);
    }

    if (cfg.gameMode === 'match') {
      const totalCards = cfg.wordCount * 2;
      const totalBoards = Math.ceil(cfg.wordCount / WORDS_PER_BOARD);
      el.cardsMultiplierNote.innerHTML =
        `${cfg.wordCount} words &times; 2 = <strong>${totalCards} cards</strong> across ` +
        `<strong>${totalBoards} ${totalBoards === 1 ? 'board' : 'boards'}</strong> (${WORDS_PER_BOARD} pairs / board)`;
    } else if (cfg.gameMode === 'multiple-choice') {
      el.cardsMultiplierNote.innerHTML =
        `<strong>${cfg.wordCount}</strong> touch-choice questions (4 glossy options each)`;
    } else if (cfg.gameMode === 'crosswords') {
      const estBoards = Math.max(1, Math.ceil(cfg.wordCount / 6));
      el.cardsMultiplierNote.innerHTML =
        `<strong>${cfg.wordCount}</strong> intersecting crossword lines across ~<strong>${estBoards}</strong> ${estBoards === 1 ? 'board' : 'boards'}`;
    } else if (cfg.gameMode === 'wordsearch') {
      const estBoards = Math.max(1, Math.ceil(cfg.wordCount / 6));
      el.cardsMultiplierNote.innerHTML =
        `<strong>${cfg.wordCount}</strong> hidden horizontal/vertical words across <strong>${estBoards}</strong> ${estBoards === 1 ? 'grid' : 'grids'}`;
    } else if (cfg.gameMode === 'jumble') {
      el.cardsMultiplierNote.innerHTML =
        `<strong>${cfg.wordCount}</strong> scrambled words — drag &amp; drop letters to reorder`;
    } else if (cfg.gameMode === 'weaver') {
      const targetLadders = Math.max(3, Math.round(cfg.wordCount / 3));
      el.cardsMultiplierNote.innerHTML =
        `~<strong>${targetLadders}</strong> word ladders (2–3 steps each, 1 character change per rung)`;
    }

    if (!dataset) return;

    el.poolSummary.classList.remove('warn', 'empty');

    if (cfg.levels.length === 0) {
      el.poolSummary.classList.add('empty');
      el.poolSummary.innerHTML = 'Select at least <strong>1 JLPT level</strong> to begin.';
      el.btnStartGame.disabled = true;
      return;
    }

    if (!cfg.showDefinition && !cfg.showRomaji) {
      el.poolSummary.classList.add('empty');
      el.poolSummary.innerHTML =
        'Enable at least <strong>Show Definition</strong> or <strong>Show Reading</strong> for answers/clues.';
      el.btnStartGame.disabled = true;
      return;
    }

    const filtered = global.VocabLoader.filterWords(dataset.items, cfg);
    const usable = Math.min(cfg.wordCount, filtered.length);

    if (filtered.length === 0) {
      el.poolSummary.classList.add('empty');
      el.poolSummary.innerHTML = 'Matching words: <strong>0</strong> — adjust your filters.';
      el.btnStartGame.disabled = true;
      return;
    }

    if (filtered.length < cfg.wordCount) {
      el.poolSummary.classList.add('warn');
      el.poolSummary.innerHTML =
        `Matching pool: <strong>${filtered.length}</strong> words ` +
        `(will use all <strong>${usable}</strong> available words for <strong>${meta.name}</strong>).`;
    } else {
      el.poolSummary.innerHTML =
        `Matching pool: <strong>${filtered.length.toLocaleString()}</strong> words ` +
        `(sampling <strong>${usable}</strong> words for <strong>${meta.name}</strong>).`;
    }

    el.btnStartGame.disabled = !phaserScene;
  }

  /**
   * Build mode-specific session data and launch the Phaser scene.
   */
  function startGameWithConfig(cfg) {
    if (!dataset || !phaserScene) return;
    if (!cfg.showDefinition && !cfg.showRomaji) return;

    const pool = global.VocabLoader.filterWords(dataset.items, cfg);
    const sampled = global.VocabLoader.sampleWords(pool, cfg.wordCount);
    if (sampled.length === 0) return;

    const meta = MODE_META[cfg.gameMode] || MODE_META.match;
    let sessionData = null;
    let initialBadge = 'BOARD 1 / 1';

    if (cfg.gameMode === 'match') {
      const boards = global.VocabLoader.buildBoards(sampled, cfg, WORDS_PER_BOARD);
      if (boards.length === 0) return;
      sessionData = boards;
      initialBadge = `BOARD 1 / ${boards.length}`;
    } else if (cfg.gameMode === 'multiple-choice') {
      const questions = global.PuzzleGenerators.buildMultipleChoiceSession(
        sampled,
        pool,
        dataset.items,
        cfg
      );
      if (questions.length === 0) return;
      sessionData = { questions };
      initialBadge = `QUESTION 1 / ${questions.length}`;
    } else if (cfg.gameMode === 'crosswords') {
      const boards = global.PuzzleGenerators.buildCrosswordBoards(
        sampled,
        pool,
        dataset.items,
        cfg,
        6
      );
      if (boards.length === 0) return;
      sessionData = { boards };
      initialBadge = `CROSSWORD 1 / ${boards.length}`;
    } else if (cfg.gameMode === 'wordsearch') {
      const boards = global.PuzzleGenerators.buildWordsearchBoards(sampled, pool, cfg, 6);
      if (boards.length === 0) return;
      sessionData = { boards };
      initialBadge = `WORDSEARCH 1 / ${boards.length}`;
    } else if (cfg.gameMode === 'jumble') {
      const items = global.PuzzleGenerators.buildJumbleSession(sampled, pool);
      if (items.length === 0) return;
      sessionData = { items };
      initialBadge = `JUMBLE 1 / ${items.length}`;
    } else if (cfg.gameMode === 'weaver') {
      const targetLadders = Math.max(3, Math.round(cfg.wordCount / 3));
      const ladders = global.PuzzleGenerators.buildWeaverLadders(
        pool,
        dataset.items,
        cfg,
        targetLadders
      );
      if (ladders.length === 0) return;
      sessionData = { ladders };
      initialBadge = `WEAVER 1 / ${ladders.length}`;
    }

    lastConfig = cfg;

    el.configOverlay.classList.add('hidden');
    el.resultsOverlay.classList.add('hidden');
    el.sessionToolbar.classList.remove('hidden');
    el.toolbarBoardBadge.textContent = initialBadge;
    el.toolbarHint.textContent = meta.hint;

    phaserScene.startSession(sessionData, cfg, {
      onGameOver: handleGameOver,
      onBoardChange: (boardNum, totalBoards) => {
        el.toolbarBoardBadge.textContent = `BOARD ${boardNum} / ${totalBoards}`;
      },
      onBoardLabel: (label) => {
        el.toolbarBoardBadge.textContent = label;
      },
    });
  }

  /**
   * Display end-of-game score, speed per minute, accuracy, and Play Again controls.
   */
  function handleGameOver(stats) {
    el.sessionToolbar.classList.add('hidden');
    const meta = MODE_META[stats.gameMode] || MODE_META.match;

    el.resultsBadge.classList.remove('victory');
    if (stats.reason === 'completed') {
      el.resultsBadge.textContent = 'CHALLENGE CLEARED';
      el.resultsBadge.classList.add('victory');
      el.resultsTitle.textContent = 'Outstanding!';
      el.resultsSubtitle.textContent = `Completed all ${stats.totalPairs} ${meta.unitSingle}s in ${meta.name} before time ran out.`;
    } else if (stats.reason === 'quit') {
      el.resultsBadge.textContent = 'SESSION ENDED';
      el.resultsTitle.textContent = `${meta.name} Summary`;
      el.resultsSubtitle.textContent = 'Session ended early.';
    } else {
      el.resultsBadge.textContent = "TIME'S UP";
      el.resultsTitle.textContent = 'Session Complete';
      el.resultsSubtitle.textContent = `Here is your ${meta.name} performance.`;
    }

    const mins = Math.floor(stats.elapsedSeconds / 60);
    const secs = Math.floor(stats.elapsedSeconds % 60);

    el.resScore.textContent = String(stats.score);
    el.resScoreUnit.textContent = `points (+10 / ${meta.unitSingle})`;
    el.resPpm.textContent = stats.pairsPerMinute.toFixed(1);
    el.resSpeedUnit.textContent = meta.speedUnit;
    el.resClearedLabel.textContent = meta.clearedLabel;
    el.resCleared.textContent = `${stats.pairsMatched} / ${stats.totalPairs}`;
    el.resBoards.textContent =
      stats.totalBoards > 1
        ? `${meta.boardWordPlural[0].toUpperCase() + meta.boardWordPlural.slice(1)}: ${stats.boardsCompleted}/${stats.totalBoards} • ${mins}:${String(secs).padStart(2, '0')} elapsed`
        : `${mins}:${String(secs).padStart(2, '0')} elapsed`;
    el.resAccuracy.textContent = `${stats.accuracy}%`;
    el.resMistakes.textContent = `${stats.mistakes} ${stats.mistakes === 1 ? 'mistake' : 'mistakes'}`;

    el.resultsOverlay.classList.remove('hidden');
  }

  /**
   * Append inline text and safe [label](https://...) links as DOM nodes.
   */
  function appendInlineMarkdown(parent, text) {
    const linkRe = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
    let lastIndex = 0;
    let match;

    while ((match = linkRe.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parent.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }
      const anchor = document.createElement('a');
      anchor.textContent = match[1];
      anchor.href = match[2];
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      parent.appendChild(anchor);
      lastIndex = linkRe.lastIndex;
    }

    if (lastIndex < text.length) {
      parent.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
  }

  /**
   * Render Markdown text safely into a target container using DOM nodes only.
   */
  function renderCreditsMarkdown(container, mdText) {
    container.textContent = '';
    const lines = mdText.replace(/\r\n/g, '\n').split('\n');
    let currentList = null;
    let paragraphLines = [];

    const flushParagraph = () => {
      if (paragraphLines.length === 0) return;
      const p = document.createElement('p');
      paragraphLines.forEach((line, idx) => {
        if (idx > 0) p.appendChild(document.createElement('br'));
        appendInlineMarkdown(p, line);
      });
      container.appendChild(p);
      paragraphLines = [];
    };

    const flushList = () => {
      if (!currentList) return;
      container.appendChild(currentList);
      currentList = null;
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (!line) {
        flushParagraph();
        flushList();
        continue;
      }

      const headingMatch = /^(#{1,3})\s+(.*)$/.exec(line);
      if (headingMatch) {
        flushParagraph();
        flushList();
        const level = headingMatch[1].length;
        const heading = document.createElement(`h${level}`);
        appendInlineMarkdown(heading, headingMatch[2]);
        container.appendChild(heading);
        continue;
      }

      const listMatch = /^[-*]\s+(.*)$/.exec(line);
      if (listMatch) {
        flushParagraph();
        if (!currentList) {
          currentList = document.createElement('ul');
        }
        const li = document.createElement('li');
        appendInlineMarkdown(li, listMatch[1]);
        currentList.appendChild(li);
        continue;
      }

      flushList();
      paragraphLines.push(line);
    }

    flushParagraph();
    flushList();
  }

  async function openCreditsPopup() {
    el.creditsOverlay.classList.remove('hidden');

    if (creditsCache !== null) {
      renderCreditsMarkdown(el.creditsContent, creditsCache);
      return;
    }

    el.creditsContent.innerHTML = '<p class="credits-status">Loading credits...</p>';
    try {
      const response = await fetch(CREDITS_PATH);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      creditsCache = await response.text();
      renderCreditsMarkdown(el.creditsContent, creditsCache);
    } catch (err) {
      el.creditsContent.textContent = '';
      const p = document.createElement('p');
      p.className = 'credits-status error';
      p.textContent = `Unable to load ${CREDITS_PATH} (${err.message}).`;
      el.creditsContent.appendChild(p);
    }
  }

  function closeCreditsPopup() {
    el.creditsOverlay.classList.add('hidden');
  }

  /**
   * Bind all UI event listeners.
   */
  function bindEvents() {
    // JLPT preset buttons
    document.querySelectorAll('.preset-btn[data-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const presetLevels = new Set((btn.dataset.preset || '').split(','));
        document.querySelectorAll('input[name="jlpt-level"]').forEach((cb) => {
          cb.checked = presetLevels.has(cb.value);
        });
        updatePoolPreview();
      });
    });

    // Quick time preset buttons (2m .. 60m / 1 hr)
    document.querySelectorAll('.time-preset-btn[data-minutes]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mins = parseInt(btn.dataset.minutes, 10);
        if (Number.isFinite(mins)) {
          setTimeInputs(mins);
        }
      });
    });

    // Live pool recalculation on any filter, mode, or toggle change
    document
      .querySelectorAll(
        'input[name="game-mode"], input[name="jlpt-level"], input[name="kana-mode"], input[name="easiness"], input[name="answer-reading"], #toggle-definition, #toggle-romaji'
      )
      .forEach((input) => input.addEventListener('change', updatePoolPreview));

    // Sync word count slider & number input (10..200)
    el.wordCountRange.addEventListener('input', () => {
      el.wordCountNumber.value = el.wordCountRange.value;
      updatePoolPreview();
    });

    el.wordCountNumber.addEventListener('input', () => {
      const val = parseInt(el.wordCountNumber.value, 10);
      if (Number.isFinite(val)) {
        const clamped = Math.min(200, Math.max(10, val));
        el.wordCountRange.value = String(clamped);
      }
      updatePoolPreview();
    });

    el.wordCountNumber.addEventListener('blur', () => {
      const val = parseInt(el.wordCountNumber.value, 10);
      const clamped = Number.isFinite(val) ? Math.min(200, Math.max(10, val)) : 20;
      el.wordCountNumber.value = String(clamped);
      el.wordCountRange.value = String(clamped);
      updatePoolPreview();
    });

    // Sync game time slider & number input (1..60 min)
    el.gameTimeRange.addEventListener('input', () => {
      const mins = parseInt(el.gameTimeRange.value, 10);
      if (Number.isFinite(mins)) setTimeInputs(mins);
    });

    el.gameTimeNumber.addEventListener('input', () => {
      const val = parseInt(el.gameTimeNumber.value, 10);
      if (Number.isFinite(val)) {
        const clamped = Math.min(60, Math.max(1, val));
        el.gameTimeRange.value = String(clamped);
        el.gameTimeDisplay.textContent = formatMinutesPill(clamped);
      }
    });

    el.gameTimeNumber.addEventListener('blur', () => {
      const val = parseInt(el.gameTimeNumber.value, 10);
      setTimeInputs(Number.isFinite(val) ? val : 2);
    });

    // Submit config form to start game
    el.configForm.addEventListener('submit', (e) => {
      e.preventDefault();
      startGameWithConfig(readConfig());
    });

    // Quit active session button
    el.btnQuitGame.addEventListener('click', () => {
      if (phaserScene && phaserScene.isPlaying) {
        phaserScene.endSession('quit');
      }
    });

    // Play Again (same settings, newly generated session)
    el.btnPlayAgain.addEventListener('click', () => {
      startGameWithConfig(lastConfig || readConfig());
    });

    // Back to Configuration Screen
    el.btnBackConfig.addEventListener('click', () => {
      el.resultsOverlay.classList.add('hidden');
      el.configOverlay.classList.remove('hidden');
      el.sessionToolbar.classList.add('hidden');
      if (phaserScene) {
        phaserScene.cleanupSession();
        phaserScene.setHUDVisible(false);
      }
      updatePoolPreview();
    });

    // Credits popup controls
    el.btnCredits.addEventListener('click', openCreditsPopup);
    el.btnCloseCredits.addEventListener('click', closeCreditsPopup);
    el.btnCloseCreditsX.addEventListener('click', closeCreditsPopup);
    el.creditsOverlay.addEventListener('click', (e) => {
      if (e.target === el.creditsOverlay) {
        closeCreditsPopup();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !el.creditsOverlay.classList.contains('hidden')) {
        closeCreditsPopup();
      }
    });
  }

  /**
   * Boot sequence: start Phaser and fetch CSV dataset.
   */
  async function bootstrap() {
    bindEvents();
    initPhaser();

    try {
      dataset = await global.VocabLoader.loadDataset(CSV_PATH);
      el.datasetLoading.classList.add('hidden');
      el.configForm.classList.remove('hidden');

      if (dataset.derivedEasiness) {
        el.easinessNote.textContent = 'Derived from kana length (CSV easiness is uniform 2.5)';
      }

      updatePoolPreview();
    } catch (err) {
      el.datasetLoading.classList.remove('loading');
      el.datasetLoading.classList.add('error');
      el.datasetLoading.innerHTML =
        `Failed to load <code>${CSV_PATH}</code> (${err.message}). ` +
        `Serve this directory over HTTP (e.g. <code>python3 -m http.server 8080</code>) rather than opening <code>file://</code> directly.`;
    }
  }

  bootstrap();
})(window);
