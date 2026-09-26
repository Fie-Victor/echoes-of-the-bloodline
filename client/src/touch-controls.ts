export interface TouchControlsCallbacks {
  onAttack: () => void;
  onDodge: () => void;
  onTalk: (npcId: string) => void;
  onMicStart?: () => void;
  onMicEnd?: () => void;
  onWarTrigger?: () => void;
  onJournalToggle?: () => void;
  onCameraRotate: (deltaYaw: number, deltaPitch: number) => void;
}

export class TouchControls {
  private container!: HTMLElement;
  private joystickBase!: HTMLElement;
  private joystickKnob!: HTMLElement;
  private talkBtn!: HTMLButtonElement;
  private attackBtn!: HTMLButtonElement;
  private dodgeBtn!: HTMLButtonElement;
  private astraBtn!: HTMLButtonElement;
  private micBtn!: HTMLButtonElement;
  private warBtn!: HTMLButtonElement;
  private orientationBanner!: HTMLElement;

  private isTouch = false;
  private joystickTouchId: number | null = null;
  private joystickCenter = { x: 0, y: 0 };
  private joystickRadius = 55; // max displacement px

  private lookTouchId: number | null = null;
  private lastLookPos = { x: 0, y: 0 };

  private moveState = {
    forward: 0,
    strafe: 0,
    run: false,
  };

  constructor(private callbacks: TouchControlsCallbacks) {
    this.detectDevice();
    this.createDom();
    this.bindEvents();
    this.checkOrientation();
  }

  get isTouchDevice(): boolean {
    return this.isTouch;
  }

  private detectDevice(): void {
    this.isTouch =
      typeof window !== "undefined" &&
      ("ontouchstart" in window ||
        navigator.maxTouchPoints > 0 ||
        window.matchMedia("(pointer: coarse)").matches ||
        window.innerWidth <= 1024);
  }

