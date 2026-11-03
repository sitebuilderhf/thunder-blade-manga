// Scroll-driven animated manga reader.
// The document scroll position is the only clock for the story: every panel's
// video time, reveal mask, dialogue and SFX are pure functions of scrollY, so
// scrolling back reconstructs the exact same state and stopping holds it.
// Video time is quantised to `stepFps` (default 12 = animation "on twos"),
// which gives the deliberate stop-motion feel while scrubbing.
import {revealPath} from './reveals.mjs';
import {createFx} from './fx.mjs';

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;
const mobile = () => innerWidth < 760;

const cfg = await fetch('site.json').then(r => r.json());
const root = document.documentElement;
root.dataset.theme = cfg.theme;
for (const [k, v] of Object.entries(cfg.vars || {})) root.style.setProperty('--' + k, v);
document.title = `${cfg.title} — ${cfg.jp}`;

const STEP = 1 / (cfg.stepFps || 12);
const app = document.querySelector('#app');
const panels = [];

// ── media ────────────────────────────────────────────────────────────────
// Blob-backed video keeps random seeking independent of server range support.
const blobCache = new Map();
let activeLoads = 0; const queue = [];
function loadBlob(url, priority) {
  if (blobCache.has(url)) return blobCache.get(url);
  const p = new Promise((resolve, reject) => queue.push({url, priority, resolve, reject}));
  blobCache.set(url, p); pump(); return p;
}
function pump() {
  queue.sort((a, b) => a.priority() - b.priority());
  while (activeLoads < 3 && queue.length) {
    const job = queue.shift(); activeLoads++;
    fetch(job.url).then(r => { if (!r.ok) throw Error(r.status); return r.blob(); })
      .then(b => job.resolve(URL.createObjectURL(b)), job.reject)
      .finally(() => { activeLoads--; pump(); });
  }
}

function makeMedia(item, host) {
  const img = new Image(); img.alt = item.alt || ''; img.decoding = 'async'; img.src = item.poster;
  img.className = 'poster'; host.append(img);
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.disablePictureInPicture = true;
  v.setAttribute('aria-hidden', 'true'); host.append(v);
  const m = {item, img, v, src: null, ready: false, desired: 0, wanted: false};
  // Reveal the video only once a decoded frame has actually been presented;
  // until then the poster (= frame 0) stays visible, so there is never a black box.
  const reveal = () => v.classList.add('on');
  const shown = () => {
    if (v.readyState < 2 || v.seeking) return;
    m.ready = true;
    if (!v.classList.contains('on')) { if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(reveal); else reveal(); }
    seek(m);
  };
  v.addEventListener('loadeddata', shown); v.addEventListener('seeked', shown);
  return m;
}
function want(m, yes, priority) {
  if (yes && !m.src && !m.loading && m.item.video) {
    m.loading = true;
    loadBlob(m.item.video, priority).then(url => { m.src = url; m.v.src = url; m.v.load(); }).catch(() => { m.loading = false; });
  }
}
function seek(m) {
  const v = m.v; if (!m.ready || v.seeking) return;
  const dur = Number.isFinite(v.duration) ? v.duration : (m.item.duration || 5);
  const t = clamp(m.desired, 0, Math.max(0, dur - 0.05));
  if (Math.abs(v.currentTime - t) > STEP * 0.45) v.currentTime = t;
}
function setTime(m, progress) {
  const dur = Number.isFinite(m.v.duration) ? m.v.duration : (m.item.duration || 5);
  const raw = clamp(progress) * Math.max(0, dur - 0.08);
  m.desired = Math.floor(raw / STEP) * STEP; // stop-motion quantisation
  seek(m);
}

// ── text layers ──────────────────────────────────────────────────────────
const NARRATOR = /Narrator|Radio|Commentator|Herald|Captain|Bosun/;
function bubbleEl(line, i) {
  const el = document.createElement('div');
  const caption = NARRATOR.test(line.who);
  const shout = line.shout ?? (!caption && line.text.length <= 16 && /[!?…]$|^[A-Z!?.… ]+$/.test(line.text));
  el.className = 'bubble ' + (caption ? 'caption' : 'speech') + (shout ? ' shout' : '');
  el.dataset.side = line.side || ['tl', 'br', 'tr', 'bl'][i % 4];
  el.innerHTML = `${caption ? `<b>${line.who}</b>` : ''}<span></span>`;
  el.querySelector('span').textContent = line.text;
  if (!caption) el.setAttribute('aria-label', `${line.who}: ${line.text}`);
  if (line.x !== undefined) { el.style.left = line.x + '%'; el.style.top = line.y + '%'; el.dataset.side = 'pos'; }
  return el;
}
function sfxEl(s) {
  const el = document.createElement('div'); el.className = 'sfx'; el.setAttribute('aria-hidden', 'true');
  el.textContent = s.text; el.style.left = s.x + '%'; el.style.top = s.y + '%';
  el.style.setProperty('--rot', (s.rot || -8) + 'deg');
  return el;
}

