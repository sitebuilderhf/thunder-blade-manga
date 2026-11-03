// Per-theme atmosphere and signature effects.
// Particles are ambient (they live in the world), but every story-relevant
// effect — flashes, shakes, background colour, HUD values — is a pure function
// of scroll position so it holds when the reader stops.
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
function gradientAt(stops, t) {
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0] || i === stops.length - 1) {
      const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
      const k = clamp((t - t0) / Math.max(1e-6, t1 - t0)), a = hex(c0), b = hex(c1);
      return `rgb(${a.map((v, j) => Math.round(lerp(v, b[j], k))).join(',')})`;
    }
  }
  return stops[0][1];
}

// ── particle kinds ───────────────────────────────────────────────────────
const KINDS = {
  rain: {spawn: (w, h) => ({x: Math.random() * w * 1.3, y: Math.random() * h, l: 14 + Math.random() * 26, v: .9 + Math.random() * .7, d: .4 + Math.random() * .8}),
    step: (p, dt, w, h, s) => { p.y += (p.v * dt + s * p.d) ; p.x -= p.v * dt * .28; if (p.y > h + 40) { p.y = -40; p.x = Math.random() * w * 1.3; } },
    draw: (c, p, col) => { c.strokeStyle = col; c.lineWidth = p.d * 1.3; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + p.l * .28, p.y - p.l); c.stroke(); }},
  embers: {spawn: (w, h) => ({x: Math.random() * w, y: h + Math.random() * h, r: .8 + Math.random() * 2.6, v: .03 + Math.random() * .09, ph: Math.random() * 6, d: .3 + Math.random()}),
    step: (p, dt, w, h, s) => { p.y -= p.v * dt + s * p.d * .5; p.x += Math.sin(p.y * .01 + p.ph) * .5; if (p.y < -20) { p.y = h + 20; p.x = Math.random() * w; } },
    draw: (c, p, col, t) => { const a = .55 + .45 * Math.sin(t * .006 + p.ph); c.globalAlpha = a; c.fillStyle = col; c.beginPath(); c.arc(p.x, p.y, p.r, 0, 7); c.fill(); c.globalAlpha = a * .25; c.beginPath(); c.arc(p.x, p.y, p.r * 4, 0, 7); c.fill(); c.globalAlpha = 1; }},
  leaves: {spawn: (w, h) => ({x: Math.random() * w, y: Math.random() * h, r: 6 + Math.random() * 10, v: .03 + Math.random() * .05, a: Math.random() * 6, va: (Math.random() - .5) * .004, ph: Math.random() * 6, d: .4 + Math.random()}),
    step: (p, dt, w, h, s) => { p.y += p.v * dt + s * p.d * .7; p.x += Math.sin(p.y * .008 + p.ph) * .9 - .25; p.a += p.va * dt; if (p.y > h + 30) { p.y = -30; p.x = Math.random() * w * 1.2; } },
    draw: (c, p, col) => { c.save(); c.translate(p.x, p.y); c.rotate(p.a); c.fillStyle = col; c.beginPath();
      for (let i = 0; i < 5; i++) { const t = i / 5 * Math.PI * 2 - Math.PI / 2; c.lineTo(Math.cos(t) * p.r, Math.sin(t) * p.r); const t2 = t + Math.PI / 5; c.lineTo(Math.cos(t2) * p.r * .45, Math.sin(t2) * p.r * .45); }
      c.fill(); c.restore(); }},
  snow: {spawn: (w, h) => ({x: Math.random() * w, y: Math.random() * h, r: .6 + Math.random() * 2.4, v: .02 + Math.random() * .06, ph: Math.random() * 6, d: .3 + Math.random()}),
    step: (p, dt, w, h, s) => { p.y += p.v * dt + s * p.d * .6; p.x += Math.sin(p.y * .01 + p.ph) * .4 - .6; if (p.y > h + 10) { p.y = -10; p.x = Math.random() * w * 1.3; } if (p.x < -10) p.x = w + 10; },
    draw: (c, p, col) => { c.fillStyle = col; c.beginPath(); c.arc(p.x, p.y, p.r, 0, 7); c.fill(); }},
  bubbles: {spawn: (w, h) => ({x: Math.random() * w, y: h + Math.random() * h, r: 1.5 + Math.random() * 7, v: .03 + Math.random() * .08, ph: Math.random() * 6, d: .3 + Math.random()}),
    step: (p, dt, w, h, s) => { p.y -= p.v * dt + s * p.d * .4; p.x += Math.sin(p.y * .02 + p.ph) * .6; if (p.y < -20) { p.y = h + 20; p.x = Math.random() * w; } },
    draw: (c, p, col) => { c.strokeStyle = col; c.lineWidth = 1; c.beginPath(); c.arc(p.x, p.y, p.r, 0, 7); c.stroke(); c.fillStyle = col; c.beginPath(); c.arc(p.x - p.r * .35, p.y - p.r * .35, p.r * .22, 0, 7); c.fill(); }},
  dust: {spawn: (w, h) => ({x: Math.random() * w, y: Math.random() * h, r: .6 + Math.random() * 2.2, v: .04 + Math.random() * .12, ph: Math.random() * 6, d: .3 + Math.random()}),
    step: (p, dt, w, h, s) => { p.x += p.v * dt; p.y += Math.sin(p.x * .01 + p.ph) * .3 + s * p.d * .4; if (p.x > w + 10) { p.x = -10; p.y = Math.random() * h; } if (p.y > h + 10) p.y = -10; if (p.y < -10) p.y = h + 10; },
    draw: (c, p, col, t) => { c.globalAlpha = .4 + .5 * Math.abs(Math.sin(t * .002 + p.ph)); c.fillStyle = col; c.beginPath(); c.arc(p.x, p.y, p.r, 0, 7); c.fill(); c.globalAlpha = 1; }},
  orbs: {spawn: (w, h) => ({x: Math.random() * w, y: Math.random() * h, r: 3 + Math.random() * 7, v: .01 + Math.random() * .03, ph: Math.random() * 6, d: .2 + Math.random() * .6}),
    step: (p, dt, w, h, s) => { p.y -= p.v * dt + s * p.d * .3; p.x += Math.sin(p.y * .006 + p.ph) * .5; if (p.y < -30) { p.y = h + 30; p.x = Math.random() * w; } },
    draw: (c, p, col, t) => { const a = .35 + .35 * Math.sin(t * .003 + p.ph); const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3); g.addColorStop(0, col); g.addColorStop(1, 'transparent'); c.globalAlpha = a; c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, p.r * 3, 0, 7); c.fill(); c.globalAlpha = 1; }},
  clouds: {spawn: (w, h) => ({x: Math.random() * w * 1.4 - w * .2, y: Math.random() * h, r: 80 + Math.random() * 200, v: .006 + Math.random() * .02, d: .2 + Math.random() * .9}),
    step: (p, dt, w, h, s) => { p.x += p.v * dt; p.y += s * p.d * 1.4; if (p.x - p.r > w) { p.x = -p.r; } if (p.y > h + p.r) p.y = -p.r; if (p.y < -p.r) p.y = h + p.r; },
    draw: (c, p, col) => { const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r); g.addColorStop(0, col); g.addColorStop(1, 'transparent'); c.fillStyle = g; c.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2); }},
  sparks: {spawn: (w, h) => ({x: Math.random() * w, y: Math.random() * h, l: 6 + Math.random() * 20, v: .2 + Math.random() * .5, a: -Math.PI / 2 + (Math.random() - .5) * 1.4, life: Math.random(), d: .3 + Math.random()}),
    step: (p, dt, w, h, s) => { p.x += Math.cos(p.a) * p.v * dt; p.y += Math.sin(p.a) * p.v * dt + s * p.d * .4; p.life -= dt * .0006; if (p.life < 0 || p.y < -20) Object.assign(p, KINDS.sparks.spawn(w, h), {y: h + 10, life: 1}); },
    draw: (c, p, col) => { c.globalAlpha = clamp(p.life * 1.5); c.strokeStyle = col; c.lineWidth = 1.4; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - Math.cos(p.a) * p.l, p.y - Math.sin(p.a) * p.l); c.stroke(); c.globalAlpha = 1; }},
};