  private createDom(): void {
    this.container = document.createElement("div");
    this.container.id = "touch-controls";
    this.container.className = `touch-controls ${this.isTouch ? "active" : "hidden"}`;

    this.container.innerHTML = `
      <!-- Portrait warning banner on smartphones -->
      <div id="orientation-banner" class="orientation-banner hidden">
        <span>📱 Conseil : Tournez l'appareil en <strong>mode paysage</strong> pour une meilleure expérience</span>
        <button id="btn-close-orientation" class="btn-close-banner">✕</button>
      </div>

      <!-- Top Utility Bar for Mobile -->
      <div class="touch-top-bar">
        <a href="index.html" class="touch-top-btn" title="Retour à la Frise du Temps">
          <span class="t-icon">🏛️</span>
          <span class="t-txt">Frise</span>
        </a>
        <button id="btn-touch-journal" class="touch-top-btn" title="Journal & Succès">
          <span class="t-icon">📜</span>
          <span class="t-txt">Succès</span>
        </button>
        <button id="btn-touch-fullscreen" class="touch-top-btn" title="Plein Écran">
          <span class="t-icon">⛶</span>
        </button>
      </div>

      <!-- Virtual Joystick Area (Bottom Left) -->
      <div id="joystick-zone" class="joystick-zone">
        <div id="joystick-base" class="joystick-base">
          <div class="joystick-arrows">
            <span class="arrow up">▲</span>
            <span class="arrow down">▼</span>
            <span class="arrow left">◀</span>
            <span class="arrow right">▶</span>
          </div>
          <div id="joystick-knob" class="joystick-knob"></div>
        </div>
      </div>

      <!-- Action Buttons Cluster (Bottom Right) -->
      <div id="touch-actions" class="touch-actions">
        <!-- Secondary utility action buttons -->
        <div class="touch-sub-actions">
          <button id="btn-touch-astra" class="touch-round-btn btn-astra" title="Parler à Astra">
            <span class="r-icon">✨</span>
            <span class="r-lbl">Astra</span>
          </button>
          <button id="btn-touch-mic" class="touch-round-btn btn-mic" title="Microphone">
            <span class="r-icon">🎙️</span>
            <span class="r-lbl">Voix</span>
          </button>
          <button id="btn-touch-war" class="touch-round-btn btn-war" title="Déclencher la Guerre">
            <span class="r-icon">🔥</span>
            <span class="r-lbl">Guerre</span>
          </button>
        </div>

        <!-- Main primary combat actions -->
        <div class="touch-main-actions">
          <button id="btn-touch-talk" class="touch-action-btn btn-talk hidden" title="Parler">
            <span class="btn-sigil">💬</span>
            <span class="btn-text">Parler</span>
          </button>
          <button id="btn-touch-dodge" class="touch-action-btn btn-dodge" title="Esquive">
            <span class="btn-sigil">💨</span>
            <span class="btn-text">Esquive</span>
          </button>
          <button id="btn-touch-attack" class="touch-action-btn btn-attack" title="Attaque">
            <span class="btn-sigil">⚔️</span>
            <span class="btn-text">Attaque</span>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(this.container);

    // Cache elements
    this.joystickBase = this.container.querySelector("#joystick-base")!;
    this.joystickKnob = this.container.querySelector("#joystick-knob")!;
    this.talkBtn = this.container.querySelector("#btn-touch-talk")!;
    this.attackBtn = this.container.querySelector("#btn-touch-attack")!;
    this.dodgeBtn = this.container.querySelector("#btn-touch-dodge")!;
    this.astraBtn = this.container.querySelector("#btn-touch-astra")!;
    this.micBtn = this.container.querySelector("#btn-touch-mic")!;
    this.warBtn = this.container.querySelector("#btn-touch-war")!;
    this.orientationBanner = this.container.querySelector("#orientation-banner")!;
  }

  private bindEvents(): void {
    // Top utility buttons
    this.container.querySelector("#btn-touch-journal")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.callbacks.onJournalToggle?.();
    });

    this.container.querySelector("#btn-touch-fullscreen")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleFullscreen();
    });

    this.container.querySelector("#btn-close-orientation")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.orientationBanner.classList.add("hidden");
    });

    // Action button handlers (preventing camera drag)
    this.attackBtn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onAttack();
      this.pulseButton(this.attackBtn);
    });

    this.dodgeBtn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onDodge();
      this.pulseButton(this.dodgeBtn);
    });

    this.talkBtn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onTalk("achilles_01");
      this.pulseButton(this.talkBtn);
    });

    this.astraBtn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onTalk("astra");
      this.pulseButton(this.astraBtn);
    });

    this.warBtn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onWarTrigger?.();
      this.pulseButton(this.warBtn);
    });

    // Mic push-to-talk / toggle on mobile
    this.micBtn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onMicStart?.();
      this.micBtn.classList.add("recording");
    });
    this.micBtn.addEventListener("touchend", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onMicEnd?.();
      this.micBtn.classList.remove("recording");
    });

    // Joystick Touch Zone
    const joystickZone = this.container.querySelector<HTMLElement>("#joystick-zone")!;

    joystickZone.addEventListener(
      "touchstart",
      (e) => {
        const te = e as TouchEvent;
        te.preventDefault();
        te.stopPropagation();
        if (this.joystickTouchId !== null) return;
        const touch = te.changedTouches[0];
        this.joystickTouchId = touch.identifier;

        // Position joystick center at touch or use fixed base center
        const rect = this.joystickBase.getBoundingClientRect();
        this.joystickCenter = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
        this.updateJoystick(touch.clientX, touch.clientY);
      },
      { passive: false },
    );

    window.addEventListener(
      "touchmove",
      (e) => {
        const te = e as TouchEvent;
        // Handle Joystick
        for (let i = 0; i < te.changedTouches.length; i++) {
          const t = te.changedTouches[i];
          if (t.identifier === this.joystickTouchId) {
            te.preventDefault();
            this.updateJoystick(t.clientX, t.clientY);
          } else if (t.identifier === this.lookTouchId) {
            // Handle Camera Swipe
            te.preventDefault();
            const dx = t.clientX - this.lastLookPos.x;
            const dy = t.clientY - this.lastLookPos.y;
            this.lastLookPos.x = t.clientX;
            this.lastLookPos.y = t.clientY;

            // Sensitivity tuned for touch screens
            const yawFactor = 0.005;
            const pitchFactor = 0.0035;
            this.callbacks.onCameraRotate(dx * yawFactor, dy * pitchFactor);
          }
        }
      },
      { passive: false },
    );

    const endTouch = (e: Event) => {
      const te = e as TouchEvent;
      for (let i = 0; i < te.changedTouches.length; i++) {
        const t = te.changedTouches[i];
        if (t.identifier === this.joystickTouchId) {
          this.resetJoystick();
        } else if (t.identifier === this.lookTouchId) {
          this.lookTouchId = null;
        }
      }
    };

    window.addEventListener("touchend", endTouch, { passive: true });
    window.addEventListener("touchcancel", endTouch, { passive: true });

    // Right-Screen Touch Camera Drag
    window.addEventListener(
      "touchstart",
      (e) => {
        const te = e as TouchEvent;
        for (let i = 0; i < te.changedTouches.length; i++) {
          const t = te.changedTouches[i];
          // If touch is on right 55% of screen and not on a button/joystick
          const isRightSide = t.clientX > window.innerWidth * 0.4;
          const target = t.target as HTMLElement | null;
          const isInteractive = target?.closest?.("button, input, a, #chat, #joystick-zone, #hologram, #gamification-hud");

          if (isRightSide && !isInteractive && this.lookTouchId === null) {
            this.lookTouchId = t.identifier;
            this.lastLookPos = { x: t.clientX, y: t.clientY };
          }
        }
      },
      { passive: true },
    );

    // Orientation change listener
    window.addEventListener("resize", () => {
      this.checkOrientation();
    });
    window.addEventListener("orientationchange", () => {
      setTimeout(() => this.checkOrientation(), 200);
    });
  }

  private updateJoystick(clientX: number, clientY: number): void {
    const dx = clientX - this.joystickCenter.x;
    const dy = clientY - this.joystickCenter.y;
    const dist = Math.hypot(dx, dy);

    const clampedDist = Math.min(this.joystickRadius, dist);
    const angle = Math.atan2(dy, dx);

    const knobX = Math.cos(angle) * clampedDist;
    const knobY = Math.sin(angle) * clampedDist;

    this.joystickKnob.style.transform = `translate(${knobX}px, ${knobY}px)`;

    // Deadzone
    if (dist < 8) {
      this.moveState.forward = 0;
      this.moveState.strafe = 0;
      this.moveState.run = false;
      return;
    }

    // Normalized input (-1 to 1)
    const normDist = clampedDist / this.joystickRadius;
    this.moveState.forward = -Math.sin(angle) * normDist; // up is positive forward
    this.moveState.strafe = Math.cos(angle) * normDist;  // right is positive strafe
    this.moveState.run = normDist > 0.75;
  }

  private resetJoystick(): void {
    this.joystickTouchId = null;
    this.joystickKnob.style.transform = "translate(0px, 0px)";
    this.moveState.forward = 0;
    this.moveState.strafe = 0;
    this.moveState.run = false;
  }

  private pulseButton(btn: HTMLElement): void {
    btn.classList.add("pressed");
    setTimeout(() => btn.classList.remove("pressed"), 180);
  }

  private checkOrientation(): void {
    const isPortrait = window.innerHeight > window.innerWidth && window.innerWidth < 800;
    if (isPortrait && this.isTouch) {
      this.orientationBanner.classList.remove("hidden");
    } else {
      this.orientationBanner.classList.add("hidden");
    }
  }

  private toggleFullscreen(): void {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  /** Called by main loop to get current touch movement input */
  getMoveInput(): { forward: number; strafe: number; run: boolean } {
    return this.moveState;
  }

  /** Set contextual talk button visibility when near Achilles */
  setTalkVisible(visible: boolean, label = "Parler"): void {
    if (visible) {
      this.talkBtn.classList.remove("hidden");
      this.talkBtn.querySelector(".btn-text")!.textContent = label;
    } else {
      this.talkBtn.classList.add("hidden");
    }
  }

  destroy(): void {
    this.container.remove();
  }
}