// ── opening ──────────────────────────────────────────────────────────────
const op = cfg.opening;
const opening = document.createElement('header'); opening.className = 'opening';
opening.innerHTML = `<div class="op-stage"><div class="op-frame"><div class="op-media"></div></div>
  <div class="op-title"><span class="op-jp">${cfg.jp}</span><h1>${cfg.title}</h1><p>${cfg.tagline}</p></div>
  <div class="op-hint">scroll ↓</div></div>`;
app.append(opening);
const opMedia = makeMedia(op, opening.querySelector('.op-media'));
opening.style.setProperty('--focus', (op.focus ?? 30) + '%');
const opFrame = opening.querySelector('.op-frame');
const opTitle = opening.querySelector('.op-title');
const opHint = opening.querySelector('.op-hint');

// ── story panels ─────────────────────────────────────────────────────────
const story = document.createElement('main'); story.className = 'story'; app.append(story);
let track = null;
function addPanel(item, host) {
  let parent = host;
  if (item.track) { // horizontal sticky track (vertical scroll drives a sideways strip)
    if (!track) {
      track = {el: document.createElement('section'), panels: []};
      track.el.className = 'h-track'; track.el.innerHTML = '<div class="h-stage"><div class="h-strip"></div></div>';
      host.append(track.el);
    }
    parent = track.el.querySelector('.h-strip');
  }
  const el = document.createElement('figure'); el.className = 'panel'; el.id = item.id;
  el.dataset.reveal = item.reveal || cfg.reveal || 'ragged';
  const L = item.layout || {};
  el.style.setProperty('--ar', item.ar);
  el.style.setProperty('--w', (L.w ?? 80) + 'vw'); el.style.setProperty('--wm', (L.wm ?? 92) + 'vw');
  el.style.setProperty('--mt', (L.mt ?? 6) + 'vh'); el.style.setProperty('--mtm', (L.mtm ?? Math.max(-4, (L.mt ?? 6) * .4)) + 'vh');
  el.style.setProperty('--z', L.z ?? 1);
  el.dataset.align = L.align || 'center';
  if (L.shift) el.style.setProperty('--shift', L.shift + 'vw');
  el.innerHTML = `<div class="frame"><div class="media"></div>${item.sfx ? '<div class="burst" aria-hidden="true"></div>' : ''}</div><div class="layer"></div>`;
  parent.append(el);
  const m = makeMedia(item, el.querySelector('.media'));
  const layer = el.querySelector('.layer');
  const bubbles = (item.lines || []).map((l, i) => { const b = bubbleEl(l, i); layer.append(b); return b; });
  const sfx = item.sfx ? sfxEl(item.sfx) : null; if (sfx) layer.append(sfx);
  const p = {item, el, frame: el.querySelector('.frame'), m, bubbles, sfx, seed: panels.length * 7.13 + 1, track: item.track ? track : null};
  if (item.track) track.panels.push(p);
  panels.push(p);
}
for (const item of cfg.panels) addPanel(item, story);

// ── finale ───────────────────────────────────────────────────────────────
const fin = cfg.finale;
const finale = document.createElement('section'); finale.className = 'finale';
finale.innerHTML = `<div class="fin-stage"><div class="fin-frame"><div class="fin-media"></div></div>
  <div class="fin-line"></div><div class="fin-sfx" aria-hidden="true"></div><div class="fin-flash"></div></div>`;
app.append(finale);
const finMedia = makeMedia(fin, finale.querySelector('.fin-media'));
const finFrame = finale.querySelector('.fin-frame');
const finLine = finale.querySelector('.fin-line'); finLine.textContent = fin.lines?.[0]?.text || '';
const finSfx = finale.querySelector('.fin-sfx'); finSfx.textContent = fin.sfx?.text || '';
const finFlash = finale.querySelector('.fin-flash');

// ── epilogue: the quiet aftermath after the finisher ─────────────────────
if (cfg.after?.length) {
  const epilogue = document.createElement('section'); epilogue.className = 'story epilogue'; app.append(epilogue);
  for (const item of cfg.after) addPanel(item, epilogue);
}

const end = document.createElement('footer'); end.className = 'end';
end.innerHTML = `<p class="end-mark">終</p><h2>End of Chapter&nbsp;1</h2><p class="end-sub">${cfg.title} · ${cfg.jp}</p>
  <button class="again" type="button">↑ Read again</button>`;
end.querySelector('.again').addEventListener('click', () => scrollTo({top: 0, behavior: 'smooth'}));
app.append(end);

const fx = createFx(cfg, panels);

