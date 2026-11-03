// Material-like reveal windows as CSS clip-path shapes.
// revealPath(type, seed, e, rough): e = 0 hidden … 1 fully open.
// Shapes are seeded per panel (stable, no per-frame random noise), so the
// same scroll position always produces the same edge.
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const f = n => n.toFixed(2) + '%';
const noise = (seed, t) =>
  Math.sin(t * 6.3 + seed) * .5 + Math.sin(t * 17.1 + seed * 2.3) * .3 + Math.sin(t * 41.7 + seed * 5.1) * .2;
const poly = pts => `polygon(${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(',')})`;

function ragged(seed, e, rough) {
  const k = 1 - e, a = rough ?? (.5 + 3 * k);
  const x0 = k * 22, x1 = 100 - k * 22, y0 = k * 42, y1 = 100 - k * 42, n = 16, pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push([x0 + (x1 - x0) * t, y0 + noise(seed, t) * a]); }
  for (let i = 1; i <= n; i++) { const t = i / n; pts.push([x1 + noise(seed + 1, t) * a, y0 + (y1 - y0) * t]); }
  for (let i = 1; i <= n; i++) { const t = i / n; pts.push([x1 - (x1 - x0) * t, y1 + noise(seed + 2, t) * a]); }
  for (let i = 1; i < n; i++) { const t = i / n; pts.push([x0 + noise(seed + 3, t) * a, y1 - (y1 - y0) * t]); }
  return poly(pts);
}

function edgeSweep(seed, e, {dir = 'x', amp = 6, freq = 1, sharp = false, lumps = false, span = 30} = {}) {
  // a single boundary sweeping across the panel; everything behind it is revealed
  const n = 28, pts = [], base = -span / 2 + e * (100 + span);
  const off = t => {
    if (sharp) return ((Math.floor(t * n) % 2 ? 1 : -1) * amp * .6) + noise(seed, t * freq) * amp * .5;
    if (lumps) return -Math.abs(Math.sin(t * Math.PI * 5 * freq + seed)) * amp - noise(seed, t) * 2;
    return noise(seed, t * freq) * amp;
  };
  if (dir === 'x') { // left → right
    pts.push([-1, -1]);
    for (let i = 0; i <= n; i++) { const t = i / n; pts.push([base + off(t), t * 102 - 1]); }
    pts.push([-1, 101]);
  } else if (dir === 'up') { // bottom → top
    pts.push([-1, 101]);
    for (let i = 0; i <= n; i++) { const t = i / n; pts.push([t * 102 - 1, 100 - base + off(t)]); }
    pts.push([101, 101]);
  } else if (dir === 'down') { // top → bottom (torn paper)
    pts.push([-1, -1]);
    for (let i = 0; i <= n; i++) { const t = i / n; pts.push([t * 102 - 1, base - off(t)]); }
    pts.push([101, -1]);
  } else if (dir === 'diag') { // top-left → bottom-right
    pts.push([-1, -1]);
    for (let i = 0; i <= n; i++) { const t = i / n; pts.push([base * 1.7 - t * 70 + off(t), t * 102 - 1]); }
    pts.push([-1, 101]);
  }
  return poly(pts);
}

function slices(seed, e) {
  const n = 7, pts = [[0, 0]];
  for (let i = 0; i < n; i++) {
    const w = clamp(e * 1.55 - ((i * 3 + Math.floor(seed)) % n) * .075) * 101;
    pts.push([w, i / n * 100], [w, (i + 1) / n * 100]);
  }
  pts.push([0, 100]);
  return poly(pts);
}

export function revealPath(type, seed, e, rough) {
  e = clamp(e);
  switch (type) {
    case 'brush': return edgeSweep(seed, e, {dir: 'x', amp: 7, freq: 2});
    case 'slices': return slices(seed, e);
    case 'crack': return edgeSweep(seed, e, {dir: 'diag', amp: 7, sharp: true});
    case 'wave': return edgeSweep(seed, e, {dir: 'up', amp: 5, freq: .6});
    case 'surf': return edgeSweep(seed, e, {dir: 'x', amp: 12, freq: .45, span: 36});
    case 'clouds': return edgeSweep(seed, e, {dir: 'up', amp: 9, lumps: true, span: 40});
    case 'tear': return edgeSweep(seed, e, {dir: 'down', amp: 3.5, freq: 3});
    case 'iris': {
      const cx = 50 + Math.sin(seed) * 12, cy = 50 + Math.cos(seed * 1.7) * 10;
      return `circle(${(e * 80).toFixed(2)}% at ${f(cx)} ${f(cy)})`;
    }
    case 'slam': {
      const k = (1 - e) * 50;
      return `inset(${f(k * .9)} ${f(k)} ${f(k * .9)} ${f(k)})`;
    }
    default: return ragged(seed, e, rough);
  }
}
