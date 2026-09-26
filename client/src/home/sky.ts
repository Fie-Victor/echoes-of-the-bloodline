interface Star {
  x: number;
  y: number;
  z: number;
}

/** Starfield with slow rotating chronometer rings; `warp()` streaks stars toward the viewer. */
export class Sky {
  private ctx: CanvasRenderingContext2D;
  private stars: Star[] = [];
  private speed = 0.0006;
  private target = 0.0006;
  private accent = "#e0a64a";
  private t = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    for (let i = 0; i < 420; i++) this.stars.push(this.spawn(Math.random()));
    window.addEventListener("resize", () => this.resize());
    this.resize();
    requestAnimationFrame(this.frame);
  }

  setAccent(c: string): void {
    this.accent = c;
  }

  warp(): void {
    this.target = 0.03;
  }

  private spawn(z: number): Star {
    return { x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2, z };
  }

  private resize(): void {
    const dpr = Math.min(devicePixelRatio, 1.5);
    this.canvas.width = innerWidth * dpr;
    this.canvas.height = innerHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private frame = (): void => {
    const { ctx } = this;
    const w = innerWidth;
    const h = innerHeight;
    this.t += 1 / 60;
    this.speed += (this.target - this.speed) * 0.03;
    ctx.fillStyle = this.speed > 0.004 ? "rgba(6,6,14,0.35)" : "#07070f";
    ctx.fillRect(0, 0, w, h);

    const g = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, Math.max(w, h) * 0.6);
    g.addColorStop(0, hexA(this.accent, 0.16));
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h * 0.45;
    const f = Math.min(w, h) * 0.9;
    for (const s of this.stars) {
      const pz = s.z;
      s.z -= this.speed;
      if (s.z <= 0.02) Object.assign(s, this.spawn(1));
      const sx = cx + (s.x / s.z) * f * 0.5;
      const sy = cy + (s.y / s.z) * f * 0.5;
      const px = cx + (s.x / pz) * f * 0.5;
      const py = cy + (s.y / pz) * f * 0.5;
      const a = Math.min(1, (1 - s.z) * 1.4);
      ctx.strokeStyle = `rgba(255,240,215,${a})`;
      ctx.lineWidth = Math.max(0.6, (1 - s.z) * 2);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(sx + 0.1, sy + 0.1);
      ctx.stroke();
    }

    // Chronometer rings.
    ctx.save();
    ctx.translate(cx, cy);
    const R = Math.min(w, h) * 0.42;
    for (let r = 0; r < 3; r++) {
      const rad = R * (1 + r * 0.28);
      ctx.rotate(this.t * 0.02 * (r % 2 ? -1 : 1));
      ctx.strokeStyle = hexA(this.accent, 0.12 - r * 0.03);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, rad, 0, Math.PI * 2);
      ctx.stroke();
      const ticks = 60;
      for (let i = 0; i < ticks; i++) {
        const ang = (i / ticks) * Math.PI * 2;
        const len = i % 5 === 0 ? 12 : 5;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
        ctx.lineTo(Math.cos(ang) * (rad - len), Math.sin(ang) * (rad - len));
        ctx.stroke();
      }
    }
    ctx.restore();
    requestAnimationFrame(this.frame);
  };
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, a)})`;
}