// ── layout ───────────────────────────────────────────────────────────────
let vh = innerHeight, docMax = 1;
function measure() {
  vh = innerHeight;
  const y = scrollY;
  for (const p of panels) {
    const r = p.el.getBoundingClientRect();
    p.top = r.top + y; p.h = r.height; p.left = r.left; p.w = r.width;
  }
  if (track) {
    const strip = track.el.querySelector('.h-strip');
    track.span = Math.max(0, strip.scrollWidth - innerWidth);
    track.el.style.height = (vh + track.span) + 'px';
    const r = track.el.getBoundingClientRect(); track.top = r.top + y;
    for (const p of track.panels) p.trackX = p.el.offsetLeft;
  }
  const ro = opening.getBoundingClientRect(); opening.top = ro.top + y; opening.len = ro.height - vh;
  const rf = finale.getBoundingClientRect(); finale.top = rf.top + y; finale.len = rf.height - vh;
  docMax = Math.max(1, root.scrollHeight - vh);
  fx.measure?.(vh, docMax);
  dirty = true;
}

// ── frame ────────────────────────────────────────────────────────────────
let lastY = -1, dirty = true, lastT = performance.now(), vel = 0;
function draw(now) {
  requestAnimationFrame(draw);
  const y = scrollY, dt = Math.min(64, now - lastT); lastT = now;
  vel = lerp(vel, (y - (lastY < 0 ? y : lastY)) / Math.max(1, dt), 0.2);
  fx.tick(now, dt, y, vel, y / docMax);
  if (y === lastY && !dirty) return;
  lastY = y; dirty = false;
  fx.begin?.(y);

  // opening: full-bleed hero contracts into a framed panel on paper
  {
    const o = clamp((y - opening.top) / Math.max(1, opening.len));
    want(opMedia, true, () => -1);
    setTime(opMedia, o);
    const c = smooth(clamp((o - .3) / .55));
    const ix = c * (mobile() ? 4 : 9), iy = c * (mobile() ? 16 : 13);
    opFrame.style.setProperty('--ix', ix + 'vw'); opFrame.style.setProperty('--iy', iy + 'vh');
    opFrame.style.setProperty('--edge', c.toFixed(3));
    opFrame.style.clipPath = c > .002 ? revealPath('ragged', 4.2, 1, c * 1.4) : 'none';
    opFrame.style.setProperty('--zoom', (1.12 - .12 * smooth(o)).toFixed(4));
    const t = smooth(clamp(o / .28));
    opTitle.style.opacity = (1 - t).toFixed(3);
    opTitle.style.transform = `translate3d(0,${(-t * 18).toFixed(2)}vh,0) scale(${1 + t * .25})`;
    opTitle.style.letterSpacing = (t * .3).toFixed(3) + 'em';
    opHint.style.opacity = (1 - clamp(o * 8)).toFixed(3);
    fx.opening?.(o, c);
  }

  // panels
  for (const p of panels) {
    let top = p.top, visibleSpan;
    if (p.track) {
      const tp = clamp((y - track.top) / Math.max(1, track.span));
      const x = -tp * track.span;
      track.el.querySelector('.h-strip').style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
      // progress along the strip: enters at right edge, leaves at left edge
      const sx = p.trackX + x;
      const prog = clamp((innerWidth - sx) / (innerWidth + p.w));
      const inView = y + vh > track.top && y < track.top + track.span + vh;
      applyPanel(p, prog, clamp((innerWidth - sx) / (innerWidth * .6)), inView);
      continue;
    }
    visibleSpan = vh + p.h;
    const prog = clamp((y + vh - top) / visibleSpan);
    const rev = clamp((y + vh - top) / (Math.min(p.h, vh) * .75 + vh * .12));
    const inView = top < y + vh && top + p.h > y;
    applyPanel(p, prog, rev, inView);
  }

  // finale: the finisher grows to full-bleed with an impact flash
  {
    const f = clamp((y - finale.top) / Math.max(1, finale.len));
    const near = finale.top < y + vh * 2.5;
    want(finMedia, near, () => Math.max(0, finale.top - y));
    setTime(finMedia, clamp(f / .85));
    const g = smooth(clamp(f / .55));
    finFrame.style.setProperty('--g', g.toFixed(4));
    finFrame.style.clipPath = g < .999 ? revealPath(cfg.finaleReveal || 'ragged', 9, g, 1 - g) : 'none';
    const hit = clamp(1 - Math.abs(f - .5) / .08);
    finFlash.style.opacity = (hit * hit * .85).toFixed(3);
    const s = clamp((f - .46) / .12);
    finSfx.style.opacity = s > 0 ? Math.min(1, s * 3).toFixed(3) : '0';
    finSfx.style.transform = `translate(-50%,-50%) rotate(-9deg) scale(${(2.6 - 1.5 * smooth(s)).toFixed(3)})`;
    const l = smooth(clamp((f - .62) / .2));
    finLine.style.opacity = l.toFixed(3); finLine.style.transform = `translate3d(-50%,${((1 - l) * 40).toFixed(1)}px,0)`;
    fx.finale?.(f, hit);
  }
  fx.end?.(y);
}