function layer(cls, z) {
  const c = document.createElement('canvas'); c.className = 'fx-canvas ' + cls; c.style.zIndex = z;
  c.setAttribute('aria-hidden', 'true'); document.body.append(c); return c;
}

export function createFx(cfg, panels) {
  const conf = cfg.fx || {};
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const back = layer('fx-back', 0), front = layer('fx-front', 40);
  const bctx = back.getContext('2d'), fctx = front.getContext('2d');
  const groups = (conf.particles || []).map(g => ({...g, kind: KINDS[g.kind], items: []}));
  let W = 0, H = 0, dpr = 1;
  function resize() {
    dpr = Math.min(1.5, devicePixelRatio || 1); W = innerWidth; H = innerHeight;
    for (const c of [back, front]) { c.width = W * dpr; c.height = H * dpr; }
    const scale = Math.min(1, W / 1400) * (W < 760 ? .55 : 1);
    for (const g of groups) {
      const n = Math.round((g.count || 60) * scale);
      while (g.items.length < n) g.items.push(g.kind.spawn(W, H));
      g.items.length = n;
    }
  }
  resize(); addEventListener('resize', resize);

  const flash = document.createElement('div'); flash.className = 'fx-flash'; document.body.append(flash);
  let hud = null;
  if (conf.hud) { hud = document.createElement('div'); hud.className = 'hud hud-' + conf.hud; hud.setAttribute('aria-hidden', 'true'); document.body.append(hud); }

  let impact = 0, flashBoost = 0;
  return {
    measure() {},
    tick(t, dt, y, vel, g) {
      if (conf.bg) document.body.style.backgroundColor = gradientAt(conf.bg, g);
      if (conf.rgb) document.body.style.setProperty('--rgb', clamp(Math.abs(vel) * .6, 0, 6).toFixed(2) + 'px');
      if (reduced) return;
      const s = -vel * dt * .35; // scroll pulls the atmosphere with the page
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0); fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bctx.clearRect(0, 0, W, H); fctx.clearRect(0, 0, W, H);
      for (const g of groups) {
        const c = g.layer === 'front' ? fctx : bctx;
        c.globalCompositeOperation = g.blend || 'source-over';
        for (const p of g.items) { g.kind.step(p, dt * (g.speed || 1), W, H, s); g.kind.draw(c, p, g.color, t); }
        c.globalCompositeOperation = 'source-over';
      }
    },
    begin() { impact = 0; flashBoost = 0; },
    opening(o) {
      if (conf.hud === 'depth') impact = 0;
    },
    panel(p, prog, r = 1) {
      const k = p.impact || 0;
      impact = Math.max(impact, k);
      const f = p.frame.style;
      let tx = 0, ty = 0, rot = 0;
      if (conf.shake && k > 0) { const a = k * (conf.shake || 10); tx = Math.sin(prog * 900) * a; ty = Math.cos(prog * 700) * a * .7; }
      if (conf.tilt) rot = Math.sin(prog * Math.PI * 2 + p.seed) * conf.tilt;
      if (conf.bob) ty += Math.sin(prog * Math.PI * 2 + p.seed) * conf.bob;
      const sc = 1 + (1 - r) * (conf.punch ?? .07); // panel lands with a small zoom punch as it opens
      f.transform = `translate3d(${tx.toFixed(1)}px,${ty.toFixed(1)}px,0) rotate(${rot.toFixed(2)}deg) scale(${sc.toFixed(4)})`;
    },
    finale(fp, hit) { flashBoost = Math.max(flashBoost, hit * .5); },
    end(y) {
      const a = conf.flash ? Math.pow(impact, 2) * (conf.flashAlpha ?? .55) + flashBoost : 0;
      flash.style.opacity = a.toFixed(3);
      if (hud) {
        const max = Math.max(1, document.documentElement.scrollHeight - innerHeight), g = clamp(y / max);
        if (conf.hud === 'depth') hud.innerHTML = `<b>${Math.round(lerp(0, 11034, g)).toLocaleString('en-US')}</b><span>m · depth</span><i style="--g:${g}"></i>`;
        if (conf.hud === 'round') { const left = Math.round((1 - g) * 180); hud.innerHTML = `<span>ROUND</span><b>12</b><span>${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</span>`; }
        if (conf.hud === 'altitude') hud.innerHTML = `<b>${Math.round(lerp(3200, 9100, g)).toLocaleString('en-US')}</b><span>m · altitude</span><i style="--g:${g}"></i>`;
        if (conf.hud === 'temp') hud.innerHTML = `<b>${Math.round(lerp(900, 1480, g))}</b><span>°C · lava</span><i style="--g:${g}"></i>`;
      }
    },
  };
}
