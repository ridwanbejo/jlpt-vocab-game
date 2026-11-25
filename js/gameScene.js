(function (global) {
  'use strict';

  // 10 vibrant colours for the 10 colourful Kanji/Word blocks on each board
  const BLOCK_PALETTE = [
    0xff595e, // Coral Red
    0xff924c, // Tangerine
    0xffca3a, // Sunflower Gold
    0x2ec4b6, // Turquoise
    0x1982c4, // Azure Blue
    0x8b5cf6, // Electric Violet
    0xf72585, // Vivid Magenta
    0x06b6d4, // Bright Cyan
    0x84cc16, // Lime Green
    0x6366f1, // Vibrant Indigo
  ];

  const LEVEL_COLORS = {
    '5': 0x10b981,
    '4': 0x0ea5e9,
    '3': 0xf59e0b,
    '2': 0xf97316,
    '1': 0xec4899,
  };

  const FONT_JP = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", "Noto Sans JP", sans-serif';
  const FONT_UI = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const FONT_MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

  class JLPTMatchScene extends Phaser.Scene {
    constructor() {
      super({ key: 'JLPTMatchScene' });

      this.isPlaying = false;
      this.config = null;
      this.callbacks = {};

      this.boards = [];
      this.currentBoardIndex = 0;
      this.boardsCompleted = 0;
      this.totalPairs = 0;
      this.remainingPairsOnBoard = 0;

      this.cards = [];
      this.clearedSlots = new Set();
      this.selectedCard = null;
      this.activeTimers = [];

      this.score = 0;
      this.pairsMatched = 0;
      this.mistakes = 0;
      this.streak = 0;

      this.sessionStartMs = 0;
      this.durationMs = 120000;
      this.remainingMs = 120000;
      this.lastDisplayedSec = -1;

      this.timerEvent = null;
      this.bgShapes = [];
    }

    preload() {
      this.load.audio(
        'sfx-success',
        'assets/sfx/vadim_makes_sound-modern-success-confirmation-notification-566072.mp3'
      );
      this.load.audio(
        'sfx-fail',
        'assets/sfx/lesiakower-error-mistake-sound-effect-incorrect-answer-437420.mp3'
      );
    }

    create() {
      if (this.input && this.input.mouse) {
        this.input.mouse.disableContextMenu();
      }

      this.createProceduralTextures();
      this.createBackground();
      this.createBoardLayers();
      this.createHUD();
      this.setHUDVisible(false);

      this.scale.on('resize', this.handleResize, this);

      if (global.onPhaserSceneReady) {
        global.onPhaserSceneReady(this);
      }
    }

    update(_time, delta) {
      const w = this.scale.width;
      const h = this.scale.height;
      const dt = delta / 1000;
      for (const shape of this.bgShapes) {
        shape.obj.y -= shape.speed * dt;
        shape.obj.rotation += shape.rotSpeed * dt;
        if (shape.obj.y < -60) {
          shape.obj.y = h + 60;
          shape.obj.x = Phaser.Math.Between(40, Math.max(80, w - 40));
        }
      }
    }

    /**
     * Pure procedural textures (zero external image assets).
     */
    createProceduralTextures() {
      if (!this.textures.exists('particle-square')) {
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(0xffffff, 1);
        g.fillRoundedRect(0, 0, 14, 14, 3);
        g.generateTexture('particle-square', 14, 14);
        g.destroy();
      }

      if (!this.textures.exists('particle-spark')) {
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(0xffffff, 1);
        g.fillPoints(
          [
            { x: 7, y: 0 },
            { x: 14, y: 7 },
            { x: 7, y: 14 },
            { x: 0, y: 7 },
          ],
          true
        );
        g.generateTexture('particle-spark', 14, 14);
        g.destroy();
      }
    }

    /**
     * Samurai Blue background using Phaser Graphics only.
     */
    createBackground() {
      this.bgGraphics = this.add.graphics().setDepth(0);
      this.drawBackgroundGrid();

      const envAccents = [0xffffff, 0x93c5fd, 0x38bdf8, 0x1d4ed8];
      this.bgShapes = [];
      for (let i = 0; i < 18; i++) {
        const size = Phaser.Math.Between(18, 44);
        const color = envAccents[i % envAccents.length];
        const rect = this.add
          .rectangle(
            Phaser.Math.Between(40, Math.max(80, this.scale.width - 40)),
            Phaser.Math.Between(0, this.scale.height),
            size,
            size,
            color,
            0.07
          )
          .setStrokeStyle(1.5, color, 0.16)
          .setDepth(1);
        this.bgShapes.push({
          obj: rect,
          speed: Phaser.Math.FloatBetween(12, 34),
          rotSpeed: Phaser.Math.FloatBetween(-0.35, 0.35),
        });
      }
    }

    drawBackgroundGrid() {
      const w = this.scale.width;
      const h = this.scale.height;
      const g = this.bgGraphics;
      g.clear();

      // Samurai Blue gradient backdrop
      g.fillGradientStyle(0x0047ab, 0x0038a8, 0x001b54, 0x00266e, 1);
      g.fillRect(0, 0, w, h);

      // Subtle grid lines
      g.lineStyle(1, 0x93c5fd, 0.1);
      const step = 48;
      for (let x = 0; x < w; x += step) {
        g.lineBetween(x, 0, x, h);
      }
      for (let y = 0; y < h; y += step) {
        g.lineBetween(0, y, w, y);
      }

      // Playfield board tray
      const m = this.getLayoutMetrics();
      g.fillStyle(0x001a4d, 0.42);
      g.fillRoundedRect(m.trayX, m.trayY, m.trayW, m.trayH, 22);
      g.lineStyle(2, 0x60a5fa, 0.36);
      g.strokeRoundedRect(m.trayX, m.trayY, m.trayW, m.trayH, 22);
    }

    createBoardLayers() {
      this.slotMarkersGraphics = this.add.graphics().setDepth(4);
      this.boardLayer = this.add.container(0, 0).setDepth(10);
      this.bannerLayer = this.add.container(0, 0).setDepth(28);
    }

    /**
     * Build colourful top-left (Time) and top-right (Score) HUD directly in Phaser.
     */
    createHUD() {
      this.hudContainer = this.add.container(0, 0).setDepth(20);

      // --- TOP LEFT: TIME & BOARD PROGRESS ---
      this.timePanelBg = this.add.graphics();
      this.timeTitleText = this.add.text(0, 0, 'TIME', {
        fontFamily: FONT_UI,
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#7dd3fc',
        letterSpacing: 2,
      });
      this.timeValueText = this.add.text(0, 0, '02:00', {
        fontFamily: FONT_MONO,
        fontSize: '32px',
        fontStyle: 'bold',
        color: '#ffffff',
      });
      this.progressText = this.add.text(0, 0, 'Pairs: 0 / 0', {
        fontFamily: FONT_UI,
        fontSize: '13px',
        fontStyle: '600',
        color: '#bae6fd',
      });

      // --- TOP RIGHT: SCORE & STREAK ---
      this.scorePanelBg = this.add.graphics();
      this.scoreTitleText = this.add
        .text(0, 0, 'SCORE', {
          fontFamily: FONT_UI,
          fontSize: '12px',
          fontStyle: 'bold',
          color: '#fde047',
          letterSpacing: 2,
        })
        .setOrigin(1, 0);
      this.scoreValueText = this.add
        .text(0, 0, '0', {
          fontFamily: FONT_MONO,
          fontSize: '32px',
          fontStyle: 'bold',
          color: '#ffca3a',
        })
        .setOrigin(1, 0);
      this.streakText = this.add
        .text(0, 0, 'Mismatches: 0', {
          fontFamily: FONT_UI,
          fontSize: '13px',
          fontStyle: '600',
          color: '#fed7aa',
        })
        .setOrigin(1, 0);

      this.hudContainer.add([
        this.timePanelBg,
        this.timeTitleText,
        this.timeValueText,
        this.progressText,
        this.scorePanelBg,
        this.scoreTitleText,
        this.scoreValueText,
        this.streakText,
      ]);

      this.layoutHUD();
    }

    setHUDVisible(visible) {
      this.hudContainer.setVisible(visible);
      this.slotMarkersGraphics.setVisible(visible);
    }

    /**
     * Desktop / LCD responsive metrics for the top HUD and card grid tray.
     */
    getLayoutMetrics() {
      const w = this.scale.width;
      const h = this.scale.height;

      const margin = 20;
      const topCardW = 228;
      const topCardH = 86;

      const trayW = Math.min(1480, Math.max(640, w - margin * 2));
      const trayX = Math.round((w - trayW) / 2);
      const trayY = margin + topCardH + 14;
      const trayH = Math.max(360, h - trayY - margin);

      return {
        w,
        h,
        margin,
        topCardW,
        topCardH,
        trayX,
        trayY,
        trayW,
        trayH,
        centerX: Math.round(w / 2),
        centerY: Math.round(trayY + trayH / 2),
      };
    }

    layoutHUD() {
      const m = this.getLayoutMetrics();

      // Top-Left: TIME
      this.drawHudCard(this.timePanelBg, m.margin, m.margin, m.topCardW, m.topCardH, 0x38bdf8);
      this.timeTitleText.setPosition(m.margin + 16, m.margin + 9);
      this.timeValueText.setPosition(m.margin + 16, m.margin + 25);
      this.progressText.setPosition(m.margin + 16, m.margin + 63);

      // Top-Right: SCORE
      const scoreX = m.w - m.margin - m.topCardW;
      this.drawHudCard(this.scorePanelBg, scoreX, m.margin, m.topCardW, m.topCardH, 0xffca3a);
      this.scoreTitleText.setPosition(m.w - m.margin - 16, m.margin + 9);
      this.scoreValueText.setPosition(m.w - m.margin - 16, m.margin + 25);
      this.streakText.setPosition(m.w - m.margin - 16, m.margin + 63);
    }

    drawHudCard(g, x, y, width, height, borderColor) {
      g.clear();
      g.fillStyle(0x031c52, 0.9);
      g.fillRoundedRect(x, y, width, height, 14);
      g.lineStyle(2, borderColor, 0.85);
      g.strokeRoundedRect(x, y, width, height, 14);
      g.fillStyle(borderColor, 0.25);
      g.fillRoundedRect(x + 2, y + 2, width - 4, 4, 2);
    }

    /**
     * Compute optimal landscape grid dimensions for a board's total card count.
     * Standard 10-pair board (20 cards) renders cleanly as a 5 x 4 desktop grid.
     */
    getGridDimensions(cardCount) {
      const presets = {
        20: { cols: 5, rows: 4 },
        18: { cols: 6, rows: 3 },
        16: { cols: 4, rows: 4 },
        14: { cols: 5, rows: 3 },
        12: { cols: 4, rows: 3 },
        10: { cols: 5, rows: 2 },
        8: { cols: 4, rows: 2 },
        6: { cols: 3, rows: 2 },
        4: { cols: 2, rows: 2 },
        2: { cols: 2, rows: 1 },
      };
      if (presets[cardCount]) {
        return presets[cardCount];
      }
      const cols = Math.ceil(Math.sqrt(cardCount * 1.25));
      const rows = Math.ceil(cardCount / cols);
      return { cols, rows };
    }

    /**
     * Compute slot coordinates and card sizes for `cardCount` cards inside the tray.
     */
    getGridLayout(cardCount) {
      const m = this.getLayoutMetrics();
      const { cols, rows } = this.getGridDimensions(cardCount);
      const padX = 20;
      const padY = 18;
      const gapX = 14;
      const gapY = 14;

      const availW = m.trayW - padX * 2;
      const availH = m.trayH - padY * 2;

      const cardW = Phaser.Math.Clamp(
        Math.floor((availW - (cols - 1) * gapX) / cols),
        140,
        268
      );
      const cardH = Phaser.Math.Clamp(
        Math.floor((availH - (rows - 1) * gapY) / rows),
        96,
        166
      );

      const gridW = cols * cardW + (cols - 1) * gapX;
      const gridH = rows * cardH + (rows - 1) * gapY;
      const startX = m.trayX + Math.round((m.trayW - gridW) / 2);
      const startY = m.trayY + Math.round((m.trayH - gridH) / 2);

      const positions = [];
      for (let idx = 0; idx < cardCount; idx++) {
        const row = Math.floor(idx / cols);
        const col = idx % cols;

        // Centre any partial final row
        const isLastRow = row === rows - 1;
        const itemsInLastRow = cardCount - row * cols;
        let rowOffsetX = 0;
        if (isLastRow && itemsInLastRow < cols) {
          const lastRowW = itemsInLastRow * cardW + (itemsInLastRow - 1) * gapX;
          rowOffsetX = Math.round((gridW - lastRowW) / 2);
        }

        const cx = startX + rowOffsetX + col * (cardW + gapX) + Math.round(cardW / 2);
        const cy = startY + row * (cardH + gapY) + Math.round(cardH / 2);
        positions.push({ x: cx, y: cy });
      }

      return { cols, rows, cardW, cardH, positions };
    }

    /**
     * Register a tracked delayedCall so cleanupSession can safely cancel all pending events.
     */
    scheduleCall(delayMs, fn) {
      const ev = this.time.delayedCall(delayMs, () => {
        const idx = this.activeTimers.indexOf(ev);
        if (idx !== -1) this.activeTimers.splice(idx, 1);
        fn();
      });
      this.activeTimers.push(ev);
      return ev;
    }

    clearTrackedTimers() {
      for (const ev of this.activeTimers) {
        if (ev) ev.remove(false);
      }
      this.activeTimers = [];
    }

    /**
     * Start a new match-pair session across one or more boards (10 words per board).
     * @param {Array<Array<object>>} boards
     * @param {object} config
     * @param {{ onGameOver?: Function, onBoardChange?: Function }} callbacks
     */
    startSession(boards, config, callbacks) {
      this.cleanupSession();

      this.config = config;
      this.callbacks = callbacks || {};
      this.boards = boards;
      this.currentBoardIndex = 0;
      this.boardsCompleted = 0;
      this.totalPairs = boards.reduce((sum, b) => sum + b.length, 0);

      this.score = 0;
      this.pairsMatched = 0;
      this.mistakes = 0;
      this.streak = 0;

      this.durationMs = config.minutes * 60 * 1000;
      this.remainingMs = this.durationMs;
      this.lastDisplayedSec = -1;
      this.sessionStartMs = performance.now();
      this.isPlaying = true;

      // Unlock Web Audio if suspended
      if (this.sound.context && this.sound.context.state === 'suspended') {
        this.sound.context.resume().catch(() => {});
      }

      this.setHUDVisible(true);
      this.drawBackgroundGrid();
      this.layoutHUD();
      this.updateHUDValues();
      this.updateTimerDisplay(true);

      this.loadBoard(0);

      this.timerEvent = this.time.addEvent({
        delay: 100,
        loop: true,
        callback: () => this.tickTimer(),
      });
    }

    cleanupSession() {
      this.isPlaying = false;

      if (this.timerEvent) {
        this.timerEvent.remove(false);
        this.timerEvent = null;
      }

      this.clearTrackedTimers();
      this.selectedCard = null;
      this.clearedSlots.clear();
      this.slotMarkersGraphics.clear();

      for (const card of this.cards) {
        if (card.container && card.container.active) {
          this.tweens.killTweensOf(card.container);
          card.container.destroy();
        }
      }
      this.cards = [];
      this.boardLayer.removeAll(true);
      this.bannerLayer.removeAll(true);
    }

    /**
     * Populate and display a single face-up board (up to 10 word cards + 10 answer cards mixed together).
     */
    loadBoard(boardIdx) {
      this.currentBoardIndex = boardIdx;
      this.selectedCard = null;
      this.clearedSlots.clear();
      this.slotMarkersGraphics.clear();
      this.bannerLayer.removeAll(true);

      for (const card of this.cards) {
        if (card.container && card.container.active) {
          this.tweens.killTweensOf(card.container);
          card.container.destroy();
        }
      }
      this.cards = [];
      this.boardLayer.removeAll(true);

      const boardWords = this.boards[boardIdx] || [];
      this.remainingPairsOnBoard = boardWords.length;

      // Build paired card descriptors (10 word blocks + 10 answer cards)
      const paletteOrder = global.VocabLoader.shuffle(BLOCK_PALETTE);
      const rawCards = [];

      boardWords.forEach((vocab, idx) => {
        const pairId = `${boardIdx}-${idx}`;
        const answerSignature = global.VocabLoader.getAnswerSignature(vocab, this.config);
        const wordColor = paletteOrder[idx % paletteOrder.length];

        rawCards.push({
          pairId,
          answerSignature,
          kind: 'word',
          vocab,
          baseColor: wordColor,
        });

        rawCards.push({
          pairId,
          answerSignature,
          kind: 'answer',
          vocab,
          baseColor: 0x0b2559,
        });
      });

      const mixedCards = global.VocabLoader.shuffle(rawCards);
      this.currentCardCount = mixedCards.length;
      const layout = this.getGridLayout(mixedCards.length);

      mixedCards.forEach((spec, slotIndex) => {
        const pos = layout.positions[slotIndex];
        const card = this.createCardObject(spec, slotIndex, pos.x, pos.y, layout.cardW, layout.cardH);
        this.cards.push(card);

        // Crisp staggered entrance animation
        card.container.setScale(0.76);
        card.container.setAlpha(0);
        this.tweens.add({
          targets: card.container,
          scale: 1,
          alpha: 1,
          duration: 240,
          delay: slotIndex * 18,
          ease: 'Back.easeOut',
        });
      });

      this.updateHUDValues();
      if (this.callbacks && typeof this.callbacks.onBoardChange === 'function') {
        this.callbacks.onBoardChange(boardIdx + 1, this.boards.length);
      }
    }

    /**
     * Create a single interactive face-up Phaser Card (either a colourful Word block or an Answer card).
     */
    createCardObject(spec, slotIndex, x, y, width, height) {
      const container = this.add.container(x, y);
      container.setDepth(10);

      const bg = this.add.graphics();
      const children = [bg];

      const card = {
        ...spec,
        slotIndex,
        baseX: x,
        baseY: y,
        width,
        height,
        container,
        bg,
        state: 'normal', // 'normal' | 'hover' | 'selected' | 'success' | 'error'
        matched: false,
        locked: false,
        textNodes: {},
      };

      if (spec.kind === 'word') {
        const isLightTile = spec.baseColor === 0xffca3a || spec.baseColor === 0x84cc16;
        card.isLightTile = isLightTile;

        // Small JLPT level pill badge in top-right
        const lvlBadgeBg = this.add.graphics();
        const lvlBadgeText = this.add
          .text(0, 0, `N${spec.vocab.level}`, {
            fontFamily: FONT_UI,
            fontSize: '10px',
            fontStyle: 'bold',
            color: '#ffffff',
          })
          .setOrigin(0.5);

        // Smaller hiragana/kana reading placed BELOW the Kanji word
        const kanaPillBg = this.add.graphics();
        const kanaText = this.add
          .text(0, 0, spec.vocab.kana, {
            fontFamily: FONT_JP,
            fontSize: '11px',
            fontStyle: 'bold',
            color: isLightTile ? '#1e1b4b' : '#ffffff',
          })
          .setOrigin(0.5);

        // Bold Kanji / Japanese word block text (primary focus)
        const wordText = this.add
          .text(0, 0, spec.vocab.word, {
            fontFamily: FONT_JP,
            fontSize: '40px',
            fontStyle: 'bold',
            color: isLightTile ? '#1e1b4b' : '#ffffff',
            stroke: isLightTile ? '#fef9c3' : '#0f172a',
            strokeThickness: isLightTile ? 1 : 3,
          })
          .setOrigin(0.5);

        card.textNodes = { lvlBadgeBg, lvlBadgeText, kanaPillBg, kanaText, wordText };
        children.push(lvlBadgeBg, lvlBadgeText, kanaPillBg, kanaText, wordText);
      } else {
        // Answer card: Romaji and/or English Definition
        const divider = this.add.graphics();

        const romajiText = this.add
          .text(0, 0, spec.vocab.romaji || '', {
            fontFamily: FONT_MONO,
            fontSize: '16px',
            fontStyle: 'bold',
            color: '#fde047',
            align: 'center',
          })
          .setOrigin(0.5);

        const defText = this.add
          .text(0, 0, '', {
            fontFamily: FONT_UI,
            fontSize: '13px',
            fontStyle: '600',
            color: '#f1f5f9',
            align: 'center',
            lineSpacing: 3,
          })
          .setOrigin(0.5);

        card.textNodes = { divider, romajiText, defText };
        children.push(divider, romajiText, defText);
      }

      // Interactive hit zone (mouse left-click only)
      const hitZone = this.add
        .zone(0, 0, width, height)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      hitZone.on('pointerover', () => {
        if (!this.isPlaying || card.matched || card.locked) return;
        if (card.state === 'normal') {
          card.state = 'hover';
          this.paintCard(card);
          this.tweens.add({
            targets: card.container,
            scale: 1.03,
            duration: 90,
            ease: 'Quad.easeOut',
          });
        }
      });

      hitZone.on('pointerout', () => {
        if (card.matched || card.locked) return;
        if (card.state === 'hover') {
          card.state = 'normal';
          this.paintCard(card);
          this.tweens.add({
            targets: card.container,
            scale: 1.0,
            duration: 90,
            ease: 'Quad.easeOut',
          });
        }
      });

      hitZone.on('pointerdown', (pointer) => {
        // Strictly left-click only
        if (pointer.button !== 0) return;
        if (!this.isPlaying || card.matched || card.locked) return;
        this.handleCardClick(card);
      });

      card.hitZone = hitZone;
      children.push(hitZone);
      container.add(children);
      this.boardLayer.add(container);

      this.layoutCardContents(card);
      this.paintCard(card);

      return card;
    }

    /**
     * Fit and align text elements cleanly inside the card bounds (handles long Japanese words, romaji & definitions).
     */
    layoutCardContents(card) {
      const { width, height } = card;
      const halfW = width / 2;
      const halfH = height / 2;

      if (card.hitZone) {
        card.hitZone.setSize(width, height);
        if (card.hitZone.input && card.hitZone.input.hitArea && card.hitZone.input.hitArea.setSize) {
          card.hitZone.input.hitArea.setSize(width, height);
        }
      }

      if (card.kind === 'word') {
        const { lvlBadgeBg, lvlBadgeText, kanaPillBg, kanaText, wordText } = card.textNodes;
        const levelColor = LEVEL_COLORS[card.vocab.level] || 0x8b5cf6;

        // Top-right JLPT badge
        const bx = halfW - 22;
        const by = -halfH + 16;
        lvlBadgeBg.clear();
        lvlBadgeBg.fillStyle(0x0f172a, 0.52);
        lvlBadgeBg.fillRoundedRect(bx - 15, by - 9, 30, 18, 6);
        lvlBadgeBg.lineStyle(1.2, levelColor, 0.95);
        lvlBadgeBg.strokeRoundedRect(bx - 15, by - 9, 30, 18, 6);
        lvlBadgeText.setPosition(bx, by);

        // Hide kana hint on Kanji word cards when the matching Answer card itself uses Kana
        const hideKanaHint = Boolean(
          this.config &&
            this.config.showRomaji &&
            this.config.answerReading === 'kana' &&
            card.vocab.hasKanji
        );

        // Main bold Kanji / Word (larger primary focus)
        const wordLen = Array.from(card.vocab.word).length;
        const maxWordW = width - 20;
        const baseWordSize = hideKanaHint
          ? Math.min(52, Math.max(30, Math.floor(height * 0.45)))
          : Math.min(48, Math.max(28, Math.floor(height * 0.41)));
        const fitWordSize = Math.min(
          baseWordSize,
          Math.max(16, Math.floor(maxWordW / Math.max(1, wordLen * 1.04)))
        );
        wordText.setScale(1).setFontSize(`${fitWordSize}px`).setText(card.vocab.word);
        if (wordText.width > maxWordW) {
          wordText.setScale(maxWordW / wordText.width);
        }

        if (hideKanaHint) {
          wordText.setPosition(0, 2);
          kanaText.setVisible(false);
          kanaPillBg.clear();
        } else {
          wordText.setPosition(0, -Math.round(height * 0.06));
          kanaText.setVisible(true);

          // Smaller hiragana/kana reading placed BELOW the Kanji word
          const kanaLen = Array.from(card.vocab.kana).length;
          const maxKanaW = width - 28;
          let kanaSize = Math.min(12, Math.max(9.5, Math.floor(height * 0.095)));
          if (kanaLen > 7) {
            kanaSize = Math.min(kanaSize, Math.max(9, Math.floor(maxKanaW / (kanaLen * 1.05))));
          }
          kanaText.setScale(1).setFontSize(`${kanaSize}px`).setText(card.vocab.kana);
          if (kanaText.width > maxKanaW) {
            kanaText.setScale(maxKanaW / kanaText.width);
          }

          const kanaY = Math.round(height * 0.30);
          kanaText.setPosition(0, kanaY);

          // Compact furigana capsule behind kana for crisp legibility on every block colour
          const pillW = Math.min(width - 20, Math.max(36, kanaText.displayWidth + 14));
          const pillH = Math.max(17, kanaText.displayHeight + 4);
          kanaPillBg.clear();
          kanaPillBg.fillStyle(card.isLightTile ? 0x1e1b4b : 0x050d26, card.isLightTile ? 0.14 : 0.28);
          kanaPillBg.fillRoundedRect(-pillW / 2, kanaY - pillH / 2, pillW, pillH, 8);
        }
      } else {
        const { divider, romajiText, defText } = card.textNodes;
        const showReading = Boolean(this.config && this.config.showRomaji);
        const showDef = Boolean(this.config && this.config.showDefinition);
        const useKanaReading = Boolean(
          this.config && this.config.answerReading === 'kana' && card.vocab.hasKanji
        );
        const readingStr = global.VocabLoader.getAnswerReading(card.vocab, this.config) || '—';
        const readingLen = Array.from(readingStr).length;

        const innerW = width - 20;
        divider.clear();

        if (showReading && showDef) {
          // Reading (Romaji or Kana for Kanji words; Romaji only for Kana questions) on upper half
          const baseSize = Math.min(34, Math.max(24, Math.floor(height * 0.24)));
          const readingSize = useKanaReading
            ? readingLen > 7
              ? Math.round(baseSize * 0.76)
              : readingLen > 5
              ? Math.round(baseSize * 0.88)
              : baseSize
            : readingLen > 14
            ? Math.round(baseSize * 0.78)
            : readingLen > 10
            ? Math.round(baseSize * 0.88)
            : baseSize;

          romajiText
            .setVisible(true)
            .setScale(1)
            .setWordWrapWidth(0)
            .setFontFamily(useKanaReading ? FONT_JP : FONT_MONO)
            .setFontSize(`${readingSize}px`)
            .setText(readingStr)
            .setPosition(0, -Math.round(height * 0.16));
          if (romajiText.width > innerW) {
            romajiText.setScale(innerW / romajiText.width);
          }

          // Subtle horizontal separator
          const divY = Math.round(height * 0.06);
          divider.lineStyle(1, 0x7dd3fc, 0.32);
          divider.lineBetween(-halfW + 20, divY, halfW - 20, divY);

          const maxDefH = Math.max(32, Math.round(height * 0.36));
          const defSize = height < 118 ? 11 : 12.5;
          defText
            .setVisible(true)
            .setFontSize(`${defSize}px`)
            .setWordWrapWidth(innerW, true);
          this.fitWrappedText(defText, card.vocab.definition || '—', maxDefH);
          defText.setPosition(0, Math.round(height * 0.27));
        } else if (showReading) {
          // Reading only — 2x bigger and centred
          const baseSize = Math.min(44, Math.max(32, Math.floor(height * 0.32)));
          const readingSize = useKanaReading
            ? readingLen > 7
              ? Math.round(baseSize * 0.74)
              : readingLen > 5
              ? Math.round(baseSize * 0.86)
              : baseSize
            : readingLen > 14
            ? Math.round(baseSize * 0.76)
            : readingLen > 10
            ? Math.round(baseSize * 0.88)
            : baseSize;

          romajiText
            .setVisible(true)
            .setScale(1)
            .setWordWrapWidth(0)
            .setFontFamily(useKanaReading ? FONT_JP : FONT_MONO)
            .setFontSize(`${readingSize}px`)
            .setText(readingStr)
            .setPosition(0, 0);
          if (romajiText.width > innerW) {
            romajiText.setScale(innerW / romajiText.width);
          }
          defText.setVisible(false);
        } else {
          // Definition only — centred with generous vertical allowance
          romajiText.setVisible(false);
          const maxDefH = Math.max(56, Math.round(height * 0.68));
          const defSize = height < 118 ? 12 : 14;
          defText
            .setVisible(true)
            .setFontSize(`${defSize}px`)
            .setWordWrapWidth(innerW, true);
          this.fitWrappedText(defText, card.vocab.definition || '—', maxDefH);
          defText.setPosition(0, 0);
        }
      }
    }

    /**
     * Truncate multi-line definition cleanly with an ellipsis so it never overflows card height.
     */
    fitWrappedText(textObj, rawText, maxHeight) {
      const str = (rawText || '').trim();
      textObj.setText(str);
      if (textObj.height <= maxHeight) return;

      let lo = 10;
      let hi = str.length;
      let best = str.slice(0, lo) + '...';
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const candidate = str.slice(0, mid).replace(/[,;\s]+$/, '') + '...';
        textObj.setText(candidate);
        if (textObj.height <= maxHeight) {
          best = candidate;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      textObj.setText(best);
    }

    /**
     * Paint card graphics according to card type ('word' vs 'answer') and visual state.
     */
    paintCard(card) {
      const g = card.bg;
      g.clear();

      const w = card.width;
      const h = card.height;
      const halfW = w / 2;
      const halfH = h / 2;
      const radius = 14;

      const isError = card.state === 'error';
      const isSuccess = card.state === 'success';
      const isSelected = card.state === 'selected';
      const isHover = card.state === 'hover';

      // Drop shadow
      g.fillStyle(0x030712, 0.45);
      g.fillRoundedRect(-halfW + 3, -halfH + 6, w, h, radius);

      // Outer state halo glow
      if (isSuccess) {
        g.fillStyle(0x22c55e, 0.42);
        g.fillRoundedRect(-halfW - 6, -halfH - 6, w + 12, h + 12, radius + 5);
      } else if (isError) {
        g.fillStyle(0xef4444, 0.42);
        g.fillRoundedRect(-halfW - 6, -halfH - 6, w + 12, h + 12, radius + 5);
      } else if (isSelected) {
        g.fillStyle(0xffca3a, 0.34);
        g.fillRoundedRect(-halfW - 5, -halfH - 5, w + 10, h + 10, radius + 4);
      }

      if (card.kind === 'word') {
        const mainColor = isSuccess ? 0x10b981 : isError ? 0xdc2626 : card.baseColor;
        const colorObj = Phaser.Display.Color.IntegerToColor(mainColor);
        const darkBevel = Phaser.Display.Color.GetColor(
          Math.max(0, colorObj.red - 58),
          Math.max(0, colorObj.green - 58),
          Math.max(0, colorObj.blue - 58)
        );

        // Main colourful 3D block body
        g.fillStyle(mainColor, 1);
        g.fillRoundedRect(-halfW, -halfH, w, h, radius);

        // Upper-half curved glass sheen
        const wordSheenH = Math.round(h * 0.46);
        const wordCurveR = Math.min(20, Math.floor(wordSheenH * 0.42));
        g.fillStyle(0xffffff, isError || isSuccess ? 0.1 : 0.14);
        g.fillRoundedRect(-halfW + 3, -halfH + 3, w - 6, wordSheenH, {
          tl: radius - 2,
          tr: radius - 2,
          bl: wordCurveR,
          br: wordCurveR,
        });

        // Bottom 3D bevel lip
        g.fillStyle(darkBevel, 0.92);
        g.fillRoundedRect(-halfW + 1, halfH - 9, w - 2, 9, {
          tl: 0,
          tr: 0,
          bl: radius,
          br: radius,
        });

        // Crisp top specular highlight strip
        g.fillStyle(0xffffff, isError || isSuccess ? 0.25 : 0.36);
        g.fillRoundedRect(-halfW + 10, -halfH + 5, w - 20, Math.max(6, Math.round(h * 0.085)), 4);

        // Delicate inner glass rim
        g.lineStyle(1, 0xffffff, 0.26);
        g.strokeRoundedRect(-halfW + 2.5, -halfH + 2.5, w - 5, h - 5, radius - 2);

        // Adjust text colours during green/red feedback states for crisp contrast
        const { kanaText, wordText } = card.textNodes;
        if (isError || isSuccess) {
          kanaText.setColor('#ffffff');
          wordText.setColor('#ffffff');
          wordText.setStroke(isError ? '#7f1d1d' : '#064e3b', 3);
        } else {
          kanaText.setColor(card.isLightTile ? '#1e1b4b' : '#ffffff');
          wordText.setColor(card.isLightTile ? '#1e1b4b' : '#ffffff');
          wordText.setStroke(card.isLightTile ? '#fef9c3' : '#0f172a', card.isLightTile ? 1 : 3);
        }
      } else {
        // Glossy glass Answer card (Romaji + English Translation)
        const baseBody = isSuccess ? 0x047857 : isError ? 0x991b1b : 0x071d4d;
        const upperTint = isSuccess ? 0x10b981 : isError ? 0xdc2626 : 0x143c8c;
        const bottomBevel = isSuccess ? 0x064e3b : isError ? 0x7f1d1d : 0x03102e;
        const accentRim = isSuccess ? 0x4ade80 : isError ? 0xf87171 : 0x38bdf8;

        // Deep base body
        g.fillStyle(baseBody, 0.97);
        g.fillRoundedRect(-halfW, -halfH, w, h, radius);

        // Luminous upper-half sapphire glass reflection
        const ansUpperH = Math.round(h * 0.52);
        const ansUpperR = Math.min(22, Math.floor(ansUpperH * 0.42));
        g.fillStyle(upperTint, 0.58);
        g.fillRoundedRect(-halfW + 2, -halfH + 2, w - 4, ansUpperH, {
          tl: radius - 1,
          tr: radius - 1,
          bl: ansUpperR,
          br: ansUpperR,
        });

        // Soft top glass frost layer
        const ansFrostH = Math.round(h * 0.42);
        const ansFrostR = Math.min(18, Math.floor(ansFrostH * 0.42));
        g.fillStyle(0xffffff, 0.1);
        g.fillRoundedRect(-halfW + 4, -halfH + 4, w - 8, ansFrostH, {
          tl: radius - 3,
          tr: radius - 3,
          bl: ansFrostR,
          br: ansFrostR,
        });

        // Bottom 3D bevel lip
        g.fillStyle(bottomBevel, 0.92);
        g.fillRoundedRect(-halfW + 1, halfH - 8, w - 2, 8, {
          tl: 0,
          tr: 0,
          bl: radius,
          br: radius,
        });

        // Subtle glowing accent hairline across the top edge
        g.fillStyle(accentRim, 0.85);
        g.fillRoundedRect(-halfW + 4, -halfH + 2, w - 8, 3.5, { tl: radius, tr: radius, bl: 2, br: 2 });

        // Crisp specular gloss bar near top
        g.fillStyle(0xffffff, 0.32);
        g.fillRoundedRect(-halfW + 12, -halfH + 7, w - 24, Math.max(5, Math.round(h * 0.07)), 4);

        // Inner glass rim highlight
        g.lineStyle(1, 0xbae6fd, 0.28);
        g.strokeRoundedRect(-halfW + 2.5, -halfH + 2.5, w - 5, h - 5, radius - 2);
      }

      // Outer border stroke
      if (isSuccess) {
        g.lineStyle(3.5, 0x86efac, 1);
      } else if (isError) {
        g.lineStyle(3.5, 0xfca5a5, 1);
      } else if (isSelected) {
        g.lineStyle(3.5, 0xffca3a, 1);
      } else if (isHover) {
        g.lineStyle(2.5, 0xffffff, 0.95);
      } else if (card.kind === 'word') {
        g.lineStyle(1.8, 0xffffff, 0.42);
      } else {
        g.lineStyle(2, 0x60a5fa, 0.65);
      }
      g.strokeRoundedRect(-halfW, -halfH, w, h, radius);
    }

    /**
     * Draw subtle recessed markers in slots whose pairs have been exploded and cleared.
     */
    redrawClearedSlotMarkers() {
      this.slotMarkersGraphics.clear();
      if (!this.currentCardCount || this.clearedSlots.size === 0) return;

      const layout = this.getGridLayout(this.currentCardCount);
      for (const slotIdx of this.clearedSlots) {
        const pos = layout.positions[slotIdx];
        if (!pos) continue;
        const hw = layout.cardW / 2;
        const hh = layout.cardH / 2;
        this.slotMarkersGraphics.fillStyle(0x10b981, 0.07);
        this.slotMarkersGraphics.fillRoundedRect(pos.x - hw + 4, pos.y - hh + 4, layout.cardW - 8, layout.cardH - 8, 12);
        this.slotMarkersGraphics.lineStyle(1.5, 0x34d399, 0.18);
        this.slotMarkersGraphics.strokeRoundedRect(pos.x - hw + 4, pos.y - hh + 4, layout.cardW - 8, layout.cardH - 8, 12);
      }
    }

    /**
     * Left-click state machine for selecting and matching cards.
     */
    handleCardClick(card) {
      // Clicking the currently selected card deselects it
      if (this.selectedCard === card) {
        this.deselectCard(card);
        this.selectedCard = null;
        return;
      }

      // First selection
      if (!this.selectedCard) {
        this.selectCard(card);
        return;
      }

      // Clicking another card of the SAME kind switches selection without penalising the player
      if (this.selectedCard.kind === card.kind) {
        this.deselectCard(this.selectedCard);
        this.selectCard(card);
        return;
      }

      // Opposite kinds (Word + Answer or Answer + Word): evaluate match
      const first = this.selectedCard;
      const second = card;
      this.selectedCard = null;

      const isMatch =
        first.pairId === second.pairId ||
        (first.answerSignature && first.answerSignature === second.answerSignature);

      if (isMatch) {
        this.handleMatchSuccess(first, second);
      } else {
        this.handleMatchFailure(first, second);
      }
    }

    selectCard(card) {
      this.selectedCard = card;
      card.state = 'selected';
      card.container.setDepth(15);
      this.paintCard(card);
      this.tweens.killTweensOf(card.container);
      this.tweens.add({
        targets: card.container,
        scale: 1.05,
        duration: 110,
        ease: 'Back.easeOut',
      });
    }

    deselectCard(card) {
      card.state = 'normal';
      card.container.setDepth(10);
      this.paintCard(card);
      this.tweens.killTweensOf(card.container);
      this.tweens.add({
        targets: card.container,
        scale: 1.0,
        duration: 100,
        ease: 'Quad.easeOut',
      });
    }

    /**
     * Success: emerald green explosion effect on BOTH cards, +10 score, confirmation SFX.
     */
    handleMatchSuccess(cardA, cardB) {
      this.sound.play('sfx-success', { volume: 0.75 });

      this.score += 10;
      this.pairsMatched += 1;
      this.streak += 1;
      this.remainingPairsOnBoard = Math.max(0, this.remainingPairsOnBoard - 1);

      [cardA, cardB].forEach((card) => {
        card.matched = true;
        card.locked = true;
        card.state = 'success';
        card.hitZone.disableInteractive();
        card.container.setDepth(22);
        this.paintCard(card);

        const wx = card.container.x;
        const wy = card.container.y;

        this.clearedSlots.add(card.slotIndex);

        // Green confetti square explosion
        const greenBurst = this.add.particles(wx, wy, 'particle-square', {
          speed: { min: 120, max: 360 },
          angle: { min: 0, max: 360 },
          scale: { start: 1.15, end: 0 },
          alpha: { start: 1, end: 0 },
          lifespan: { min: 420, max: 780 },
          gravityY: 360,
          rotate: { min: -260, max: 260 },
          tint: [0x10b981, 0x22c55e, 0x4ade80, 0x86efac],
          emitting: false,
        });
        greenBurst.setDepth(24);
        greenBurst.explode(22);
        this.scheduleCall(840, () => {
          if (greenBurst && greenBurst.active) greenBurst.destroy();
        });

        // Bright emerald/mint spark explosion
        const sparks = this.add.particles(wx, wy, 'particle-spark', {
          speed: { min: 150, max: 390 },
          angle: { min: 0, max: 360 },
          scale: { start: 0.95, end: 0 },
          alpha: { start: 1, end: 0 },
          lifespan: { min: 280, max: 520 },
          tint: [0x4ade80, 0xa7f3d0, 0xfde047],
          emitting: false,
        });
        sparks.setDepth(25);
        sparks.explode(10);
        this.scheduleCall(580, () => {
          if (sparks && sparks.active) sparks.destroy();
        });

        // Expanding green shockwave ring
        const ring = this.add
          .circle(wx, wy, Math.min(card.width, card.height) * 0.32)
          .setStrokeStyle(5, 0x4ade80, 0.95)
          .setFillStyle(0x22c55e, 0.14)
          .setDepth(23);
        this.tweens.add({
          targets: ring,
          scale: 2.1,
          alpha: 0,
          duration: 360,
          ease: 'Cubic.easeOut',
          onComplete: () => ring.destroy(),
        });

        // Card pop-and-explode animation
        this.tweens.killTweensOf(card.container);
        this.tweens.add({
          targets: card.container,
          scale: 1.15,
          duration: 90,
          ease: 'Quad.easeOut',
          onComplete: () => {
            if (!card.container || !card.container.active) return;
            this.tweens.add({
              targets: card.container,
              scale: 0.15,
              alpha: 0,
              angle: Phaser.Math.Between(-18, 18),
              duration: 240,
              ease: 'Back.easeIn',
              onComplete: () => {
                if (card.container && card.container.active) {
                  card.container.destroy();
                }
              },
            });
          },
        });
      });

      this.redrawClearedSlotMarkers();

      // Floating "+10" popup above the second clicked card
      const plusTen = this.add
        .text(cardB.container.x, cardB.container.y - 10, '+10', {
          fontFamily: FONT_MONO,
          fontSize: '34px',
          fontStyle: 'bold',
          color: '#4ade80',
          stroke: '#052e16',
          strokeThickness: 6,
        })
        .setOrigin(0.5)
        .setDepth(27);

      this.tweens.add({
        targets: plusTen,
        y: cardB.container.y - 84,
        scale: 1.25,
        alpha: 0,
        duration: 680,
        ease: 'Cubic.easeOut',
        onComplete: () => plusTen.destroy(),
      });

      // Subtle camera kick & score pop
      this.cameras.main.shake(80, 0.0024);
      this.updateHUDValues();
      this.tweens.add({
        targets: this.scoreValueText,
        scale: 1.28,
        duration: 110,
        yoyo: true,
        ease: 'Quad.easeOut',
      });

      // Check if current board is completely cleared
      if (this.remainingPairsOnBoard === 0) {
        this.boardsCompleted += 1;
        const nextBoardIdx = this.currentBoardIndex + 1;

        if (nextBoardIdx >= this.boards.length) {
          this.scheduleCall(480, () => {
            if (this.isPlaying) {
              this.endSession('completed');
            }
          });
        } else {
          this.showBoardClearBanner(this.currentBoardIndex + 1, nextBoardIdx + 1, this.boards.length);
          this.scheduleCall(820, () => {
            if (this.isPlaying) {
              this.loadBoard(nextBoardIdx);
            }
          });
        }
      }
    }

    /**
     * Failure: highlight BOTH cards in bright RED, shake horizontally, play error SFX, then restore.
     */
    handleMatchFailure(cardA, cardB) {
      this.sound.play('sfx-fail', { volume: 0.78 });

      this.mistakes += 1;
      this.streak = 0;
      this.updateHUDValues();

      [cardA, cardB].forEach((card) => {
        card.locked = true;
        card.state = 'error';
        card.container.setDepth(16);
        this.paintCard(card);

        this.tweens.killTweensOf(card.container);
        card.container.setScale(1.0);
        card.container.x = card.baseX;

        this.tweens.add({
          targets: card.container,
          x: card.baseX + 12,
          duration: 45,
          yoyo: true,
          repeat: 4,
          ease: 'Sine.easeInOut',
          onComplete: () => {
            if (card.container && card.container.active) {
              card.container.x = card.baseX;
            }
          },
        });
      });

      // Quick red mismatch indicator
      const errLabel = this.add
        .text(cardB.baseX, cardB.baseY - cardB.height / 2 - 14, '✗ Mismatch', {
          fontFamily: FONT_UI,
          fontSize: '16px',
          fontStyle: 'bold',
          color: '#fca5a5',
          stroke: '#450a0a',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(27);

      this.tweens.add({
        targets: errLabel,
        y: errLabel.y - 24,
        alpha: 0,
        duration: 620,
        ease: 'Cubic.easeOut',
        onComplete: () => errLabel.destroy(),
      });

      this.scheduleCall(480, () => {
        [cardA, cardB].forEach((card) => {
          if (!card.container || !card.container.active || card.matched) return;
          card.locked = false;
          card.state = 'normal';
          card.container.setDepth(10);
          card.container.x = card.baseX;
          this.paintCard(card);
        });
      });
    }

    /**
     * Celebratory interstitial banner between consecutive boards (e.g. Board 1 -> Board 2 of 10).
     */
    showBoardClearBanner(clearedNum, nextNum, totalBoards) {
      const m = this.getLayoutMetrics();
      this.bannerLayer.removeAll(true);

      const boxW = 420;
      const boxH = 112;
      const bg = this.add.graphics();
      bg.fillStyle(0x031c52, 0.94);
      bg.fillRoundedRect(m.centerX - boxW / 2, m.centerY - boxH / 2, boxW, boxH, 18);
      bg.lineStyle(3, 0x4ade80, 0.95);
      bg.strokeRoundedRect(m.centerX - boxW / 2, m.centerY - boxH / 2, boxW, boxH, 18);

      const title = this.add
        .text(m.centerX, m.centerY - 16, `Board ${clearedNum} Cleared!`, {
          fontFamily: FONT_UI,
          fontSize: '26px',
          fontStyle: 'bold',
          color: '#4ade80',
        })
        .setOrigin(0.5);

      const sub = this.add
        .text(m.centerX, m.centerY + 20, `Loading Board ${nextNum} of ${totalBoards}...`, {
          fontFamily: FONT_UI,
          fontSize: '15px',
          fontStyle: '600',
          color: '#dbeafe',
        })
        .setOrigin(0.5);

      this.bannerLayer.add([bg, title, sub]);
      this.bannerLayer.setAlpha(0);
      this.tweens.add({
        targets: this.bannerLayer,
        alpha: 1,
        duration: 180,
        ease: 'Quad.easeOut',
      });
    }

    updateHUDValues() {
      this.scoreValueText.setText(String(this.score));
      const boardNum = Math.min(this.currentBoardIndex + 1, Math.max(1, this.boards.length));
      this.progressText.setText(
        `Board ${boardNum}/${this.boards.length}  •  Pairs: ${this.pairsMatched}/${this.totalPairs}`
      );
      this.streakText.setText(
        this.streak > 1 ? `Streak: x${this.streak}` : `Mismatches: ${this.mistakes}`
      );
    }

    tickTimer() {
      if (!this.isPlaying) return;

      const elapsed = performance.now() - this.sessionStartMs;
      this.remainingMs = Math.max(0, this.durationMs - elapsed);
      this.updateTimerDisplay(false);

      if (this.remainingMs <= 0) {
        this.endSession('timeout');
      }
    }

    updateTimerDisplay(force) {
      const totalSec = Math.ceil(this.remainingMs / 1000);
      if (!force && totalSec === this.lastDisplayedSec) return;
      this.lastDisplayedSec = totalSec;

      const mins = Math.floor(totalSec / 60);
      const secs = totalSec % 60;
      const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      this.timeValueText.setText(formatted);

      if (totalSec <= 15) {
        this.timeValueText.setColor('#f87171');
        this.tweens.add({
          targets: this.timeValueText,
          scale: 1.12,
          duration: 130,
          yoyo: true,
        });
      } else if (totalSec <= 30) {
        this.timeValueText.setColor('#fbbf24');
      } else {
        this.timeValueText.setColor('#ffffff');
      }
    }

    handleResize() {
      this.drawBackgroundGrid();
      this.layoutHUD();

      if (!this.cards || this.cards.length === 0 || !this.currentCardCount) return;

      const layout = this.getGridLayout(this.currentCardCount);
      for (const card of this.cards) {
        if (card.matched || !card.container || !card.container.active) continue;
        const pos = layout.positions[card.slotIndex];
        if (!pos) continue;

        this.tweens.killTweensOf(card.container);
        card.baseX = pos.x;
        card.baseY = pos.y;
        card.width = layout.cardW;
        card.height = layout.cardH;
        card.container.setPosition(pos.x, pos.y);
        card.container.setScale(card.state === 'selected' ? 1.05 : 1.0);
        this.layoutCardContents(card);
        this.paintCard(card);
      }

      this.redrawClearedSlotMarkers();
    }

    /**
     * Stop gameplay and emit final statistics (Score, Match Pairs / Min, Accuracy, Boards).
     * @param {'timeout' | 'completed' | 'quit'} reason
     */
    endSession(reason) {
      if (!this.isPlaying) return;
      this.isPlaying = false;

      if (this.timerEvent) {
        this.timerEvent.remove(false);
        this.timerEvent = null;
      }
      this.clearTrackedTimers();

      // Disable remaining cards immediately
      for (const card of this.cards) {
        if (card.hitZone && card.hitZone.active) {
          card.hitZone.disableInteractive();
        }
      }

      const elapsedMs =
        reason === 'timeout'
          ? this.durationMs
          : Math.max(1000, performance.now() - this.sessionStartMs);
      const elapsedSeconds = elapsedMs / 1000;
      const elapsedMinutes = Math.max(elapsedSeconds / 60, 1 / 60);

      const pairsPerMinute = this.pairsMatched / elapsedMinutes;
      const totalAttempts = this.pairsMatched + this.mistakes;
      const accuracy =
        totalAttempts > 0 ? Math.round((this.pairsMatched / totalAttempts) * 100) : 0;

      if (this.callbacks && typeof this.callbacks.onGameOver === 'function') {
        this.callbacks.onGameOver({
          reason,
          score: this.score,
          pairsMatched: this.pairsMatched,
          totalPairs: this.totalPairs,
          boardsCompleted: this.boardsCompleted,
          totalBoards: this.boards.length,
          mistakes: this.mistakes,
          elapsedSeconds,
          pairsPerMinute,
          accuracy,
        });
      }
    }
  }

  global.JLPTMatchScene = JLPTMatchScene;
})(window);
