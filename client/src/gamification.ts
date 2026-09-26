import {
  playAchievementFanfare,
  playComboSound,
  playLifeLostSound,
  playPlayerHurtSound,
  playPointChime,
  playVictoryChords,
} from "./gamification-audio.ts";

export interface Achievement {
  id: string;
  title: string;
  desc: string;
  icon: string;
  rewardPoints: number;
  unlocked: boolean;
}

export interface GamificationStats {
  enemiesDefeated: number;
  dodges: number;
  hitsLanded: number;
  damageTaken: number;
  trustGained: number;
  puzzlesSolved: number;
}

export class GamificationManager {
  score = 0;
  private displayScore = 0;

  lives = 3;
  readonly maxLives = 3;

  hp = 100;
  readonly maxHp = 100;

  combo = 1;
  comboTimer = 0;
  readonly maxComboTimer = 4.0;

  stability = 25; // 0 - 100%
  invulnerableTimer = 0;

  isGameOver = false;
  isVictory = false;

  stats: GamificationStats = {
    enemiesDefeated: 0,
    dodges: 0,
    hitsLanded: 0,
    damageTaken: 0,
    trustGained: 0,
    puzzlesSolved: 0,
  };

  achievements: Achievement[] = [
    {
      id: "first_contact",
      title: "Premier Contact",
      desc: "Établir le dialogue avec le fier Achille",
      icon: "💬",
      rewardPoints: 100,
      unlocked: false,
    },
    {
      id: "hero_speech",
      title: "Paroles d'Or",
      desc: "Gagner le respect d'Achille (Confiance > 60%)",
      icon: "🏛️",
      rewardPoints: 200,
      unlocked: false,
    },
    {
      id: "first_strike",
      title: "Premier Sang",
      desc: "Porter un coup décisif à un guerrier troyen",
      icon: "🗡️",
      rewardPoints: 150,
      unlocked: false,
    },
    {
      id: "dodge_master",
      title: "Danseur de Guerre",
      desc: "Réaliser 3 esquives parfaites consécutives",
      icon: "⚡",
      rewardPoints: 250,
      unlocked: false,
    },
    {
      id: "combo_king",
      title: "Tempête Héroïque",
      desc: "Atteindre un multiplicateur de combo x3",
      icon: "🔥",
      rewardPoints: 300,
      unlocked: false,
    },
    {
      id: "war_charge",
      title: "Au Cœur de la Mêlée",
      desc: "Mener la charge avec Achille pour défendre les nefs",
      icon: "⚔️",
      rewardPoints: 350,
      unlocked: false,
    },
    {
      id: "puzzle_master",
      title: "Maître du Sceau",
      desc: "Résoudre l'énigme du verrou temporel d'Astra",
      icon: "🔓",
      rewardPoints: 500,
      unlocked: false,
    },
    {
      id: "savior_of_troy",
      title: "Gardien de la Lignée",
      desc: "Stabiliser le continuum à 100% et sauver la chronologie",
      icon: "👑",
      rewardPoints: 1000,
      unlocked: false,
    },
  ];

  // DOM Elements
  private container!: HTMLElement;
  private scoreEl!: HTMLElement;
  private livesEl!: HTMLElement;
  private hpBarEl!: HTMLElement;
  private hpGhostEl!: HTMLElement;
  private hpTextEl!: HTMLElement;
  private comboEl!: HTMLElement;
  private comboBadgeEl!: HTMLElement;
  private comboBarEl!: HTMLElement;
  private stabilityBarEl!: HTMLElement;
  private stabilityTextEl!: HTMLElement;
  private pointsLayerEl!: HTMLElement;
  private damageVignetteEl!: HTMLElement;
  private toastContainerEl!: HTMLElement;
  private journalModalEl!: HTMLElement;
  private gameOverModalEl!: HTMLElement;
  private victoryModalEl!: HTMLElement;

  private onRespawnCallback?: () => void;
  private onNextEraCallback?: () => void;

