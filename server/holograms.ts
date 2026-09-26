const PUZZLE_LOCK_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  body { margin:0; background:transparent; color:#7ff; font-family:monospace; text-align:center; user-select:none; }
  h2 { margin:8px 0 4px; font-size:16px; letter-spacing:2px; }
  p { margin:0 0 6px; font-size:12px; opacity:.8; }
  canvas { cursor:pointer; }
</style></head><body>
<h2>VERROU TEMPOREL</h2>
<p>Clique sur les anneaux pour aligner les trois brèches vers le haut.</p>
<canvas id="c" width="260" height="260"></canvas>
<script>
  window.gameAPI = window.gameAPI || {
    onPuzzleSolved: (id) => parent.postMessage({ type: "puzzle_solved", puzzle_id: id }, "*"),
  };
  const c = document.getElementById("c"), g = c.getContext("2d");
  const STEP = Math.PI / 4, radii = [40, 70, 100];
  const rings = radii.map(() => (1 + Math.floor(Math.random() * 7)) * STEP);
  let solved = false;
  function draw() {
    g.clearRect(0, 0, 260, 260);
    radii.forEach((r, i) => {
      const gap = 0.5, start = rings[i] - Math.PI / 2 + gap / 2;
      g.beginPath(); g.lineWidth = 14;
      g.strokeStyle = solved ? "#6f6" : "rgba(120,255,255,.85)";
      g.arc(130, 130, r, start, start + Math.PI * 2 - gap); g.stroke();
    });
    g.fillStyle = "#ff6"; g.beginPath(); g.moveTo(130, 8); g.lineTo(124, 0); g.lineTo(136, 0); g.fill();
  }
  c.addEventListener("click", (e) => {
    if (solved) return;
    const b = c.getBoundingClientRect(), d = Math.hypot(e.clientX - b.left - 130, e.clientY - b.top - 130);
    const i = radii.findIndex((r) => Math.abs(d - r) < 15);
    if (i < 0) return;
    rings[i] = (rings[i] + STEP) % (Math.PI * 2);
    if (rings.every((a) => a < 1e-6 || Math.abs(a - Math.PI * 2) < 1e-6)) {
      solved = true; draw();
      setTimeout(() => window.gameAPI.onPuzzleSolved("puzzle_lock"), 600);
    }
    draw();
  });
  draw();
</script></body></html>`;

const HOLOGRAMS: Record<string, { puzzle_id: string; html: string }> = {
  generate_puzzle_lock: { puzzle_id: "puzzle_lock", html: PUZZLE_LOCK_HTML },
};

export function generateHologram(trigger: string): { puzzle_id: string; html: string } | null {
  return HOLOGRAMS[trigger] ?? null;
}