function applyPanel(p, prog, rev, inView) {
  const near = p.track ? inView : (p.top < scrollY + vh * 2.6 && p.top + p.h > scrollY - vh * 1.5);
  want(p.m, near, () => Math.abs(p.top - scrollY));
  if (!near && p.m.src && Math.abs(p.top - scrollY) > vh * 5) { // release far decoders
    p.m.v.removeAttribute('src'); p.m.v.load(); p.m.v.classList.remove('on'); p.m.src = null; p.m.loading = false; p.m.ready = false;
  }
  // video: spend most of the gesture while the art is actually readable
  const act = clamp((prog - .12) / .7);
  setTime(p.m, .25 * prog + .75 * act);
  // reveal
  const r = smooth(rev);
  p.frame.style.clipPath = r >= .999 ? 'none' : revealPath(p.el.dataset.reveal, p.seed, r, prog);
  p.el.style.setProperty('--r', r.toFixed(3));
  p.el.style.setProperty('--p', prog.toFixed(4));
  // parallax drift of the whole panel and counter-drift of the art
  const drift = (prog - .5);
  p.el.style.setProperty('--drift', (drift * (p.item.layout?.par ?? 40)).toFixed(1) + 'px');
  // dialogue: each balloon has its own reading moment
  p.bubbles.forEach((b, i) => {
    const at = .14 + i * .11;
    const e = smooth(clamp((prog - at) / .07));
    b.style.opacity = e.toFixed(3); // stays fully opaque once it has arrived — text is always readable
    b.style.transform = `translate3d(${((1 - e) * (i % 2 ? 26 : -26) + drift * (i % 2 ? -30 : 30)).toFixed(1)}px,${((1 - e) * 22 - drift * 46).toFixed(1)}px,0) scale(${(.92 + .08 * e).toFixed(3)})`;
  });
  // SFX: punches in big, then settles and drifts
  if (p.sfx) {
    const at = p.item.sfx.at ?? .38;
    const s = clamp((prog - at) / .09);
    const k = s > 0 ? 1 - Math.pow(1 - s, 3) : 0;
    const scale = s > 0 ? lerp(2.8, 1, k) + Math.sin(s * Math.PI) * .12 : 2.8;
    p.sfx.style.opacity = s > 0 ? Math.min(1, s * 2.5).toFixed(3) : '0';
    p.sfx.style.transform = `translate(-50%,-50%) rotate(var(--rot)) scale(${scale.toFixed(3)}) translate3d(${(drift * 40).toFixed(1)}px,${(-drift * 70).toFixed(1)}px,0)`;
    p.impact = clamp(1 - Math.abs(prog - at - .02) / .05);
    // speed-line burst swells around the hit and fades with the aftermath
    p.el.style.setProperty('--burst', (clamp((prog - at + .03) / .05) * (1 - clamp((prog - at - .06) / .18))).toFixed(3));
  } else p.impact = 0;
  fx.panel?.(p, prog, r);
}

// ── wheel smoothing (desktop only; touch momentum stays native) ──────────
{
  const fine = matchMedia('(any-pointer: fine)'), reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let target = scrollY, pos = scrollY, raf = 0, last = 0;
  const sens = cfg.wheel ?? .5;
  const tick = t => {
    raf = 0; const dt = Math.min(64, t - last); last = t;
    pos += (target - pos) * (1 - Math.exp(-dt / 140));
    if (Math.abs(target - pos) < .5) { scrollTo(0, target); return; }
    scrollTo(0, pos); raf = requestAnimationFrame(tick);
  };
  addEventListener('wheel', e => {
    if (!fine.matches || reduced.matches || e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    if (!raf) { pos = target = scrollY; last = performance.now(); }
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? vh : 1;
    target = clamp(target + e.deltaY * unit * sens, 0, docMax);
    if (!raf) raf = requestAnimationFrame(tick);
  }, {passive: false});
  for (const ev of ['keydown', 'pointerdown', 'touchstart']) addEventListener(ev, () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } target = pos = scrollY; }, {passive: true});
}

addEventListener('scroll', () => { dirty = true; }, {passive: true});
let rw = innerWidth;
addEventListener('resize', () => { if (innerWidth !== rw || !mobile()) { rw = innerWidth; measure(); } else dirty = true; });
for (const img of document.images) img.addEventListener('load', measure, {once: true});
measure();
requestAnimationFrame(draw);
if ('fonts' in document) document.fonts.ready.then(measure);