  constructor(onRespawn?: () => void, onNextEra?: () => void) {
    this.onRespawnCallback = onRespawn;
    this.onNextEraCallback = onNextEra;
    this.createDom();
    this.loadSavedHighscore();
    this.updateDom();
  }

  private loadSavedHighscore(): void {
    try {
      const saved = localStorage.getItem("echoes_high_score");
      if (saved) {
        // Highscore stored for leaderboard
      }
    } catch {}
  }

  private saveHighScore(): void {
    try {
      const current = Number(localStorage.getItem("echoes_high_score") ?? 0);
      if (this.score > current) {
        localStorage.setItem("echoes_high_score", String(this.score));
      }
    } catch {}
  }

  private createDom(): void {
    // Top-level gamification HUD container
    this.container = document.createElement("div");
    this.container.id = "gamification-hud";
    this.container.innerHTML = `
      <!-- Damage screen effect -->
      <div id="damage-vignette" class="damage-vignette"></div>

      <!-- Floating Points Layer (center-screen / dynamic positions) -->
      <div id="points-layer" class="points-layer"></div>

      <!-- Main Game HUD (Top Right & Top Bar) -->
      <div class="game-hud-panel">
        <!-- Score & Multiplier -->
        <div class="score-card">
          <div class="score-label">POINTS DE CONTINUUM</div>
          <div class="score-value-row">
            <span class="score-icon">✦</span>
            <span id="score-counter" class="score-number">0</span>
            <div id="combo-badge" class="combo-badge hidden">
              <span id="combo-text">x2</span>
              <div class="combo-timer-track"><div id="combo-timer-bar" class="combo-timer-bar"></div></div>
            </div>
          </div>
        </div>

        <!-- Lives / Chrono-Cœurs -->
        <div class="lives-card">
          <div class="lives-label">CHRONO-CŒURS</div>
          <div id="lives-container" class="lives-row"></div>
        </div>

        <!-- Player Health / Temporal Integrity -->
        <div class="health-card">
          <div class="health-header">
            <span class="health-title">INTÉGRITÉ CORPORELLE</span>
            <span id="health-text" class="health-value">100 / 100 PV</span>
          </div>
          <div class="health-track">
            <div id="health-ghost" class="health-ghost"></div>
            <div id="health-bar" class="health-bar"></div>
          </div>
        </div>

        <!-- Continuum Stability Gauge -->
        <div class="stability-card">
          <div class="stability-header">
            <span class="stability-title">STABILITÉ DU CONTINUUM</span>
            <span id="stability-text" class="stability-value">25%</span>
          </div>
          <div class="stability-track">
            <div id="stability-bar" class="stability-bar" style="width: 25%"></div>
          </div>
        </div>

        <!-- Quick Help / Journal shortcut -->
        <div class="hud-footnote">
          <span>[TAB] Journal & Succès</span> · <span>[B] Déclencher la Bataille</span>
        </div>
      </div>

      <!-- Achievement Toast Container (Bottom Right) -->
      <div id="achievement-toasts" class="achievement-toasts"></div>

      <!-- Journal / Mission Overview Modal (TAB) -->
      <div id="journal-modal" class="journal-modal hidden">
        <div class="journal-content">
          <div class="journal-header">
            <h2>CHRONIQUE DE TROIE — ARCHIVES TEMPORELLES</h2>
            <button id="journal-close" class="journal-close">✕</button>
          </div>
          <div class="journal-body">
            <div class="journal-stats-col">
              <h3>STATISTIQUES DE MISSION</h3>
              <div class="journal-stat-row"><span>Score Total :</span><strong id="journal-stat-score">0 pts</strong></div>
              <div class="journal-stat-row"><span>Rang Actuel :</span><strong id="journal-stat-rank" class="rank-badge">C</strong></div>
              <div class="journal-stat-row"><span>Ennemis Vaincus :</span><strong id="journal-stat-kills">0</strong></div>
              <div class="journal-stat-row"><span>Esquives Réussies :</span><strong id="journal-stat-dodges">0</strong></div>
              <div class="journal-stat-row"><span>Coups Portés :</span><strong id="journal-stat-hits">0</strong></div>
              <div class="journal-stat-row"><span>Dégâts Subis :</span><strong id="journal-stat-damage">0</strong></div>
              <div class="journal-stat-row"><span>Stabilité Continuum :</span><strong id="journal-stat-stability">25%</strong></div>
            </div>
            <div class="journal-achievements-col">
              <h3>SUCCÈS DÉBLOQUÉS</h3>
              <div id="journal-achievements-list" class="achievements-list"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Game Over Modal -->
      <div id="game-over-modal" class="game-over-modal hidden">
        <div class="game-over-box">
          <div class="glitch-title" data-text="RUPTURE TEMPORELLE">RUPTURE DU CONTINUUM</div>
          <p class="game-over-desc">Tous tes Chrono-Cœurs ont été anéantis. Le paradoxe s'est refermé sur toi.</p>
          <div class="game-over-score-card">
            <div>Score Atteint : <strong id="game-over-score">0 pts</strong></div>
            <div>Ennemis Éliminés : <strong id="game-over-kills">0</strong></div>
          </div>
          <button id="btn-respawn" class="btn-respawn">↺ RÉINITIALISER LA BOUCLE TEMPORELLE</button>
        </div>
      </div>

      <!-- Victory Modal -->
      <div id="victory-modal" class="victory-modal hidden">
        <div class="victory-box">
          <div class="victory-sigil">✦ ✦ ✦</div>
          <h2 class="victory-title">CONTINUUM TEMPOREL RESTAURÉ</h2>
          <p class="victory-sub">Achille a repoussé l'assaut troyen. La lignée est sauve.</p>
          <div class="victory-rank-display">
            <span class="victory-rank-label">RANG DE MISSION</span>
            <span id="victory-rank-letter" class="victory-rank-letter">S</span>
          </div>
          <div class="victory-details">
            <div class="v-row"><span>Score Final :</span><strong id="victory-final-score">0 pts</strong></div>
            <div class="v-row"><span>Bonus Vies Restantes :</span><strong id="victory-lives-bonus">+0 pts</strong></div>
            <div class="v-row"><span>Bonus Maîtrise d'Armes :</span><strong id="victory-combat-bonus">+0 pts</strong></div>
          </div>
          <div class="victory-actions">
            <button id="btn-next-era" class="btn-primary" style="display: none;">🌀 Sauter vers l'Époque Suivante</button>
            <a href="index.html" class="btn-secondary">⏳ Retour à la Frise du Temps</a>
            <button id="btn-keep-exploring" class="btn-tertiary">Explorer le champ de bataille</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.container);

    // Cache elements
    this.scoreEl = this.container.querySelector("#score-counter")!;
    this.livesEl = this.container.querySelector("#lives-container")!;
    this.hpBarEl = this.container.querySelector("#health-bar")!;
    this.hpGhostEl = this.container.querySelector("#health-ghost")!;
    this.hpTextEl = this.container.querySelector("#health-text")!;
    this.comboEl = this.container.querySelector("#combo-badge")!;
    this.comboBadgeEl = this.container.querySelector("#combo-text")!;
    this.comboBarEl = this.container.querySelector("#combo-timer-bar")!;
    this.stabilityBarEl = this.container.querySelector("#stability-bar")!;
    this.stabilityTextEl = this.container.querySelector("#stability-text")!;
    this.pointsLayerEl = this.container.querySelector("#points-layer")!;
    this.damageVignetteEl = this.container.querySelector("#damage-vignette")!;
    this.toastContainerEl = this.container.querySelector("#achievement-toasts")!;
    this.journalModalEl = this.container.querySelector("#journal-modal")!;
    this.gameOverModalEl = this.container.querySelector("#game-over-modal")!;
    this.victoryModalEl = this.container.querySelector("#victory-modal")!;

    // Hook listeners
    this.container.querySelector("#journal-close")?.addEventListener("click", () => this.toggleJournal(false));
    this.container.querySelector("#btn-respawn")?.addEventListener("click", () => this.respawn());
    this.container.querySelector("#btn-next-era")?.addEventListener("click", () => {
      this.victoryModalEl.classList.add("hidden");
      this.onNextEraCallback?.();
    });
    this.container.querySelector("#btn-keep-exploring")?.addEventListener("click", () => {
      this.victoryModalEl.classList.add("hidden");
    });

    // Keyboard TAB for journal
    window.addEventListener("keydown", (e) => {
      if (e.code === "Tab" && !this.isGameOver) {
        e.preventDefault();
        this.toggleJournal();
      } else if (e.code === "Escape" && !this.journalModalEl.classList.contains("hidden")) {
        this.toggleJournal(false);
      }
    });

    this.renderLives();
  }

  toggleJournal(force?: boolean): void {
    const show = force !== undefined ? force : this.journalModalEl.classList.contains("hidden");
    if (show) {
      this.updateJournalContent();
      this.journalModalEl.classList.remove("hidden");
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
    } else {
      this.journalModalEl.classList.add("hidden");
    }
  }

  private updateJournalContent(): void {
    const rank = this.calculateRank();
    const rankEl = this.container.querySelector("#journal-stat-rank")!;
    rankEl.textContent = rank;
    rankEl.className = `rank-badge rank-${rank.toLowerCase()}`;

    this.container.querySelector("#journal-stat-score")!.textContent = `${this.score.toLocaleString()} pts`;
    this.container.querySelector("#journal-stat-kills")!.textContent = String(this.stats.enemiesDefeated);
    this.container.querySelector("#journal-stat-dodges")!.textContent = String(this.stats.dodges);
    this.container.querySelector("#journal-stat-hits")!.textContent = String(this.stats.hitsLanded);
    this.container.querySelector("#journal-stat-damage")!.textContent = String(this.stats.damageTaken);
    this.container.querySelector("#journal-stat-stability")!.textContent = `${Math.round(this.stability)}%`;

    const list = this.container.querySelector("#journal-achievements-list")!;
    list.innerHTML = this.achievements
      .map(
        (a) => `
        <div class="achievement-item ${a.unlocked ? "unlocked" : "locked"}">
          <div class="ach-icon">${a.unlocked ? a.icon : "🔒"}</div>
          <div class="ach-info">
            <div class="ach-name">${a.title} ${a.unlocked ? `<span class="ach-pts">+${a.rewardPoints} pts</span>` : ""}</div>
            <div class="ach-desc">${a.desc}</div>
          </div>
        </div>
      `,
      )
      .join("");
  }

  private calculateRank(): string {
    if (this.score >= 2500) return "S";
    if (this.score >= 1800) return "A";
    if (this.score >= 1200) return "B";
    if (this.score >= 600) return "C";
    return "D";
  }

  /** Display floating point popup indicator on screen */
  showFloatingPoints(
    amount: number,
    label: string,
    options?: { x?: number; y?: number; color?: "gold" | "cyan" | "green" | "purple" | "red" },
  ): void {
    const el = document.createElement("div");
    const colorClass = options?.color ?? (this.combo > 1 ? "gold" : "cyan");
    el.className = `floating-point-item ${colorClass}`;

    const effectivePts = amount * this.combo;
    el.innerHTML = `
      <div class="fp-points">+${effectivePts} <span class="fp-unit">PTS</span></div>
      <div class="fp-label">${label}${this.combo > 1 ? ` <span class="fp-combo">Combo x${this.combo}</span>` : ""}</div>
    `;

    // Position: default to center-upper area with random jitter
    const jitterX = (Math.random() - 0.5) * 120;
    const jitterY = (Math.random() - 0.5) * 40;
    const posX = options?.x ?? window.innerWidth * 0.5 + jitterX;
    const posY = options?.y ?? window.innerHeight * 0.42 + jitterY;

    el.style.left = `${posX}px`;
    el.style.top = `${posY}px`;

    this.pointsLayerEl.appendChild(el);

    // Auto-remove after animation
    setTimeout(() => {
      el.remove();
    }, 1600);
  }

  /** Add score points with full gamified feedback */
  addPoints(
    amount: number,
    reason: string,
    options?: { color?: "gold" | "cyan" | "green" | "purple" | "red"; sound?: boolean },
  ): void {
    if (this.isGameOver) return;
    const gained = amount * this.combo;
    this.score += gained;
    this.saveHighScore();

    if (options?.sound !== false) {
      playPointChime(this.combo);
    }

    this.showFloatingPoints(amount, reason, options);
  }

  /** Increment combo multiplier */
  increaseCombo(): void {
    this.combo = Math.min(5, this.combo + 1);
    this.comboTimer = this.maxComboTimer;
    playComboSound(this.combo);
    this.comboEl.classList.remove("hidden");
    this.comboBadgeEl.textContent = `x${this.combo}`;
    if (this.combo >= 3) {
      this.unlockAchievement("combo_king");
    }
  }

  /** Reset combo multiplier */
  resetCombo(): void {
    this.combo = 1;
    this.comboTimer = 0;
    this.comboEl.classList.add("hidden");
  }

  /** Award points and effects when player hits an enemy */
  registerAttackHit(): void {
    this.stats.hitsLanded++;
    this.increaseCombo();
    this.addPoints(75, "Coup de Javeline", { color: "gold" });
    this.unlockAchievement("first_strike");
    this.addStability(2);
  }

  /** Award points and effects when dodging an enemy attack */
  registerDodge(): void {
    this.stats.dodges++;
    this.increaseCombo();
    this.addPoints(100, "Esquive Parfaite", { color: "cyan" });
    if (this.stats.dodges >= 3) {
      this.unlockAchievement("dodge_master");
    }
    this.addStability(3);
  }

  /** Award points and effects when an enemy is defeated */
  registerKill(enemyName = "Guerrier troyen"): void {
    this.stats.enemiesDefeated++;
    this.increaseCombo();
    this.addPoints(250, `${enemyName} vaincu`, { color: "purple" });
    this.addStability(8);
  }

  /** Award points and effects when Achilles trust increases */
  registerTrustGain(amount: number): void {
    this.stats.trustGained += amount;
    this.addPoints(amount * 12, `Confiance acquise (+${amount})`, { color: "green" });
    this.unlockAchievement("first_contact");
    if (amount > 10) {
      this.unlockAchievement("hero_speech");
    }
    this.addStability(amount * 0.7);
  }

  addTrust(amount: number): void {
    this.registerTrustGain(amount);
  }

  /** Award points and effects when war breaks out */
  registerWarTriggered(): void {
    this.addPoints(350, "Appel aux Armes de Troie", { color: "gold" });
    this.unlockAchievement("war_charge");
    this.addStability(15);
  }

  /** Award points when temporal seal puzzle is solved */
  registerPuzzleSolved(): void {
    this.stats.puzzlesSolved++;
    this.addPoints(500, "Sceau Temporel Stabilisé", { color: "purple" });
    this.unlockAchievement("puzzle_master");
    this.addStability(25);
  }

  /** Increase continuum stability */
  addStability(amount: number): void {
    this.stability = Math.min(100, this.stability + amount);
    this.stabilityBarEl.style.width = `${this.stability}%`;
    this.stabilityTextEl.textContent = `${Math.round(this.stability)}%`;

    if (this.stability >= 100 && !this.isVictory) {
      this.triggerVictory();
    }
  }

  /** Inflict damage on player */
  takeDamage(amount: number, reason = "Blessure de combat"): boolean {
    if (this.invulnerableTimer > 0 || this.isGameOver) return false;

    this.hp = Math.max(0, this.hp - amount);
    this.stats.damageTaken += amount;
    this.resetCombo();

    playPlayerHurtSound();

    // Damage flash vignette
    this.damageVignetteEl.classList.remove("flash");
    void this.damageVignetteEl.offsetWidth; // trigger reflow
    this.damageVignetteEl.classList.add("flash");

    // Camera shake / body effect
    document.body.classList.add("screen-shake");
    setTimeout(() => document.body.classList.remove("screen-shake"), 220);

    // Floating damage indicator
    const el = document.createElement("div");
    el.className = "floating-point-item red";
    el.innerHTML = `
      <div class="fp-points">-${amount} <span class="fp-unit">PV</span></div>
      <div class="fp-label">${reason}</div>
    `;
    el.style.left = `${window.innerWidth * 0.5 + (Math.random() - 0.5) * 80}px`;
    el.style.top = `${window.innerHeight * 0.4}px`;
    this.pointsLayerEl.appendChild(el);
    setTimeout(() => el.remove(), 1400);

    this.updateHealthBar();

    // Check if fatal blow for this life
    if (this.hp <= 0) {
      this.loseLife();
      return true;
    }

    return false;
  }

  private loseLife(): void {
    this.lives = Math.max(0, this.lives - 1);
    this.renderLives();
    playLifeLostSound();

    if (this.lives <= 0) {
      this.triggerGameOver();
    } else {
      // Consume Chrono-Core and restore integrity with temporal rewind effect
      this.hp = this.maxHp;
      this.invulnerableTimer = 2.8;
      this.updateHealthBar();

      // Show dramatic floating notification
      const el = document.createElement("div");
      el.className = "floating-point-item red-big";
      el.innerHTML = `
        <div class="fp-points">💔 -1 CHRONO-CŒUR !</div>
        <div class="fp-label">RÉSONANCE TEMPORELLE ACTIVÉE (${this.lives} restantes)</div>
      `;
      el.style.left = `${window.innerWidth * 0.5}px`;
      el.style.top = `${window.innerHeight * 0.35}px`;
      this.pointsLayerEl.appendChild(el);
      setTimeout(() => el.remove(), 2500);
    }
  }

  private renderLives(): void {
    this.livesEl.innerHTML = "";
    for (let i = 0; i < this.maxLives; i++) {
      const core = document.createElement("div");
      const active = i < this.lives;
      core.className = `chrono-core ${active ? "active" : "broken"}`;
      core.innerHTML = `
        <svg viewBox="0 0 24 24" width="22" height="22" class="core-icon">
          <path fill="currentColor" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
        </svg>
      `;
      this.livesEl.appendChild(core);
    }
  }

  private updateHealthBar(): void {
    const pct = Math.max(0, Math.min(100, (this.hp / this.maxHp) * 100));
    this.hpBarEl.style.width = `${pct}%`;
    this.hpTextEl.textContent = `${this.hp} / ${this.maxHp} PV`;

    // Ghost damage bar smoothly catches up
    setTimeout(() => {
      this.hpGhostEl.style.width = `${pct}%`;
    }, 280);

    // Color shift based on HP
    if (pct < 30) {
      this.hpBarEl.style.background = "linear-gradient(90deg, #ff2244, #ff5533)";
      this.hpBarEl.classList.add("danger-pulse");
    } else if (pct < 60) {
      this.hpBarEl.style.background = "linear-gradient(90deg, #ff9900, #ffcc00)";
      this.hpBarEl.classList.remove("danger-pulse");
    } else {
      this.hpBarEl.style.background = "linear-gradient(90deg, #00e5ff, #00b0ff)";
      this.hpBarEl.classList.remove("danger-pulse");
    }
  }

  /** Unlock an achievement and show celebration toast */
  unlockAchievement(id: string): void {
    const ach = this.achievements.find((a) => a.id === id);
    if (!ach || ach.unlocked) return;

    ach.unlocked = true;
    this.addPoints(ach.rewardPoints, `Succès : ${ach.title}`, { color: "gold", sound: false });
    playAchievementFanfare();

    // Show achievement toast
    const toast = document.createElement("div");
    toast.className = "achievement-toast";
    toast.innerHTML = `
      <div class="toast-sigil">${ach.icon}</div>
      <div class="toast-body">
        <div class="toast-category">🏆 SUCCÈS DÉBLOQUÉ</div>
        <div class="toast-title">${ach.title}</div>
        <div class="toast-desc">${ach.desc}</div>
        <div class="toast-reward">+${ach.rewardPoints} PTS</div>
      </div>
    `;

    this.toastContainerEl.appendChild(toast);
    setTimeout(() => {
      toast.classList.add("hide");
      setTimeout(() => toast.remove(), 600);
    }, 4500);
  }

  private triggerGameOver(): void {
    this.isGameOver = true;
    document.exitPointerLock();
    this.container.querySelector("#game-over-score")!.textContent = `${this.score.toLocaleString()} pts`;
    this.container.querySelector("#game-over-kills")!.textContent = String(this.stats.enemiesDefeated);
    this.gameOverModalEl.classList.remove("hidden");
  }

  setNextEraCallback(cb: () => void, nextTitle = "Époque Suivante"): void {
    this.onNextEraCallback = cb;
    const btn = this.container.querySelector("#btn-next-era") as HTMLButtonElement | null;
    if (btn) {
      btn.style.display = "inline-flex";
      btn.textContent = `🌀 Sauter vers ${nextTitle}`;
    }
  }

  setVictorySub(text: string): void {
    const sub = this.container.querySelector(".victory-sub");
    if (sub) sub.textContent = text;
  }

  showVictory(subText?: string): void {
    if (subText) this.setVictorySub(subText);
    this.triggerVictory();
  }

  private triggerVictory(): void {
    this.isVictory = true;
    this.unlockAchievement("savior_of_troy");
    playVictoryChords();

    const livesBonus = this.lives * 300;
    const combatBonus = this.stats.enemiesDefeated * 200 + this.stats.dodges * 100;
    this.score += livesBonus + combatBonus;
    this.saveHighScore();

    const rank = this.calculateRank();
    const rankLetter = this.container.querySelector("#victory-rank-letter")!;
    rankLetter.textContent = rank;
    rankLetter.className = `victory-rank-letter rank-${rank.toLowerCase()}`;

    this.container.querySelector("#victory-final-score")!.textContent = `${this.score.toLocaleString()} pts`;
    this.container.querySelector("#victory-lives-bonus")!.textContent = `+${livesBonus} pts (${this.lives} cœurs)`;
    this.container.querySelector("#victory-combat-bonus")!.textContent = `+${combatBonus} pts`;

    this.victoryModalEl.classList.remove("hidden");
  }

  respawn(): void {
    this.isGameOver = false;
    this.lives = this.maxLives;
    this.hp = this.maxHp;
    this.renderLives();
    this.updateHealthBar();
    this.resetCombo();
    this.invulnerableTimer = 3.0;
    this.gameOverModalEl.classList.add("hidden");

    if (this.onRespawnCallback) {
      this.onRespawnCallback();
    }
  }

  /** Main update tick called inside animation loop */
  update(dt: number): void {
    // Smooth score interpolation
    if (this.displayScore < this.score) {
      const step = Math.max(1, Math.ceil((this.score - this.displayScore) * 0.1));
      this.displayScore = Math.min(this.score, this.displayScore + step);
      this.scoreEl.textContent = this.displayScore.toLocaleString();
    }

    // Combo timer decrement
    if (this.combo > 1) {
      this.comboTimer -= dt;
      const ratio = Math.max(0, this.comboTimer / this.maxComboTimer);
      this.comboBarEl.style.width = `${ratio * 100}%`;
      if (this.comboTimer <= 0) {
        this.resetCombo();
      }
    }

    // Invulnerability timer
    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer = Math.max(0, this.invulnerableTimer - dt);
    }
  }

  private updateDom(): void {
    this.scoreEl.textContent = this.score.toLocaleString();
    this.renderLives();
    this.updateHealthBar();
  }
}
