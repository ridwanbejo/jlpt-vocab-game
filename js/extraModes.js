(function (global) {
  'use strict';

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

  function isLightColor(hex) {
    return hex === 0xffca3a || hex === 0x84cc16;
  }

  function fitSingleLineText(textObj, maxW) {
    textObj.setScale(1);
    if (textObj.width > maxW && maxW > 0) {
      textObj.setScale(maxW / textObj.width);
    }
  }

  /* ==========================================================================
     1. MULTIPLE CHOICE CONTROLLER
     ========================================================================== */
  class MultipleChoiceController {
    constructor(scene, sessionData) {
      this.scene = scene;
      this.questions = sessionData.questions || [];
      this.index = 0;
      this.locked = false;
      this.optionCards = [];
    }

    start() {
      this.scene.totalPairs = this.questions.length;
      this.scene.boards = [this.questions];
      this.renderQuestion();
    }

    renderQuestion() {
      const s = this.scene;
      s.boardLayer.removeAll(true);
      this.optionCards = [];
      this.locked = false;

      if (this.index >= this.questions.length) {
        s.boardsCompleted = 1;
        s.finishModeSession('completed');
        return;
      }

      const q = this.questions[this.index];
      const m = s.getLayoutMetrics();
      const cfg = s.config;

      s.setProgressText(`Question ${this.index + 1} / ${this.questions.length}`);
      s.notifyBoardChange(`QUESTION ${this.index + 1} / ${this.questions.length}`);

      // --- QUESTION PROMPT CARD (Upper-Centre) ---
      const promptW = Math.min(560, m.trayW - 60);
      const promptH = Phaser.Math.Clamp(Math.floor(m.trayH * 0.34), 130, 210);
      const promptX = m.centerX;
      const promptY = m.trayY + 26 + Math.round(promptH / 2);
      const blockColor = BLOCK_PALETTE[this.index % BLOCK_PALETTE.length];
      const lightTile = isLightColor(blockColor);

      const promptContainer = s.add.container(promptX, promptY);
      const promptBg = s.add.graphics();
      s.paintGlossyBlock(promptBg, promptW, promptH, blockColor, 'normal');

      // JLPT badge
      const lvlColor = LEVEL_COLORS[q.vocab.level] || 0x8b5cf6;
      const bx = promptW / 2 - 28;
      const by = -promptH / 2 + 20;
      const badgeBg = s.add.graphics();
      badgeBg.fillStyle(0x0f172a, 0.55);
      badgeBg.fillRoundedRect(bx - 18, by - 11, 36, 22, 7);
      badgeBg.lineStyle(1.4, lvlColor, 0.95);
      badgeBg.strokeRoundedRect(bx - 18, by - 11, 36, 22, 7);
      const badgeTxt = s.add
        .text(bx, by, `N${q.vocab.level}`, {
          fontFamily: FONT_UI,
          fontSize: '12px',
          fontStyle: 'bold',
          color: '#ffffff',
        })
        .setOrigin(0.5);

      const hideKanaHint = Boolean(cfg.showRomaji && cfg.answerReading === 'kana' && q.vocab.hasKanji);
      const wordSize = Math.min(62, Math.max(36, Math.floor(promptH * 0.38)));
      const wordTxt = s.add
        .text(0, hideKanaHint ? 4 : -Math.round(promptH * 0.08), q.vocab.word, {
          fontFamily: FONT_JP,
          fontSize: `${wordSize}px`,
          fontStyle: 'bold',
          color: lightTile ? '#1e1b4b' : '#ffffff',
          stroke: lightTile ? '#fef9c3' : '#0f172a',
          strokeThickness: lightTile ? 1 : 4,
        })
        .setOrigin(0.5);
      fitSingleLineText(wordTxt, promptW - 44);

      const promptChildren = [promptBg, badgeBg, badgeTxt, wordTxt];

      if (!hideKanaHint) {
        const kanaY = Math.round(promptH * 0.28);
        const kanaTxt = s.add
          .text(0, kanaY, q.vocab.kana, {
            fontFamily: FONT_JP,
            fontSize: '15px',
            fontStyle: 'bold',
            color: lightTile ? '#1e1b4b' : '#ffffff',
          })
          .setOrigin(0.5);
        fitSingleLineText(kanaTxt, promptW - 60);

        const pillW = Math.min(promptW - 40, Math.max(56, kanaTxt.displayWidth + 22));
        const pillH = Math.max(24, kanaTxt.displayHeight + 8);
        const kanaPill = s.add.graphics();
        kanaPill.fillStyle(lightTile ? 0x1e1b4b : 0x050d26, lightTile ? 0.14 : 0.28);
        kanaPill.fillRoundedRect(-pillW / 2, kanaY - pillH / 2, pillW, pillH, 10);
        promptChildren.push(kanaPill, kanaTxt);
      }

      promptContainer.add(promptChildren);
      s.boardLayer.add(promptContainer);

      promptContainer.setScale(0.88).setAlpha(0);
      s.tweens.add({
        targets: promptContainer,
        scale: 1,
        alpha: 1,
        duration: 220,
        ease: 'Back.easeOut',
      });

      // --- 2 x 2 ANSWER OPTIONS ---
      const gridTop = promptY + Math.round(promptH / 2) + 28;
      const gridAvailH = m.trayY + m.trayH - gridTop - 24;
      const gapX = 20;
      const gapY = 18;
      const optW = Phaser.Math.Clamp(Math.floor((Math.min(980, m.trayW - 64) - gapX) / 2), 240, 470);
      const optH = Phaser.Math.Clamp(Math.floor((gridAvailH - gapY) / 2), 104, 172);
      const labels = ['A', 'B', 'C', 'D'];

      q.options.forEach((optVocab, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const ox = m.centerX + (col === 0 ? -(optW / 2 + gapX / 2) : optW / 2 + gapX / 2);
        const oy = gridTop + Math.round(optH / 2) + row * (optH + gapY);

        const container = s.add.container(ox, oy);
        const bg = s.add.graphics();
        s.paintGlossyGlass(bg, optW, optH, 'normal');

        // A/B/C/D corner badge
        const badgeG = s.add.graphics();
        const lx = -optW / 2 + 24;
        const ly = -optH / 2 + 22;
        badgeG.fillStyle(0x38bdf8, 0.25);
        badgeG.fillRoundedRect(lx - 13, ly - 12, 26, 24, 7);
        badgeG.lineStyle(1.2, 0x7dd3fc, 0.7);
        badgeG.strokeRoundedRect(lx - 13, ly - 12, 26, 24, 7);
        const badgeLabel = s.add
          .text(lx, ly, labels[idx], {
            fontFamily: FONT_MONO,
            fontSize: '13px',
            fontStyle: 'bold',
            color: '#bae6fd',
          })
          .setOrigin(0.5);

        const children = [bg, badgeG, badgeLabel];
        const innerW = optW - 44;

        // Reading (respects Romaji / Kana switch for Kanji words, Romaji only for Kana questions)
        const useKana = Boolean(cfg.answerReading === 'kana' && q.vocab.hasKanji);
        const readingStr = useKana
          ? optVocab.kana || optVocab.romaji || '—'
          : optVocab.romaji || '—';

        if (cfg.showRomaji && cfg.showDefinition) {
          const readingTxt = s.add
            .text(0, -Math.round(optH * 0.16), readingStr, {
              fontFamily: useKana ? FONT_JP : FONT_MONO,
              fontSize: `${Math.min(34, Math.max(24, Math.floor(optH * 0.24)))}px`,
              fontStyle: 'bold',
              color: '#fde047',
              align: 'center',
            })
            .setOrigin(0.5);
          fitSingleLineText(readingTxt, innerW);

          const div = s.add.graphics();
          const divY = Math.round(optH * 0.06);
          div.lineStyle(1, 0x7dd3fc, 0.3);
          div.lineBetween(-optW / 2 + 24, divY, optW / 2 - 24, divY);

          const defTxt = s.add
            .text(0, Math.round(optH * 0.27), '', {
              fontFamily: FONT_UI,
              fontSize: '13.5px',
              fontStyle: '600',
              color: '#f1f5f9',
              align: 'center',
              lineSpacing: 3,
              wordWrap: { width: innerW, useAdvancedWrap: true },
            })
            .setOrigin(0.5);
          s.fitWrappedText(defTxt, optVocab.definition || '—', Math.max(36, Math.round(optH * 0.36)));

          children.push(readingTxt, div, defTxt);
        } else if (cfg.showRomaji) {
          const readingTxt = s.add
            .text(0, 0, readingStr, {
              fontFamily: useKana ? FONT_JP : FONT_MONO,
              fontSize: `${Math.min(44, Math.max(30, Math.floor(optH * 0.32)))}px`,
              fontStyle: 'bold',
              color: '#fde047',
              align: 'center',
            })
            .setOrigin(0.5);
          fitSingleLineText(readingTxt, innerW);
          children.push(readingTxt);
        } else {
          const defTxt = s.add
            .text(0, 0, '', {
              fontFamily: FONT_UI,
              fontSize: '15px',
              fontStyle: '600',
              color: '#f1f5f9',
              align: 'center',
              lineSpacing: 4,
              wordWrap: { width: innerW, useAdvancedWrap: true },
            })
            .setOrigin(0.5);
          s.fitWrappedText(defTxt, optVocab.definition || '—', Math.max(60, Math.round(optH * 0.68)));
          children.push(defTxt);
        }

        const hit = s.add
          .zone(0, 0, optW, optH)
          .setOrigin(0.5)
          .setInteractive({ useHandCursor: true });

        const optObj = {
          vocab: optVocab,
          container,
          bg,
          hit,
          width: optW,
          height: optH,
          baseX: ox,
          baseY: oy,
          state: 'normal',
          disabled: false,
        };

        hit.on('pointerover', () => {
          if (!s.isPlaying || this.locked || optObj.disabled) return;
          optObj.state = 'hover';
          s.paintGlossyGlass(bg, optW, optH, 'hover');
          s.tweens.add({ targets: container, scale: 1.03, duration: 90, ease: 'Quad.easeOut' });
        });

        hit.on('pointerout', () => {
          if (optObj.disabled || optObj.state !== 'hover') return;
          optObj.state = 'normal';
          s.paintGlossyGlass(bg, optW, optH, 'normal');
          s.tweens.add({ targets: container, scale: 1, duration: 90, ease: 'Quad.easeOut' });
        });

        hit.on('pointerdown', (pointer) => {
          if (!s.isPrimaryPointer(pointer)) return;
          if (!s.isPlaying || this.locked || optObj.disabled) return;
          this.handleOptionSelect(optObj, q.vocab);
        });

        children.push(hit);
        container.add(children);
        s.boardLayer.add(container);
        this.optionCards.push(optObj);

        container.setScale(0.86).setAlpha(0);
        s.tweens.add({
          targets: container,
          scale: 1,
          alpha: 1,
          duration: 210,
          delay: 40 + idx * 35,
          ease: 'Back.easeOut',
        });
      });
    }

    handleOptionSelect(optObj, targetVocab) {
      const s = this.scene;
      const sigTarget = global.VocabLoader.getAnswerSignature(targetVocab, s.config);
      const sigPicked = global.VocabLoader.getAnswerSignature(optObj.vocab, s.config);
      const isCorrect =
        optObj.vocab.word === targetVocab.word ||
        (sigTarget && sigTarget === sigPicked);

      if (isCorrect) {
        this.locked = true;
        optObj.state = 'success';
        s.paintGlossyGlass(optObj.bg, optObj.width, optObj.height, 'success');
        s.spawnGreenBurst(optObj.baseX, optObj.baseY, Math.min(optObj.width, optObj.height) * 0.35);
        s.awardCorrect(optObj.baseX, optObj.baseY, 10);

        s.tweens.add({
          targets: optObj.container,
          scale: 1.07,
          duration: 120,
          yoyo: true,
        });

        s.scheduleCall(420, () => {
          if (!s.isPlaying) return;
          this.index += 1;
          this.renderQuestion();
        });
      } else {
        optObj.disabled = true;
        optObj.state = 'error';
        s.paintGlossyGlass(optObj.bg, optObj.width, optObj.height, 'error');
        s.shakeCard(optObj.container, optObj.baseX);
        s.recordMistake(optObj.baseX, optObj.baseY - optObj.height / 2 - 12, '✗ Wrong');

        s.scheduleCall(480, () => {
          if (!optObj.container || !optObj.container.active) return;
          optObj.disabled = false;
          optObj.state = 'normal';
          optObj.container.x = optObj.baseX;
          s.paintGlossyGlass(optObj.bg, optObj.width, optObj.height, 'normal');
        });
      }
    }

    handleResize() {
      if (this.scene.isPlaying) {
        this.renderQuestion();
      }
    }

    destroy() {
      this.optionCards = [];
    }
  }

  /* ==========================================================================
     2. CROSSWORDS CONTROLLER
     Touch/click a horizontal or vertical line, then choose the right answer.
     ========================================================================== */
  class CrosswordsController {
    constructor(scene, sessionData) {
      this.scene = scene;
      this.boards = sessionData.boards || [];
      this.boardIndex = 0;
      this.selectedEntryId = null;
      this.cellGraphicsMap = new Map();
      this.optionCards = [];
      this.locked = false;
    }

    start() {
      this.scene.boards = this.boards;
      this.scene.totalPairs = this.boards.reduce((sum, b) => sum + b.entries.length, 0);
      this.loadBoard(0);
    }

    loadBoard(idx) {
      this.scene.hideTransitionBanner();
      this.boardIndex = idx;
      this.locked = false;
      const board = this.boards[idx];
      if (!board) {
        this.scene.finishModeSession('completed');
        return;
      }
      const firstUnsolved = board.entries.find((e) => !e.solved) || board.entries[0];
      this.selectedEntryId = firstUnsolved ? firstUnsolved.id : null;
      this.renderBoard();
    }

    getCurrentBoard() {
      return this.boards[this.boardIndex];
    }

    getSelectedEntry() {
      const board = this.getCurrentBoard();
      if (!board) return null;
      return board.entries.find((e) => e.id === this.selectedEntryId) || null;
    }

    renderBoard() {
      const s = this.scene;
      const board = this.getCurrentBoard();
      if (!board) return;

      s.boardLayer.removeAll(true);
      this.cellGraphicsMap.clear();
      this.optionCards = [];

      const m = s.getLayoutMetrics();
      s.setProgressText(
        `Board ${this.boardIndex + 1}/${this.boards.length}  •  Solved: ${s.pairsMatched}/${s.totalPairs}`
      );
      s.notifyBoardChange(`CROSSWORD ${this.boardIndex + 1} / ${this.boards.length}`);

      // Split tray into Left (Crossword Grid ~56%) and Right (Clue + 4 Choices ~42%)
      const pad = 22;
      const gap = 22;
      const leftW = Math.floor((m.trayW - pad * 2 - gap) * 0.56);
      const rightW = m.trayW - pad * 2 - gap - leftW;
      const leftX = m.trayX + pad;
      const rightX = leftX + leftW + gap;
      const innerTop = m.trayY + pad;
      const innerH = m.trayH - pad * 2;

      // Subtle panel behind grid
      const gridPanelBg = s.add.graphics();
      gridPanelBg.fillStyle(0x031742, 0.65);
      gridPanelBg.fillRoundedRect(leftX, innerTop, leftW, innerH, 16);
      gridPanelBg.lineStyle(1.5, 0x60a5fa, 0.3);
      gridPanelBg.strokeRoundedRect(leftX, innerTop, leftW, innerH, 16);
      s.boardLayer.add(gridPanelBg);

      // Compute square cell size
      const cellGap = 5;
      const maxGridW = leftW - 32;
      const maxGridH = innerH - 54;
      const cellSize = Phaser.Math.Clamp(
        Math.floor(
          Math.min(
            (maxGridW - (board.cols - 1) * cellGap) / board.cols,
            (maxGridH - (board.rows - 1) * cellGap) / board.rows
          )
        ),
        34,
        66
      );

      const gridW = board.cols * cellSize + (board.cols - 1) * cellGap;
      const gridH = board.rows * cellSize + (board.rows - 1) * cellGap;
      const startX = leftX + Math.round((leftW - gridW) / 2);
      const startY = innerTop + 34 + Math.round((innerH - 38 - gridH) / 2);

      // Grid header hint
      const gridHint = s.add
        .text(leftX + Math.round(leftW / 2), innerTop + 18, 'Touch any horizontal or vertical line to select', {
          fontFamily: FONT_UI,
          fontSize: '13px',
          fontStyle: '600',
          color: '#93c5fd',
        })
        .setOrigin(0.5);
      s.boardLayer.add(gridHint);

      const activeEntry = this.getSelectedEntry();
      const activeCellSet = new Set(
        activeEntry ? activeEntry.cells.map((c) => `${c.r},${c.c}`) : []
      );

      for (let r = 0; r < board.rows; r++) {
        for (let c = 0; c < board.cols; c++) {
          const cell = board.cells[r][c];
          if (!cell) continue;

          const cx = startX + c * (cellSize + cellGap) + Math.round(cellSize / 2);
          const cy = startY + r * (cellSize + cellGap) + Math.round(cellSize / 2);
          const cellKey = `${r},${c}`;
          const isActiveLine = activeCellSet.has(cellKey);
          const isStartOfActive =
            activeEntry && activeEntry.row === r && activeEntry.col === c;

          const cellContainer = s.add.container(cx, cy);
          const bg = s.add.graphics();
          this.paintCrosswordCell(bg, cellSize, cell.revealed, isActiveLine);

          const children = [bg];

          if (cell.number !== null) {
            const numTxt = s.add
              .text(-cellSize / 2 + 5, -cellSize / 2 + 3, String(cell.number), {
                fontFamily: FONT_MONO,
                fontSize: `${Math.max(9, Math.round(cellSize * 0.21))}px`,
                fontStyle: 'bold',
                color: isActiveLine ? '#fde047' : '#93c5fd',
              })
              .setOrigin(0, 0);
            children.push(numTxt);
          }

          if (isStartOfActive && !cell.revealed) {
            const arrowTxt = s.add
              .text(cellSize / 2 - 5, -cellSize / 2 + 2, activeEntry.dir === 'across' ? '→' : '↓', {
                fontFamily: FONT_UI,
                fontSize: `${Math.max(10, Math.round(cellSize * 0.24))}px`,
                fontStyle: 'bold',
                color: '#fde047',
              })
              .setOrigin(1, 0);
            children.push(arrowTxt);
          }

          const charTxt = s.add
            .text(0, 2, cell.revealed ? cell.ch : '', {
              fontFamily: FONT_JP,
              fontSize: `${Math.round(cellSize * 0.54)}px`,
              fontStyle: 'bold',
              color: '#ffffff',
              stroke: '#052e16',
              strokeThickness: 2,
            })
            .setOrigin(0.5);
          children.push(charTxt);

          const hit = s.add
            .zone(0, 0, cellSize, cellSize)
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });

          hit.on('pointerdown', (pointer) => {
            if (!s.isPrimaryPointer(pointer) || !s.isPlaying || this.locked) return;
            this.handleCellTap(cell);
          });

          children.push(hit);
          cellContainer.add(children);
          s.boardLayer.add(cellContainer);
          this.cellGraphicsMap.set(cellKey, { container: cellContainer, bg, charTxt, cx, cy, cellSize });
        }
      }

      // --- RIGHT SIDE: SELECTED LINE CLUE + 4 OPTIONS ---
      this.renderClueAndOptions(rightX, innerTop, rightW, innerH, board, activeEntry);
    }

    paintCrosswordCell(g, size, revealed, isActive) {
      g.clear();
      const half = size / 2;
      const r = Math.max(6, Math.round(size * 0.16));

      if (revealed) {
        g.fillStyle(0x059669, 0.96);
        g.fillRoundedRect(-half, -half, size, size, r);
        g.fillStyle(0xffffff, 0.16);
        g.fillRoundedRect(-half + 3, -half + 3, size - 6, Math.round(size * 0.42), r - 2);
        g.lineStyle(isActive ? 3 : 2, isActive ? 0xffca3a : 0x6ee7b7, 1);
        g.strokeRoundedRect(-half, -half, size, size, r);
      } else if (isActive) {
        g.fillStyle(0x1d4ed8, 0.95);
        g.fillRoundedRect(-half, -half, size, size, r);
        g.fillStyle(0xffca3a, 0.22);
        g.fillRoundedRect(-half + 2, -half + 2, size - 4, size - 4, r - 1);
        g.lineStyle(3, 0xffca3a, 1);
        g.strokeRoundedRect(-half, -half, size, size, r);
      } else {
        g.fillStyle(0x0a2458, 0.92);
        g.fillRoundedRect(-half, -half, size, size, r);
        g.fillStyle(0xffffff, 0.08);
        g.fillRoundedRect(-half + 3, -half + 3, size - 6, Math.round(size * 0.38), r - 2);
        g.lineStyle(1.5, 0x60a5fa, 0.55);
        g.strokeRoundedRect(-half, -half, size, size, r);
      }
    }

    handleCellTap(cell) {
      const board = this.getCurrentBoard();
      if (!board) return;

      const candidateEntries = cell.entryIds
        .map((id) => board.entries.find((e) => e.id === id))
        .filter(Boolean);

      if (candidateEntries.length === 0) return;

      // Prefer unsolved entries; if tapping an intersection, toggle between Across and Down
      const unsolved = candidateEntries.filter((e) => !e.solved);
      const list = unsolved.length > 0 ? unsolved : candidateEntries;

      const curIdx = list.findIndex((e) => e.id === this.selectedEntryId);
      const nextEntry = curIdx === -1 ? list[0] : list[(curIdx + 1) % list.length];

      if (nextEntry && nextEntry.id !== this.selectedEntryId) {
        this.selectedEntryId = nextEntry.id;
        this.renderBoard();
      }
    }

    renderClueAndOptions(x, y, width, height, board, activeEntry) {
      const s = this.scene;
      const cfg = s.config;
      const cx = x + Math.round(width / 2);

      // Clue card at top of right column
      const clueH = Phaser.Math.Clamp(Math.floor(height * 0.34), 130, 190);
      const clueY = y + Math.round(clueH / 2);
      const clueBg = s.add.graphics();
      clueBg.setPosition(cx, clueY);
      s.paintGlossyGlass(clueBg, width, clueH, 'selected');
      s.boardLayer.add(clueBg);

      if (!activeEntry) return;

      const dirLabel = activeEntry.dir === 'across' ? 'ACROSS →' : 'DOWN ↓';
      const headerTxt = s.add
        .text(
          x + 18,
          y + 16,
          `#${activeEntry.number}  ${dirLabel}  •  ${activeEntry.chars.length} chars  •  N${activeEntry.vocab.level}`,
          {
            fontFamily: FONT_MONO,
            fontSize: '13px',
            fontStyle: 'bold',
            color: '#fde047',
          }
        )
        .setOrigin(0, 0);
      s.boardLayer.add(headerTxt);

      // Next-line quick switch button in top-right of clue box
      const unsolvedCount = board.entries.filter((e) => !e.solved).length;
      if (unsolvedCount > 1) {
        const swBtnW = 86;
        const swBtnH = 26;
        const swX = x + width - 16 - swBtnW / 2;
        const swY = y + 24;
        const swCont = s.add.container(swX, swY);
        const swBg = s.add.graphics();
        swBg.fillStyle(0x1d4ed8, 0.85);
        swBg.fillRoundedRect(-swBtnW / 2, -swBtnH / 2, swBtnW, swBtnH, 8);
        swBg.lineStyle(1.2, 0x93c5fd, 0.8);
        swBg.strokeRoundedRect(-swBtnW / 2, -swBtnH / 2, swBtnW, swBtnH, 8);
        const swTxt = s.add
          .text(0, 0, 'Next Line ↻', {
            fontFamily: FONT_UI,
            fontSize: '11px',
            fontStyle: 'bold',
            color: '#ffffff',
          })
          .setOrigin(0.5);
        const swHit = s.add.zone(0, 0, swBtnW, swBtnH).setOrigin(0.5).setInteractive({ useHandCursor: true });
        swHit.on('pointerdown', (pointer) => {
          if (!s.isPrimaryPointer(pointer) || !s.isPlaying || this.locked) return;
          const unsolved = board.entries.filter((e) => !e.solved);
          const curIdx = unsolved.findIndex((e) => e.id === this.selectedEntryId);
          const next = unsolved[(curIdx + 1) % unsolved.length];
          if (next) {
            this.selectedEntryId = next.id;
            this.renderBoard();
          }
        });
        swCont.add([swBg, swTxt, swHit]);
        s.boardLayer.add(swCont);
      }

      // Clue body: show Kanji prominently (if Kanji word) + Definition & Romaji (unless hidden)
      const innerW = width - 32;
      let cursorY = y + 48;

      if (activeEntry.vocab.hasKanji) {
        const kanjiTxt = s.add
          .text(cx, cursorY + 20, activeEntry.vocab.word, {
            fontFamily: FONT_JP,
            fontSize: '34px',
            fontStyle: 'bold',
            color: '#ffffff',
            stroke: '#0f172a',
            strokeThickness: 3,
          })
          .setOrigin(0.5);
        fitSingleLineText(kanjiTxt, innerW);
        s.boardLayer.add(kanjiTxt);
        cursorY += 48;
      }

      const showRomajiClue = Boolean(
        cfg.showRomaji && (cfg.answerReading !== 'kana' || !activeEntry.vocab.hasKanji)
      );
      if (showRomajiClue) {
        const romTxt = s.add
          .text(cx, cursorY + 10, activeEntry.vocab.romaji || '', {
            fontFamily: FONT_MONO,
            fontSize: '18px',
            fontStyle: 'bold',
            color: '#38bdf8',
          })
          .setOrigin(0.5);
        fitSingleLineText(romTxt, innerW);
        s.boardLayer.add(romTxt);
        cursorY += 28;
      }

      if (cfg.showDefinition || !activeEntry.vocab.hasKanji) {
        const maxDefH = Math.max(28, y + clueH - cursorY - 12);
        const defTxt = s.add
          .text(cx, cursorY + Math.round(maxDefH / 2), '', {
            fontFamily: FONT_UI,
            fontSize: '13.5px',
            fontStyle: '600',
            color: '#dbeafe',
            align: 'center',
            lineSpacing: 3,
            wordWrap: { width: innerW, useAdvancedWrap: true },
          })
          .setOrigin(0.5);
        s.fitWrappedText(defTxt, activeEntry.vocab.definition || '—', maxDefH);
        s.boardLayer.add(defTxt);
      }

      // --- 4 TOUCHABLE ANSWER OPTIONS FOR THE SELECTED LINE ---
      const optsTop = y + clueH + 16;
      const optsAvailH = y + height - optsTop;
      const optGap = 11;
      const optH = Phaser.Math.Clamp(Math.floor((optsAvailH - optGap * 3) / 4), 52, 86);
      const optLabels = ['A', 'B', 'C', 'D'];

      activeEntry.options.forEach((optVocab, idx) => {
        const oy = optsTop + Math.round(optH / 2) + idx * (optH + optGap);
        const cont = s.add.container(cx, oy);
        const bg = s.add.graphics();
        s.paintGlossyGlass(bg, width, optH, 'normal');

        const letterTxt = s.add
          .text(-width / 2 + 24, 0, optLabels[idx], {
            fontFamily: FONT_MONO,
            fontSize: '14px',
            fontStyle: 'bold',
            color: '#7dd3fc',
          })
          .setOrigin(0.5);

        // Display candidate kana big & bold (the characters that will fill the selected crossword line!)
        const kanaTxt = s.add
          .text(0, 0, optVocab.kana, {
            fontFamily: FONT_JP,
            fontSize: `${Math.min(30, Math.max(20, Math.floor(optH * 0.44)))}px`,
            fontStyle: 'bold',
            color: '#fde047',
          })
          .setOrigin(0.5);
        fitSingleLineText(kanaTxt, width - 90);

        const hit = s.add
          .zone(0, 0, width, optH)
          .setOrigin(0.5)
          .setInteractive({ useHandCursor: true });

        const optObj = {
          vocab: optVocab,
          container: cont,
          bg,
          width,
          height: optH,
          baseX: cx,
          baseY: oy,
          disabled: false,
        };

        hit.on('pointerover', () => {
          if (!s.isPlaying || this.locked || optObj.disabled) return;
          s.paintGlossyGlass(bg, width, optH, 'hover');
          s.tweens.add({ targets: cont, scale: 1.02, duration: 80 });
        });
        hit.on('pointerout', () => {
          if (optObj.disabled) return;
          s.paintGlossyGlass(bg, width, optH, 'normal');
          s.tweens.add({ targets: cont, scale: 1, duration: 80 });
        });
        hit.on('pointerdown', (pointer) => {
          if (!s.isPrimaryPointer(pointer) || !s.isPlaying || this.locked || optObj.disabled) return;
          this.handleAnswerPick(optObj, activeEntry);
        });

        cont.add([bg, letterTxt, kanaTxt, hit]);
        s.boardLayer.add(cont);
        this.optionCards.push(optObj);
      });
    }

    handleAnswerPick(optObj, entry) {
      const s = this.scene;
      const board = this.getCurrentBoard();
      if (!board || !entry) return;

      if (optObj.vocab.kana === entry.vocab.kana) {
        this.locked = true;
        entry.solved = true;
        s.paintGlossyGlass(optObj.bg, optObj.width, optObj.height, 'success');
        s.awardCorrect(optObj.baseX, optObj.baseY, 10);

        // Reveal all cells along the selected line with emerald glow + particles
        entry.cells.forEach((cellInfo, i) => {
          const cellObj = board.cells[cellInfo.r][cellInfo.c];
          cellObj.revealed = true;
          const visual = this.cellGraphicsMap.get(`${cellInfo.r},${cellInfo.c}`);
          if (visual) {
            s.scheduleCall(i * 55, () => {
              if (!visual.container || !visual.container.active) return;
              this.paintCrosswordCell(visual.bg, visual.cellSize, true, false);
              visual.charTxt.setText(cellInfo.ch);
              s.tweens.add({
                targets: visual.container,
                scale: 1.18,
                duration: 120,
                yoyo: true,
                ease: 'Back.easeOut',
              });
              s.spawnGreenBurst(visual.cx, visual.cy, visual.cellSize * 0.45);
            });
          }
        });

        const revealDelay = Math.max(420, entry.cells.length * 60 + 260);
        s.scheduleCall(revealDelay, () => {
          if (!s.isPlaying) return;
          const nextUnsolved = board.entries.find((e) => !e.solved);
          if (nextUnsolved) {
            this.selectedEntryId = nextUnsolved.id;
            this.locked = false;
            this.renderBoard();
          } else {
            s.boardsCompleted += 1;
            const nextBoardIdx = this.boardIndex + 1;
            if (nextBoardIdx >= this.boards.length) {
              s.finishModeSession('completed');
            } else {
              s.showTransitionBanner(
                `Crossword ${this.boardIndex + 1} Cleared!`,
                `Loading Crossword ${nextBoardIdx + 1} of ${this.boards.length}...`
              );
              s.scheduleCall(820, () => {
                if (s.isPlaying) this.loadBoard(nextBoardIdx);
              });
            }
          }
        });
      } else {
        optObj.disabled = true;
        s.paintGlossyGlass(optObj.bg, optObj.width, optObj.height, 'error');
        s.shakeCard(optObj.container, optObj.baseX);
        s.recordMistake(optObj.baseX, optObj.baseY - optObj.height / 2 - 10, '✗ Wrong');
        s.scheduleCall(480, () => {
          if (!optObj.container || !optObj.container.active) return;
          optObj.disabled = false;
          optObj.container.x = optObj.baseX;
          s.paintGlossyGlass(optObj.bg, optObj.width, optObj.height, 'normal');
        });
      }
    }

    handleResize() {
      if (this.scene.isPlaying) this.renderBoard();
    }

    destroy() {
      this.cellGraphicsMap.clear();
      this.optionCards = [];
    }
  }

  /* ==========================================================================
     3. WORDSEARCH CONTROLLER
     Touch/drag or two-tap along a horizontal or vertical line to find words.
     ========================================================================== */
  class WordsearchController {
    constructor(scene, sessionData) {
      this.scene = scene;
      this.boards = sessionData.boards || [];
      this.boardIndex = 0;

      this.cellVisuals = [];
      this.foundCellSet = new Set();
      this.gridMetrics = null;

      this.isDragging = false;
      this.dragStartCell = null;
      this.dragEndCell = null;
      this.tapAnchorCell = null;
      this.selectionGraphics = null;
      this.wordListVisuals = [];

      this._onPointerMove = null;
      this._onPointerUp = null;
    }

    start() {
      const s = this.scene;
      s.boards = this.boards;
      s.totalPairs = this.boards.reduce((sum, b) => sum + b.words.length, 0);

      this._onPointerMove = (pointer) => this.handlePointerMove(pointer);
      this._onPointerUp = (pointer) => this.handlePointerUp(pointer);
      s.input.on('pointermove', this._onPointerMove);
      s.input.on('pointerup', this._onPointerUp);

      this.loadBoard(0);
    }

    loadBoard(idx) {
      this.scene.hideTransitionBanner();
      this.boardIndex = idx;
      this.locked = false;
      this.foundCellSet.clear();
      this.isDragging = false;
      this.dragStartCell = null;
      this.dragEndCell = null;
      this.tapAnchorCell = null;

      if (!this.boards[idx]) {
        this.scene.finishModeSession('completed');
        return;
      }
      this.renderBoard();
    }

    getCurrentBoard() {
      return this.boards[this.boardIndex];
    }

    renderBoard() {
      const s = this.scene;
      const board = this.getCurrentBoard();
      if (!board) return;

      s.boardLayer.removeAll(true);
      this.cellVisuals = [];
      this.wordListVisuals = [];

      const m = s.getLayoutMetrics();
      s.setProgressText(
        `Board ${this.boardIndex + 1}/${this.boards.length}  •  Found: ${s.pairsMatched}/${s.totalPairs}`
      );
      s.notifyBoardChange(`WORDSEARCH ${this.boardIndex + 1} / ${this.boards.length}`);

      const pad = 22;
      const gap = 22;
      const leftW = Math.floor((m.trayW - pad * 2 - gap) * 0.60);
      const rightW = m.trayW - pad * 2 - gap - leftW;
      const leftX = m.trayX + pad;
      const rightX = leftX + leftW + gap;
      const innerTop = m.trayY + pad;
      const innerH = m.trayH - pad * 2;

      // Grid backdrop
      const gridPanel = s.add.graphics();
      gridPanel.fillStyle(0x031742, 0.65);
      gridPanel.fillRoundedRect(leftX, innerTop, leftW, innerH, 16);
      gridPanel.lineStyle(1.5, 0x60a5fa, 0.3);
      gridPanel.strokeRoundedRect(leftX, innerTop, leftW, innerH, 16);
      s.boardLayer.add(gridPanel);

      const hintTxt = s.add
        .text(
          leftX + Math.round(leftW / 2),
          innerTop + 18,
          'Touch & drag (or tap start → end) along a horizontal or vertical line',
          {
            fontFamily: FONT_UI,
            fontSize: '13px',
            fontStyle: '600',
            color: '#93c5fd',
          }
        )
        .setOrigin(0.5);
      s.boardLayer.add(hintTxt);

      const size = board.size;
      const cellGap = 5;
      const maxGridW = leftW - 32;
      const maxGridH = innerH - 56;
      const cellSize = Phaser.Math.Clamp(
        Math.floor((Math.min(maxGridW, maxGridH) - (size - 1) * cellGap) / size),
        32,
        62
      );
      const totalGridPx = size * cellSize + (size - 1) * cellGap;
      const startX = leftX + Math.round((leftW - totalGridPx) / 2);
      const startY = innerTop + 34 + Math.round((innerH - 38 - totalGridPx) / 2);

      this.gridMetrics = { size, cellSize, cellGap, startX, startY };

      // Rebuild foundCellSet from already-found words (important on resize)
      this.foundCellSet.clear();
      for (const w of board.words) {
        if (w.found) {
          for (const c of w.cells) this.foundCellSet.add(`${c.r},${c.c}`);
        }
      }

      // Cell matrix visuals
      this.cellVisuals = Array.from({ length: size }, () => Array(size).fill(null));
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const cx = startX + c * (cellSize + cellGap) + Math.round(cellSize / 2);
          const cy = startY + r * (cellSize + cellGap) + Math.round(cellSize / 2);

          const cont = s.add.container(cx, cy);
          const bg = s.add.graphics();
          const isFound = this.foundCellSet.has(`${r},${c}`);
          this.paintSearchCell(bg, cellSize, isFound ? 'found' : 'normal');

          const chTxt = s.add
            .text(0, 0, board.grid[r][c], {
              fontFamily: FONT_JP,
              fontSize: `${Math.round(cellSize * 0.52)}px`,
              fontStyle: 'bold',
              color: isFound ? '#ffffff' : '#f8fafc',
            })
            .setOrigin(0.5);

          const hit = s.add
            .zone(0, 0, cellSize, cellSize)
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });

          hit.on('pointerdown', (pointer) => {
            if (!s.isPrimaryPointer(pointer) || !s.isPlaying || this.locked) return;
            this.handleCellPointerDown(r, c);
          });

          cont.add([bg, chTxt, hit]);
          s.boardLayer.add(cont);
          this.cellVisuals[r][c] = { r, c, cx, cy, container: cont, bg, chTxt };
        }
      }

      // Live selection highlight line overlay
      this.selectionGraphics = s.add.graphics();
      s.boardLayer.add(this.selectionGraphics);

      // --- RIGHT SIDE: TARGET WORDS LIST ---
      this.renderWordBank(rightX, innerTop, rightW, innerH, board);
    }

    paintSearchCell(g, size, state) {
      g.clear();
      const half = size / 2;
      const rad = Math.max(6, Math.round(size * 0.16));

      if (state === 'found') {
        g.fillStyle(0x059669, 0.96);
        g.fillRoundedRect(-half, -half, size, size, rad);
        g.fillStyle(0xffffff, 0.16);
        g.fillRoundedRect(-half + 3, -half + 3, size - 6, Math.round(size * 0.4), rad - 2);
        g.lineStyle(2, 0x6ee7b7, 0.95);
        g.strokeRoundedRect(-half, -half, size, size, rad);
      } else if (state === 'selected') {
        g.fillStyle(0xd97706, 0.95);
        g.fillRoundedRect(-half, -half, size, size, rad);
        g.lineStyle(2.5, 0xfde047, 1);
        g.strokeRoundedRect(-half, -half, size, size, rad);
      } else if (state === 'error') {
        g.fillStyle(0xdc2626, 0.96);
        g.fillRoundedRect(-half, -half, size, size, rad);
        g.lineStyle(2.5, 0xfca5a5, 1);
        g.strokeRoundedRect(-half, -half, size, size, rad);
      } else {
        g.fillStyle(0x0a2458, 0.94);
        g.fillRoundedRect(-half, -half, size, size, rad);
        g.fillStyle(0xffffff, 0.08);
        g.fillRoundedRect(-half + 3, -half + 3, size - 6, Math.round(size * 0.38), rad - 2);
        g.lineStyle(1.4, 0x60a5fa, 0.45);
        g.strokeRoundedRect(-half, -half, size, size, rad);
      }
    }

    renderWordBank(x, y, width, height, board) {
      const s = this.scene;
      const cfg = s.config;

      const panelBg = s.add.graphics();
      panelBg.fillStyle(0x031742, 0.72);
      panelBg.fillRoundedRect(x, y, width, height, 16);
      panelBg.lineStyle(1.5, 0x60a5fa, 0.35);
      panelBg.strokeRoundedRect(x, y, width, height, 16);
      s.boardLayer.add(panelBg);

      const titleTxt = s.add
        .text(x + 18, y + 14, `HIDDEN WORDS (${board.words.filter((w) => w.found).length}/${board.words.length})`, {
          fontFamily: FONT_MONO,
          fontSize: '13px',
          fontStyle: 'bold',
          color: '#fde047',
          letterSpacing: 1,
        })
        .setOrigin(0, 0);
      s.boardLayer.add(titleTxt);

      const listTop = y + 44;
      const availH = height - 56;
      const itemGap = 10;
      const count = Math.max(1, board.words.length);
      const itemH = Phaser.Math.Clamp(Math.floor((availH - itemGap * (count - 1)) / count), 54, 92);

      board.words.forEach((w, idx) => {
        const iy = listTop + Math.round(itemH / 2) + idx * (itemH + itemGap);
        const ix = x + Math.round(width / 2);
        const cardW = width - 28;

        const cont = s.add.container(ix, iy);
        const bg = s.add.graphics();
        s.paintGlossyGlass(bg, cardW, itemH, w.found ? 'success' : 'normal');

        const statusTxt = s.add
          .text(-cardW / 2 + 18, 0, w.found ? '✓' : `${w.chars.length}`, {
            fontFamily: FONT_MONO,
            fontSize: w.found ? '18px' : '13px',
            fontStyle: 'bold',
            color: w.found ? '#86efac' : '#7dd3fc',
          })
          .setOrigin(0.5);

        // Build clue text for this hidden word
        const textX = -cardW / 2 + 38;
        const maxTxtW = cardW - 52;
        let primaryLabel = '';
        if (w.found) {
          primaryLabel = w.vocab.hasKanji ? `${w.vocab.word} (${w.vocab.kana})` : w.vocab.kana;
        } else if (w.vocab.hasKanji) {
          primaryLabel = w.vocab.word;
        } else if (cfg.showRomaji) {
          primaryLabel = w.vocab.romaji;
        } else {
          primaryLabel = `${w.chars.length}-kana word`;
        }

        const primaryTxt = s.add
          .text(textX, -Math.round(itemH * 0.17), primaryLabel, {
            fontFamily: w.vocab.hasKanji || w.found ? FONT_JP : FONT_MONO,
            fontSize: `${Math.min(22, Math.max(16, Math.floor(itemH * 0.30)))}px`,
            fontStyle: 'bold',
            color: w.found ? '#d1fae5' : '#fde047',
          })
          .setOrigin(0, 0.5);
        fitSingleLineText(primaryTxt, maxTxtW);

        // Secondary line: Romaji + Definition
        const secParts = [];
        if (cfg.showRomaji && (w.vocab.hasKanji || w.found)) {
          secParts.push(w.vocab.romaji);
        }
        if (cfg.showDefinition || secParts.length === 0) {
          secParts.push(w.vocab.definition);
        }
        const secondaryStr = secParts.filter(Boolean).join(' — ');
        const secTxt = s.add
          .text(textX, Math.round(itemH * 0.21), '', {
            fontFamily: FONT_UI,
            fontSize: '12px',
            fontStyle: '600',
            color: w.found ? '#a7f3d0' : '#dbeafe',
            wordWrap: { width: maxTxtW, useAdvancedWrap: true },
          })
          .setOrigin(0, 0.5);
        s.fitWrappedText(secTxt, secondaryStr, Math.max(18, Math.round(itemH * 0.36)));

        cont.add([bg, statusTxt, primaryTxt, secTxt]);
        s.boardLayer.add(cont);
        this.wordListVisuals.push({ wordObj: w, container: cont, bg });
      });
    }

    getCellAtPoint(px, py) {
      if (!this.gridMetrics) return null;
      const { size, cellSize, cellGap, startX, startY } = this.gridMetrics;
      const pitch = cellSize + cellGap;
      const col = Math.floor((px - startX) / pitch);
      const row = Math.floor((py - startY) / pitch);
      if (row < 0 || row >= size || col < 0 || col >= size) return null;
      return { r: row, c: col };
    }

    snapLineCells(start, end) {
      if (!start || !end) return [];
      const dr = end.r - start.r;
      const dc = end.c - start.c;
      const cells = [];

      if (Math.abs(dc) >= Math.abs(dr)) {
        // Horizontal line
        const step = dc >= 0 ? 1 : -1;
        for (let c = start.c; step > 0 ? c <= end.c : c >= end.c; c += step) {
          cells.push({ r: start.r, c });
        }
      } else {
        // Vertical line
        const step = dr >= 0 ? 1 : -1;
        for (let r = start.r; step > 0 ? r <= end.r : r >= end.r; r += step) {
          cells.push({ r, c: start.c });
        }
      }
      return cells;
    }

    redrawSelectionHighlight(lineCells) {
      if (!this.gridMetrics) return;
      const { size, cellSize } = this.gridMetrics;
      const selectedSet = new Set(lineCells.map((c) => `${c.r},${c.c}`));

      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const vis = this.cellVisuals[r] && this.cellVisuals[r][c];
          if (!vis) continue;
          const k = `${r},${c}`;
          if (selectedSet.has(k)) {
            this.paintSearchCell(vis.bg, cellSize, 'selected');
          } else if (this.foundCellSet.has(k)) {
            this.paintSearchCell(vis.bg, cellSize, 'found');
          } else {
            this.paintSearchCell(vis.bg, cellSize, 'normal');
          }
        }
      }

      if (this.selectionGraphics) {
        this.selectionGraphics.clear();
        if (lineCells.length >= 2) {
          const first = this.cellVisuals[lineCells[0].r][lineCells[0].c];
          const last = this.cellVisuals[lineCells[lineCells.length - 1].r][lineCells[lineCells.length - 1].c];
          this.selectionGraphics.lineStyle(6, 0xfde047, 0.55);
          this.selectionGraphics.lineBetween(first.cx, first.cy, last.cx, last.cy);
        }
      }
    }

    handleCellPointerDown(r, c) {
      // Two-tap line completion if tapAnchorCell is active on the same row or column
      if (this.tapAnchorCell) {
        if (this.tapAnchorCell.r === r && this.tapAnchorCell.c === c) {
          this.tapAnchorCell = null;
          this.redrawSelectionHighlight([]);
          return;
        }
        if (this.tapAnchorCell.r === r || this.tapAnchorCell.c === c) {
          const line = this.snapLineCells(this.tapAnchorCell, { r, c });
          this.tapAnchorCell = null;
          this.evaluateSelectedLine(line);
          return;
        }
      }

      this.isDragging = true;
      this.dragStartCell = { r, c };
      this.dragEndCell = { r, c };
      this.redrawSelectionHighlight([{ r, c }]);
    }

    handlePointerMove(pointer) {
      if (!this.isDragging || !pointer.isDown || !this.scene.isPlaying) return;
      const cell = this.getCellAtPoint(pointer.x, pointer.y);
      if (!cell) return;
      this.dragEndCell = cell;
      const line = this.snapLineCells(this.dragStartCell, this.dragEndCell);
      this.redrawSelectionHighlight(line);
    }

    handlePointerUp() {
      if (!this.isDragging) return;
      this.isDragging = false;
      const line = this.snapLineCells(this.dragStartCell, this.dragEndCell);
      this.dragStartCell = null;
      this.dragEndCell = null;

      if (line.length <= 1) {
        // Single tap: hold as start anchor for two-tap horizontal/vertical selection
        this.tapAnchorCell = line[0] || null;
        this.redrawSelectionHighlight(line);
        return;
      }

      this.tapAnchorCell = null;
      this.evaluateSelectedLine(line);
    }

    evaluateSelectedLine(lineCells) {
      const s = this.scene;
      const board = this.getCurrentBoard();
      if (!board || lineCells.length < 2) {
        this.redrawSelectionHighlight([]);
        return;
      }

      const fwdChars = lineCells.map((c) => board.grid[c.r][c.c]).join('');
      const revChars = Array.from(fwdChars).reverse().join('');

      const matchedWord = board.words.find(
        (w) => !w.found && (w.vocab.kana === fwdChars || w.vocab.kana === revChars)
      );

      if (matchedWord) {
        matchedWord.found = true;
        for (const c of lineCells) {
          this.foundCellSet.add(`${c.r},${c.c}`);
          const vis = this.cellVisuals[c.r][c.c];
          if (vis) {
            this.paintSearchCell(vis.bg, this.gridMetrics.cellSize, 'found');
            s.spawnGreenBurst(vis.cx, vis.cy, this.gridMetrics.cellSize * 0.42);
            s.tweens.add({ targets: vis.container, scale: 1.16, duration: 120, yoyo: true });
          }
        }
        if (this.selectionGraphics) this.selectionGraphics.clear();

        const midCell = lineCells[Math.floor(lineCells.length / 2)];
        const midVis = this.cellVisuals[midCell.r][midCell.c];
        s.awardCorrect(midVis.cx, midVis.cy, 10);

        // Refresh side word bank + check board completion
        const allFound = board.words.every((w) => w.found);
        if (allFound) {
          this.locked = true;
          s.boardsCompleted += 1;
          const nextIdx = this.boardIndex + 1;
          if (nextIdx >= this.boards.length) {
            s.scheduleCall(480, () => {
              if (s.isPlaying) s.finishModeSession('completed');
            });
          } else {
            s.showTransitionBanner(
              `Wordsearch ${this.boardIndex + 1} Cleared!`,
              `Loading Board ${nextIdx + 1} of ${this.boards.length}...`
            );
            s.scheduleCall(820, () => {
              if (s.isPlaying) this.loadBoard(nextIdx);
            });
          }
        } else {
          this.renderBoard();
        }
      } else {
        // Flash red and shake the wrongly selected line
        for (const c of lineCells) {
          const vis = this.cellVisuals[c.r][c.c];
          if (vis) {
            this.paintSearchCell(vis.bg, this.gridMetrics.cellSize, 'error');
            s.shakeCard(vis.container, vis.cx);
          }
        }
        const mid = lineCells[Math.floor(lineCells.length / 2)];
        const midVis = this.cellVisuals[mid.r][mid.c];
        s.recordMistake(midVis.cx, midVis.cy - 24, '✗ Not a target word');

        s.scheduleCall(450, () => {
          if (s.isPlaying) this.redrawSelectionHighlight([]);
        });
      }
    }

    handleResize() {
      if (this.scene.isPlaying) this.renderBoard();
    }

    destroy() {
      const s = this.scene;
      if (this._onPointerMove) s.input.off('pointermove', this._onPointerMove);
      if (this._onPointerUp) s.input.off('pointerup', this._onPointerUp);
      this.cellVisuals = [];
      this.wordListVisuals = [];
    }
  }

  /* ==========================================================================
     4. JUMBLE WORDS CONTROLLER
     Drag-and-drop glossy character tiles to reorder and spell the Japanese word.
     ========================================================================== */
  class JumbleController {
    constructor(scene, sessionData) {
      this.scene = scene;
      this.items = sessionData.items || [];
      this.index = 0;
      this.tiles = [];
      this.slots = [];
      this.locked = false;
      this.tapSelectedTile = null;

      this._onDragStart = null;
      this._onDrag = null;
      this._onDragEnd = null;
    }

    start() {
      const s = this.scene;
      s.totalPairs = this.items.length;
      s.boards = [this.items];

      this._onDragStart = (_pointer, obj) => this.handleDragStart(obj);
      this._onDrag = (_pointer, obj, dragX, dragY) => this.handleDrag(obj, dragX, dragY);
      this._onDragEnd = (_pointer, obj) => this.handleDragEnd(obj);

      s.input.on('dragstart', this._onDragStart);
      s.input.on('drag', this._onDrag);
      s.input.on('dragend', this._onDragEnd);

      this.renderWord();
    }

    renderWord() {
      const s = this.scene;
      s.boardLayer.removeAll(true);
      this.tiles = [];
      this.slots = [];
      this.locked = false;
      this.tapSelectedTile = null;

      if (this.index >= this.items.length) {
        s.boardsCompleted = 1;
        s.finishModeSession('completed');
        return;
      }

      const item = this.items[this.index];
      const m = s.getLayoutMetrics();
      const cfg = s.config;

      s.setProgressText(`Word ${this.index + 1} / ${this.items.length}`);
      s.notifyBoardChange(`JUMBLE ${this.index + 1} / ${this.items.length}`);

      // --- PROMPT CLUE CARD (Upper Centre) ---
      const promptW = Math.min(680, m.trayW - 60);
      const promptH = Phaser.Math.Clamp(Math.floor(m.trayH * 0.34), 134, 210);
      const promptX = m.centerX;
      const promptY = m.trayY + 26 + Math.round(promptH / 2);

      const promptBg = s.add.graphics().setPosition(promptX, promptY);
      s.paintGlossyGlass(promptBg, promptW, promptH, 'normal');
      s.boardLayer.add(promptBg);

      const lvlColor = LEVEL_COLORS[item.vocab.level] || 0x8b5cf6;
      const badgeG = s.add.graphics();
      const bx = promptX + promptW / 2 - 30;
      const by = promptY - promptH / 2 + 22;
      badgeG.fillStyle(0x0f172a, 0.55);
      badgeG.fillRoundedRect(bx - 18, by - 11, 36, 22, 7);
      badgeG.lineStyle(1.4, lvlColor, 0.95);
      badgeG.strokeRoundedRect(bx - 18, by - 11, 36, 22, 7);
      const badgeTxt = s.add
        .text(bx, by, `N${item.vocab.level}`, {
          fontFamily: FONT_UI,
          fontSize: '12px',
          fontStyle: 'bold',
          color: '#ffffff',
        })
        .setOrigin(0.5);
      s.boardLayer.add([badgeG, badgeTxt]);

      const innerW = promptW - 48;
      if (item.vocab.hasKanji) {
        const kanjiTxt = s.add
          .text(promptX, promptY - Math.round(promptH * 0.14), item.vocab.word, {
            fontFamily: FONT_JP,
            fontSize: `${Math.min(54, Math.max(34, Math.floor(promptH * 0.34)))}px`,
            fontStyle: 'bold',
            color: '#ffffff',
            stroke: '#0f172a',
            strokeThickness: 4,
          })
          .setOrigin(0.5);
        fitSingleLineText(kanjiTxt, innerW);
        s.boardLayer.add(kanjiTxt);

        const hintParts = [];
        if (cfg.showRomaji && cfg.answerReading !== 'kana') hintParts.push(item.vocab.romaji);
        if (cfg.showDefinition || hintParts.length === 0) hintParts.push(item.vocab.definition);

        const subTxt = s.add
          .text(promptX, promptY + Math.round(promptH * 0.26), '', {
            fontFamily: FONT_UI,
            fontSize: '15px',
            fontStyle: '600',
            color: '#bae6fd',
            align: 'center',
            wordWrap: { width: innerW, useAdvancedWrap: true },
          })
          .setOrigin(0.5);
        s.fitWrappedText(subTxt, hintParts.filter(Boolean).join('  •  '), Math.max(36, Math.round(promptH * 0.34)));
        s.boardLayer.add(subTxt);
      } else {
        // Pure-kana word: show Romaji and/or Definition (never print raw kana on the prompt)
        const showRom = Boolean(cfg.showRomaji);
        const showDef = Boolean(cfg.showDefinition || !showRom);

        if (showRom && showDef) {
          const romTxt = s.add
            .text(promptX, promptY - Math.round(promptH * 0.16), item.vocab.romaji, {
              fontFamily: FONT_MONO,
              fontSize: '34px',
              fontStyle: 'bold',
              color: '#fde047',
            })
            .setOrigin(0.5);
          fitSingleLineText(romTxt, innerW);

          const defTxt = s.add
            .text(promptX, promptY + Math.round(promptH * 0.24), '', {
              fontFamily: FONT_UI,
              fontSize: '15px',
              fontStyle: '600',
              color: '#f1f5f9',
              align: 'center',
              wordWrap: { width: innerW, useAdvancedWrap: true },
            })
            .setOrigin(0.5);
          s.fitWrappedText(defTxt, item.vocab.definition || '—', Math.max(40, Math.round(promptH * 0.38)));
          s.boardLayer.add([romTxt, defTxt]);
        } else if (showRom) {
          const romTxt = s.add
            .text(promptX, promptY, item.vocab.romaji, {
              fontFamily: FONT_MONO,
              fontSize: '40px',
              fontStyle: 'bold',
              color: '#fde047',
            })
            .setOrigin(0.5);
          fitSingleLineText(romTxt, innerW);
          s.boardLayer.add(romTxt);
        } else {
          const defTxt = s.add
            .text(promptX, promptY, '', {
              fontFamily: FONT_UI,
              fontSize: '18px',
              fontStyle: '700',
              color: '#f1f5f9',
              align: 'center',
              wordWrap: { width: innerW, useAdvancedWrap: true },
            })
            .setOrigin(0.5);
          s.fitWrappedText(defTxt, item.vocab.definition || '—', Math.max(60, Math.round(promptH * 0.64)));
          s.boardLayer.add(defTxt);
        }
      }

      // --- DRAGGABLE GLOSSY CHARACTER TILES ---
      const chars = item.scrambledChars;
      const count = chars.length;
      const tileGap = 14;
      const maxRowW = Math.min(980, m.trayW - 60);
      const tileSize = Phaser.Math.Clamp(
        Math.floor((maxRowW - (count - 1) * tileGap) / count),
        64,
        118
      );
      const rowW = count * tileSize + (count - 1) * tileGap;
      const startX = m.centerX - Math.round(rowW / 2) + Math.round(tileSize / 2);
      const tileY = promptY + Math.round(promptH / 2) + Math.max(82, Math.round((m.trayY + m.trayH - (promptY + promptH / 2)) * 0.42));

      const helperTxt = s.add
        .text(m.centerX, tileY - Math.round(tileSize / 2) - 24, 'Drag & drop tiles left or right to reorder (or tap two tiles to swap)', {
          fontFamily: FONT_UI,
          fontSize: '13.5px',
          fontStyle: '600',
          color: '#93c5fd',
        })
        .setOrigin(0.5);
      s.boardLayer.add(helperTxt);

      // Draw drop slot guides underneath tiles
      this.slots = [];
      for (let i = 0; i < count; i++) {
        const sx = startX + i * (tileSize + tileGap);
        const slotG = s.add.graphics();
        slotG.fillStyle(0x031742, 0.58);
        slotG.fillRoundedRect(sx - tileSize / 2 - 2, tileY - tileSize / 2 - 2, tileSize + 4, tileSize + 4, 16);
        slotG.lineStyle(1.5, 0x60a5fa, 0.35);
        slotG.strokeRoundedRect(sx - tileSize / 2 - 2, tileY - tileSize / 2 - 2, tileSize + 4, tileSize + 4, 16);
        const numTxt = s.add
          .text(sx, tileY + tileSize / 2 + 16, String(i + 1), {
            fontFamily: FONT_MONO,
            fontSize: '12px',
            fontStyle: 'bold',
            color: '#60a5fa',
          })
          .setOrigin(0.5);
        s.boardLayer.add([slotG, numTxt]);
        this.slots.push({ index: i, x: sx, y: tileY });
      }

      // Create draggable tiles
      this.tiles = [];
      chars.forEach((ch, idx) => {
        const slot = this.slots[idx];
        const colorHex = BLOCK_PALETTE[(this.index * 3 + idx) % BLOCK_PALETTE.length];
        const light = isLightColor(colorHex);

        const cont = s.add.container(slot.x, slot.y);
        cont.setSize(tileSize, tileSize);
        cont.setDepth(12);

        const bg = s.add.graphics();
        s.paintGlossyBlock(bg, tileSize, tileSize, colorHex, 'normal');

        const label = s.add
          .text(0, -1, ch, {
            fontFamily: FONT_JP,
            fontSize: `${Math.round(tileSize * 0.52)}px`,
            fontStyle: 'bold',
            color: light ? '#1e1b4b' : '#ffffff',
            stroke: light ? '#fef9c3' : '#0f172a',
            strokeThickness: light ? 1 : 3,
          })
          .setOrigin(0.5);

        cont.add([bg, label]);
        cont.setInteractive({ draggable: true, useHandCursor: true });
        s.input.setDraggable(cont);

        const tileObj = {
          char: ch,
          slotIndex: idx,
          size: tileSize,
          colorHex,
          isLight: light,
          container: cont,
          bg,
          label,
          dragOriginX: slot.x,
          dragOriginY: slot.y,
          dragMoved: false,
        };
        cont.setData('tileObj', tileObj);

        s.boardLayer.add(cont);
        this.tiles.push(tileObj);

        cont.setScale(0.7).setAlpha(0);
        s.tweens.add({
          targets: cont,
          scale: 1,
          alpha: 1,
          duration: 210,
          delay: idx * 35,
          ease: 'Back.easeOut',
        });
      });

      // --- ACTION BUTTONS (Check Order & Shuffle) ---
      const btnY = Math.min(m.trayY + m.trayH - 36, tileY + tileSize / 2 + 60);
      this.createActionButton(m.centerX - 96, btnY, 164, 42, 'Check Order', 0x10b981, () => {
        if (!this.locked) this.evaluateOrder(true);
      });
      this.createActionButton(m.centerX + 96, btnY, 148, 42, 'Shuffle ↻', 0x3b82f6, () => {
        if (!this.locked) this.shuffleCurrentTiles();
      });
    }

    createActionButton(x, y, w, h, text, accentHex, onClick) {
      const s = this.scene;
      const cont = s.add.container(x, y);
      const bg = s.add.graphics();
      const paint = (hover) => {
        bg.clear();
        bg.fillStyle(accentHex, hover ? 1 : 0.85);
        bg.fillRoundedRect(-w / 2, -h / 2, w, h, 11);
        bg.fillStyle(0xffffff, 0.22);
        bg.fillRoundedRect(-w / 2 + 6, -h / 2 + 4, w - 12, Math.round(h * 0.36), 6);
        bg.lineStyle(1.8, 0xffffff, hover ? 0.95 : 0.45);
        bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 11);
      };
      paint(false);

      const lbl = s.add
        .text(0, 0, text, {
          fontFamily: FONT_UI,
          fontSize: '15px',
          fontStyle: 'bold',
          color: '#ffffff',
        })
        .setOrigin(0.5);

      const hit = s.add.zone(0, 0, w, h).setOrigin(0.5).setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => paint(true));
      hit.on('pointerout', () => paint(false));
      hit.on('pointerdown', (pointer) => {
        if (!s.isPrimaryPointer(pointer) || !s.isPlaying) return;
        onClick();
      });

      cont.add([bg, lbl, hit]);
      s.boardLayer.add(cont);
    }

    handleDragStart(gameObject) {
      const tile = gameObject && gameObject.getData('tileObj');
      if (!tile || this.locked || !this.scene.isPlaying) return;

      tile.dragOriginX = tile.container.x;
      tile.dragOriginY = tile.container.y;
      tile.dragMoved = false;
      tile.container.setDepth(30);
      this.scene.paintGlossyBlock(tile.bg, tile.size, tile.size, tile.colorHex, 'selected');
      this.scene.tweens.killTweensOf(tile.container);
      this.scene.tweens.add({ targets: tile.container, scale: 1.09, duration: 90 });
    }

    handleDrag(gameObject, dragX, dragY) {
      const tile = gameObject && gameObject.getData('tileObj');
      if (!tile || this.locked || !this.scene.isPlaying) return;

      tile.container.x = dragX;
      tile.container.y = dragY;

      if (Math.hypot(dragX - tile.dragOriginX, dragY - tile.dragOriginY) > 10) {
        tile.dragMoved = true;
      }

      // Live slot reordering as tile drags past neighbouring slot centres
      let nearestIdx = tile.slotIndex;
      let bestDist = Infinity;
      for (const slot of this.slots) {
        const d = Math.abs(dragX - slot.x);
        if (d < bestDist) {
          bestDist = d;
          nearestIdx = slot.index;
        }
      }

      if (nearestIdx !== tile.slotIndex) {
        const oldIdx = tile.slotIndex;
        for (const other of this.tiles) {
          if (other === tile) continue;
          if (oldIdx < nearestIdx && other.slotIndex > oldIdx && other.slotIndex <= nearestIdx) {
            other.slotIndex -= 1;
            this.snapTileToSlot(other, true);
          } else if (oldIdx > nearestIdx && other.slotIndex >= nearestIdx && other.slotIndex < oldIdx) {
            other.slotIndex += 1;
            this.snapTileToSlot(other, true);
          }
        }
        tile.slotIndex = nearestIdx;
      }
    }

    handleDragEnd(gameObject) {
      const tile = gameObject && gameObject.getData('tileObj');
      if (!tile || this.locked || !this.scene.isPlaying) return;

      tile.container.setDepth(12);

      // Tap-to-swap fallback when user clicks/taps without dragging
      if (!tile.dragMoved) {
        if (!this.tapSelectedTile) {
          this.tapSelectedTile = tile;
          this.snapTileToSlot(tile, true);
          this.scene.paintGlossyBlock(tile.bg, tile.size, tile.size, tile.colorHex, 'selected');
          this.scene.tweens.add({ targets: tile.container, scale: 1.07, duration: 90 });
          return;
        }
        if (this.tapSelectedTile === tile) {
          this.tapSelectedTile = null;
          this.scene.paintGlossyBlock(tile.bg, tile.size, tile.size, tile.colorHex, 'normal');
          this.snapTileToSlot(tile, true);
          return;
        }

        const other = this.tapSelectedTile;
        this.tapSelectedTile = null;
        const tmpIdx = other.slotIndex;
        other.slotIndex = tile.slotIndex;
        tile.slotIndex = tmpIdx;
        this.scene.paintGlossyBlock(other.bg, other.size, other.size, other.colorHex, 'normal');
        this.scene.paintGlossyBlock(tile.bg, tile.size, tile.size, tile.colorHex, 'normal');
        this.snapTileToSlot(other, true);
        this.snapTileToSlot(tile, true);
        this.evaluateOrder(false);
        return;
      }

      if (this.tapSelectedTile) {
        this.scene.paintGlossyBlock(
          this.tapSelectedTile.bg,
          this.tapSelectedTile.size,
          this.tapSelectedTile.size,
          this.tapSelectedTile.colorHex,
          'normal'
        );
        this.tapSelectedTile = null;
      }

      this.scene.paintGlossyBlock(tile.bg, tile.size, tile.size, tile.colorHex, 'normal');
      this.snapTileToSlot(tile, true);
      this.evaluateOrder(false);
    }

    snapTileToSlot(tile, animate) {
      const slot = this.slots[tile.slotIndex];
      if (!slot) return;
      this.scene.tweens.killTweensOf(tile.container);
      if (animate) {
        this.scene.tweens.add({
          targets: tile.container,
          x: slot.x,
          y: slot.y,
          scale: 1,
          duration: 130,
          ease: 'Cubic.easeOut',
        });
      } else {
        tile.container.setPosition(slot.x, slot.y).setScale(1);
      }
    }

    shuffleCurrentTiles() {
      const item = this.items[this.index];
      if (!item || this.tiles.length < 2) return;
      const targetStr = item.targetChars.join('');
      let indices = this.tiles.map((_, i) => i);
      for (let tries = 0; tries < 15; tries++) {
        indices = global.VocabLoader.shuffle(indices);
        const ordered = new Array(this.tiles.length);
        this.tiles.forEach((t, idx) => {
          ordered[indices[idx]] = t.char;
        });
        if (ordered.join('') !== targetStr) break;
      }
      this.tiles.forEach((t, idx) => {
        t.slotIndex = indices[idx];
        this.scene.paintGlossyBlock(t.bg, t.size, t.size, t.colorHex, 'normal');
        this.snapTileToSlot(t, true);
      });
    }

    evaluateOrder(penaliseIfWrong) {
      const s = this.scene;
      const item = this.items[this.index];
      if (!item) return;

      const sortedTiles = this.tiles.slice().sort((a, b) => a.slotIndex - b.slotIndex);
      const currentStr = sortedTiles.map((t) => t.char).join('');
      const targetStr = item.targetChars.join('');

      if (currentStr === targetStr) {
        this.locked = true;
        sortedTiles.forEach((t, i) => {
          t.container.disableInteractive();
          s.paintGlossyBlock(t.bg, t.size, t.size, t.colorHex, 'success');
          t.label.setColor('#ffffff').setStroke('#064e3b', 3);
          const slot = this.slots[t.slotIndex];
          s.scheduleCall(i * 45, () => {
            s.spawnGreenBurst(slot.x, slot.y, t.size * 0.45);
            s.tweens.add({
              targets: t.container,
              scale: 1.18,
              duration: 120,
              yoyo: true,
            });
          });
        });

        const midSlot = this.slots[Math.floor(this.slots.length / 2)];
        s.awardCorrect(midSlot.x, midSlot.y - 20, 10);

        s.scheduleCall(580, () => {
          if (!s.isPlaying) return;
          this.index += 1;
          this.renderWord();
        });
      } else if (penaliseIfWrong) {
        const midSlot = this.slots[Math.floor(this.slots.length / 2)];
        s.recordMistake(midSlot.x, midSlot.y - 72, '✗ Not in order yet');

        sortedTiles.forEach((t, idx) => {
          const isWrongPos = t.char !== item.targetChars[idx];
          if (isWrongPos) {
            s.paintGlossyBlock(t.bg, t.size, t.size, t.colorHex, 'error');
            t.label.setColor('#ffffff').setStroke('#7f1d1d', 3);
            s.shakeCard(t.container, this.slots[t.slotIndex].x);
          }
        });

        s.scheduleCall(520, () => {
          if (!s.isPlaying) return;
          sortedTiles.forEach((t) => {
            if (!t.container || !t.container.active) return;
            s.paintGlossyBlock(t.bg, t.size, t.size, t.colorHex, 'normal');
            t.label
              .setColor(t.isLight ? '#1e1b4b' : '#ffffff')
              .setStroke(t.isLight ? '#fef9c3' : '#0f172a', t.isLight ? 1 : 3);
            t.container.x = this.slots[t.slotIndex].x;
          });
        });
      }
    }

    handleResize() {
      if (this.scene.isPlaying) this.renderWord();
    }

    destroy() {
      const s = this.scene;
      if (this._onDragStart) s.input.off('dragstart', this._onDragStart);
      if (this._onDrag) s.input.off('drag', this._onDrag);
      if (this._onDragEnd) s.input.off('dragend', this._onDragEnd);
      this.tiles = [];
      this.slots = [];
    }
  }

  /* ==========================================================================
     5. WEAVER / WORD LADDER CONTROLLER
     Climb 1-character-difference Japanese word ladders by touching options.
     ========================================================================== */
  class WeaverController {
    constructor(scene, sessionData) {
      this.scene = scene;
      this.ladders = sessionData.ladders || [];
      this.ladderIndex = 0;
      this.stepIndex = 0; // 0 .. ladder.steps.length - 1
      this.locked = false;
    }

    start() {
      const s = this.scene;
      s.boards = this.ladders;
      s.totalPairs = this.ladders.reduce((sum, l) => sum + l.steps.length, 0);
      this.loadLadder(0);
    }

    loadLadder(idx) {
      this.scene.hideTransitionBanner();
      this.ladderIndex = idx;
      this.stepIndex = 0;
      this.locked = false;
      if (!this.ladders[idx]) {
        this.scene.finishModeSession('completed');
        return;
      }
      this.renderLadder();
    }

    renderLadder() {
      const s = this.scene;
      const ladder = this.ladders[this.ladderIndex];
      if (!ladder) return;

      s.boardLayer.removeAll(true);
      const m = s.getLayoutMetrics();
      const cfg = s.config;
      const activeStep = ladder.steps[this.stepIndex];

      s.setProgressText(
        `Ladder ${this.ladderIndex + 1}/${this.ladders.length}  •  Steps: ${s.pairsMatched}/${s.totalPairs}`
      );
      s.notifyBoardChange(`WEAVER ${this.ladderIndex + 1} / ${this.ladders.length}`);

      const pad = 22;
      const gap = 22;
      const leftW = Math.floor((m.trayW - pad * 2 - gap) * 0.48);
      const rightW = m.trayW - pad * 2 - gap - leftW;
      const leftX = m.trayX + pad;
      const rightX = leftX + leftW + gap;
      const innerTop = m.trayY + pad;
      const innerH = m.trayH - pad * 2;

      // --- LEFT: VERTICAL WORD LADDER ---
      const ladderPanel = s.add.graphics();
      ladderPanel.fillStyle(0x031742, 0.65);
      ladderPanel.fillRoundedRect(leftX, innerTop, leftW, innerH, 16);
      ladderPanel.lineStyle(1.5, 0x60a5fa, 0.3);
      ladderPanel.strokeRoundedRect(leftX, innerTop, leftW, innerH, 16);
      s.boardLayer.add(ladderPanel);

      const rungCount = ladder.pathItems.length; // e.g., 3 or 4 rungs (Start -> Step1 -> [Step2] -> Goal)
      const arrowGap = 24;
      const rungW = Math.min(440, leftW - 36);
      const rungH = Phaser.Math.Clamp(
        Math.floor((innerH - 44 - (rungCount - 1) * arrowGap) / rungCount),
        74,
        118
      );
      const totalStackH = rungCount * rungH + (rungCount - 1) * arrowGap;
      const startY = innerTop + Math.round((innerH - totalStackH) / 2) + Math.round(rungH / 2);
      const rungCX = leftX + Math.round(leftW / 2);

      ladder.pathItems.forEach((item, idx) => {
        const ry = startY + idx * (rungH + arrowGap);
        const isStart = idx === 0;
        const isGoal = idx === rungCount - 1;
        const isSolved = idx <= this.stepIndex; // Start (idx 0) is always unlocked; completed steps <= stepIndex
        const isActive = idx === this.stepIndex + 1;

        // Connector arrow between rungs
        if (idx > 0) {
          const arrowY = ry - rungH / 2 - arrowGap / 2;
          const arrowTxt = s.add
            .text(rungCX, arrowY, '▼', {
              fontFamily: FONT_UI,
              fontSize: '14px',
              color: isSolved ? '#4ade80' : isActive ? '#fde047' : '#60a5fa',
            })
            .setOrigin(0.5);
          s.boardLayer.add(arrowTxt);
        }

        const cont = s.add.container(rungCX, ry);
        const bg = s.add.graphics();

        if (isStart) {
          s.paintGlossyBlock(bg, rungW, rungH, 0x1982c4, 'normal');
        } else if (isGoal && !isActive && !isSolved) {
          s.paintGlossyBlock(bg, rungW, rungH, 0x8b5cf6, 'normal');
        } else if (isSolved) {
          s.paintGlossyBlock(bg, rungW, rungH, 0x10b981, 'success');
        } else if (isActive) {
          s.paintGlossyGlass(bg, rungW, rungH, 'selected');
        } else {
          s.paintGlossyGlass(bg, rungW, rungH, 'normal');
        }

        const tagLabel = isStart
          ? 'START'
          : isGoal
          ? 'GOAL'
          : `STEP ${idx}`;
        const tagTxt = s.add
          .text(-rungW / 2 + 16, -rungH / 2 + 14, tagLabel, {
            fontFamily: FONT_MONO,
            fontSize: '11px',
            fontStyle: 'bold',
            color: isActive ? '#fde047' : '#dbeafe',
            letterSpacing: 1,
          })
          .setOrigin(0, 0.5);

        const children = [bg, tagTxt];

        if (isStart || isSolved || isGoal) {
          const mainLabel = item.hasKanji ? `${item.word}  (${item.kana})` : item.kana;
          const mainTxt = s.add
            .text(0, -Math.round(rungH * 0.08), mainLabel, {
              fontFamily: FONT_JP,
              fontSize: `${Math.min(30, Math.max(20, Math.floor(rungH * 0.30)))}px`,
              fontStyle: 'bold',
              color: '#ffffff',
              stroke: '#0f172a',
              strokeThickness: 3,
            })
            .setOrigin(0.5);
          fitSingleLineText(mainTxt, rungW - 36);

          const subStr = [cfg.showRomaji ? item.romaji : '', cfg.showDefinition ? item.definition : '']
            .filter(Boolean)
            .join(' — ');
          const subTxt = s.add
            .text(0, Math.round(rungH * 0.27), '', {
              fontFamily: FONT_UI,
              fontSize: '12px',
              fontStyle: '600',
              color: '#e0f2fe',
              align: 'center',
              wordWrap: { width: rungW - 32, useAdvancedWrap: true },
            })
            .setOrigin(0.5);
          s.fitWrappedText(subTxt, subStr, Math.max(18, Math.round(rungH * 0.30)));
          children.push(mainTxt, subTxt);
        } else if (isActive && activeStep) {
          // Show masked 1-char diff pattern (e.g., "か [ ? ]")
          const prevChars = Array.from(activeStep.prevItem.kana);
          const pattern = prevChars
            .map((ch, ci) => (ci === activeStep.changedIndex ? ' [ ? ] ' : ch))
            .join('');
          const patTxt = s.add
            .text(0, -Math.round(rungH * 0.08), pattern, {
              fontFamily: FONT_JP,
              fontSize: `${Math.min(28, Math.max(20, Math.floor(rungH * 0.28)))}px`,
              fontStyle: 'bold',
              color: '#fde047',
            })
            .setOrigin(0.5);
          fitSingleLineText(patTxt, rungW - 36);

          const clueTxt = s.add
            .text(0, Math.round(rungH * 0.27), '', {
              fontFamily: FONT_UI,
              fontSize: '12.5px',
              fontStyle: '600',
              color: '#bae6fd',
              align: 'center',
              wordWrap: { width: rungW - 32, useAdvancedWrap: true },
            })
            .setOrigin(0.5);
          s.fitWrappedText(
            clueTxt,
            activeStep.targetItem.definition || 'Choose the next 1-character step',
            Math.max(18, Math.round(rungH * 0.30))
          );
          children.push(patTxt, clueTxt);
        } else {
          const lockedTxt = s.add
            .text(0, 2, '? ? ?', {
              fontFamily: FONT_MONO,
              fontSize: '20px',
              fontStyle: 'bold',
              color: '#64748b',
            })
            .setOrigin(0.5);
          children.push(lockedTxt);
        }

        cont.add(children);
        s.boardLayer.add(cont);
      });

      // --- RIGHT: ACTIVE STEP CLUE + 4 TOUCHABLE OPTIONS ---
      if (!activeStep) return;

      const rightCX = rightX + Math.round(rightW / 2);
      const headerH = Phaser.Math.Clamp(Math.floor(innerH * 0.24), 94, 138);
      const headerY = innerTop + Math.round(headerH / 2);

      const headerBg = s.add.graphics().setPosition(rightCX, headerY);
      s.paintGlossyGlass(headerBg, rightW, headerH, 'normal');
      s.boardLayer.add(headerBg);

      const stepBanner = s.add
        .text(
          rightCX,
          innerTop + 20,
          `STEP ${this.stepIndex + 1} OF ${ladder.steps.length}  •  CHANGE 1 CHARACTER`,
          {
            fontFamily: FONT_MONO,
            fontSize: '12.5px',
            fontStyle: 'bold',
            color: '#fde047',
            letterSpacing: 1,
          }
        )
        .setOrigin(0.5);

      const clueTarget = activeStep.targetItem;
      const clueLineParts = [];
      if (cfg.showDefinition || !cfg.showRomaji) {
        clueLineParts.push(clueTarget.definition);
      }
      if (cfg.showRomaji && cfg.answerReading !== 'kana') {
        clueLineParts.push(`(${clueTarget.romaji})`);
      }

      const clueDesc = s.add
        .text(rightCX, innerTop + Math.round(headerH * 0.62), '', {
          fontFamily: FONT_UI,
          fontSize: '15px',
          fontStyle: '700',
          color: '#f8fafc',
          align: 'center',
          lineSpacing: 3,
          wordWrap: { width: rightW - 36, useAdvancedWrap: true },
        })
        .setOrigin(0.5);
      s.fitWrappedText(clueDesc, clueLineParts.filter(Boolean).join('  '), Math.max(36, headerH - 46));
      s.boardLayer.add([stepBanner, clueDesc]);

      // 4 glossy Option cards
      const optsTop = innerTop + headerH + 18;
      const optsAvailH = innerTop + innerH - optsTop;
      const optGap = 12;
      const optH = Phaser.Math.Clamp(Math.floor((optsAvailH - optGap * 3) / 4), 60, 102);
      const optLabels = ['A', 'B', 'C', 'D'];

      activeStep.options.forEach((optVocab, idx) => {
        const oy = optsTop + Math.round(optH / 2) + idx * (optH + optGap);
        const cont = s.add.container(rightCX, oy);
        const bg = s.add.graphics();
        s.paintGlossyGlass(bg, rightW, optH, 'normal');

        const letter = s.add
          .text(-rightW / 2 + 24, 0, optLabels[idx], {
            fontFamily: FONT_MONO,
            fontSize: '14px',
            fontStyle: 'bold',
            color: '#7dd3fc',
          })
          .setOrigin(0.5);

        const jpLabel = optVocab.hasKanji
          ? `${optVocab.word}  (${optVocab.kana})`
          : optVocab.kana;
        const mainTxt = s.add
          .text(0, cfg.showRomaji ? -Math.round(optH * 0.14) : 0, jpLabel, {
            fontFamily: FONT_JP,
            fontSize: `${Math.min(30, Math.max(20, Math.floor(optH * 0.36)))}px`,
            fontStyle: 'bold',
            color: '#fde047',
          })
          .setOrigin(0.5);
        fitSingleLineText(mainTxt, rightW - 86);

        const children = [bg, letter, mainTxt];

        if (cfg.showRomaji) {
          const romTxt = s.add
            .text(0, Math.round(optH * 0.24), optVocab.romaji || '', {
              fontFamily: FONT_MONO,
              fontSize: '14px',
              fontStyle: 'bold',
              color: '#bae6fd',
            })
            .setOrigin(0.5);
          fitSingleLineText(romTxt, rightW - 86);
          children.push(romTxt);
        }

        const hit = s.add
          .zone(0, 0, rightW, optH)
          .setOrigin(0.5)
          .setInteractive({ useHandCursor: true });

        const optObj = {
          vocab: optVocab,
          container: cont,
          bg,
          width: rightW,
          height: optH,
          baseX: rightCX,
          baseY: oy,
          disabled: false,
        };

        hit.on('pointerover', () => {
          if (!s.isPlaying || this.locked || optObj.disabled) return;
          s.paintGlossyGlass(bg, rightW, optH, 'hover');
          s.tweens.add({ targets: cont, scale: 1.02, duration: 80 });
        });
        hit.on('pointerout', () => {
          if (optObj.disabled) return;
          s.paintGlossyGlass(bg, rightW, optH, 'normal');
          s.tweens.add({ targets: cont, scale: 1, duration: 80 });
        });
        hit.on('pointerdown', (pointer) => {
          if (!s.isPrimaryPointer(pointer) || !s.isPlaying || this.locked || optObj.disabled) return;
          this.handleOptionPick(optObj, activeStep, ladder);
        });

        children.push(hit);
        cont.add(children);
        s.boardLayer.add(cont);
      });
    }

    handleOptionPick(optObj, activeStep, ladder) {
      const s = this.scene;
      if (optObj.vocab.kana === activeStep.targetItem.kana) {
        this.locked = true;
        s.paintGlossyGlass(optObj.bg, optObj.width, optObj.height, 'success');
        s.spawnGreenBurst(optObj.baseX, optObj.baseY, Math.min(optObj.width, optObj.height) * 0.4);
        s.awardCorrect(optObj.baseX, optObj.baseY, 10);

        s.scheduleCall(420, () => {
          if (!s.isPlaying) return;
          this.stepIndex += 1;
          if (this.stepIndex >= ladder.steps.length) {
            s.boardsCompleted += 1;
            const nextIdx = this.ladderIndex + 1;
            if (nextIdx >= this.ladders.length) {
              s.finishModeSession('completed');
            } else {
              s.showTransitionBanner(
                `Ladder ${this.ladderIndex + 1} Complete!`,
                `Loading Ladder ${nextIdx + 1} of ${this.ladders.length}...`
              );
              s.scheduleCall(820, () => {
                if (s.isPlaying) this.loadLadder(nextIdx);
              });
            }
          } else {
            this.locked = false;
            this.renderLadder();
          }
        });
      } else {
        optObj.disabled = true;
        s.paintGlossyGlass(optObj.bg, optObj.width, optObj.height, 'error');
        s.shakeCard(optObj.container, optObj.baseX);
        s.recordMistake(optObj.baseX, optObj.baseY - optObj.height / 2 - 10, '✗ Wrong step');
        s.scheduleCall(480, () => {
          if (!optObj.container || !optObj.container.active) return;
          optObj.disabled = false;
          optObj.container.x = optObj.baseX;
          s.paintGlossyGlass(optObj.bg, optObj.width, optObj.height, 'normal');
        });
      }
    }

    handleResize() {
      if (this.scene.isPlaying) this.renderLadder();
    }

    destroy() {}
  }

  global.JLPTExtraModes = {
    MultipleChoiceController,
    CrosswordsController,
    WordsearchController,
    JumbleController,
    WeaverController,
  };
})(window);
