/* המירוץ של חידקי — an endless runner starring Hidki, a good bacterium.
   Everything is drawn on one canvas in "world units": the world is always 540 units tall
   and as wide as the screen's aspect ratio allows. */
(() => {
  'use strict';

  // ---------- Tunables ----------
  const H = 540;               // world height
  const GROUND = 452;          // y of the ground surface
  const HX = 170;              // Hidki's x position
  const BODY_R = 21;           // Hidki's round middle
  const LEG = 42;              // longest lobe (centre to tip centre)
  const FOOT_OFFSET = LEG + 12.5 + 3.5; // body centre to the bottom of a straight-down leg
  const REST_Y = GROUND - FOOT_OFFSET + 3;  // body centre while standing
  const GRAV = 2700;
  const JUMP_V = 960;
  const DJUMP_V = 820;
  const JUMP_CUT = 0.45;       // velocity kept when the jump key is released early
  const START_SPEED = 340;
  const SPEED_GAIN = 460;      // speed approaches START_SPEED + SPEED_GAIN
  const MAX_HEARTS = 3;
  const FLY_TIME = 7;          // seconds of rocket-peanut flight
  const FLY_TOP = 110;         // highest Hidki can fly (body centre)
  const FLY_BOOST = 1.35;      // the world speeds up while the rocket burns
  const MAGIC_TIME = 10;       // seconds of cape magic (space world)
  const MOON_GRAV = 0.62;      // gravity multiplier in space: floaty jumps
  const ZAP_RANGE = 280;       // the wand turns obstacles this close into stars
  const MAGNET_RANGE = 300;    // and pulls in viruses this close
  const PX_PER_METER = 40;
  const ZONE_METERS = 500;

  const FONT = '"Fredoka", "Varela Round", system-ui, sans-serif';

  const ZONES = [
    { name: 'הקיבה',     sky: ['#c4f5ec', '#7fd8d0'], cell: '#ffffff', hillFar: '#f9c3d6', hill: '#f497b9', ground: '#ffd36e', groundDark: '#efae3a' },
    { name: 'המעי הדק',  sky: ['#ffe7cf', '#ffb59a'], cell: '#fff6ea', hillFar: '#dcc0f7', hill: '#b98bef', ground: '#a4e696', groundDark: '#6cc55f' },
    { name: 'המעי הגס',  sky: ['#dbe7ff', '#9db8ff'], cell: '#ffffff', hillFar: '#b6ecd6', hill: '#6fd1aa', ground: '#ffb48a', groundDark: '#ea8655' },
    { name: 'מסלול הכוכבים', sky: ['#ffe9f6', '#f6a8d6'], cell: '#ffffff', hillFar: '#ffe2a6', hill: '#ffc65c', ground: '#9fdcf5', groundDark: '#5bb6dd' },
  ];

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const ui = {
    hud: $('hud'), hearts: $('hearts'), meters: $('meters'), viruses: $('viruses'),
    title: $('titleScreen'), over: $('overScreen'), pause: $('pauseScreen'),
    bestTitle: $('bestTitle'), bestOver: $('bestOver'), overTitle: $('overTitle'),
    sMeters: $('sMeters'), sViruses: $('sViruses'), sScore: $('sScore'),
    startBtn: $('startBtn'), againBtn: $('againBtn'), resumeBtn: $('resumeBtn'),
    pauseBtn: $('pauseBtn'), muteBtn: $('muteBtn'),
  };

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };

  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Canvas sizing ----------
  let W = 960, scale = 1;
  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    scale = canvas.height / H;
    W = canvas.width / scale;
  }
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
  resize();

  // ---------- Helpers ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  function hex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(a, b, t) {
    const A = hex(a), B = hex(b);
    return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`;
  }
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function hash(n) { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }

  // ---------- Sound (tiny synth, no files) ----------
  let actx = null;
  let muted = store.get('hidki.muted', false);
  function audio() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } }
    if (actx && actx.state === 'suspended') actx.resume();
    return actx;
  }
  function tone(freq, dur, type = 'sine', vol = 0.12, slideTo = null, delay = 0) {
    if (muted) return;
    const a = audio(); if (!a) return;
    const t = a.currentTime + delay;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t); o.stop(t + dur + 0.03);
  }
  const sfx = {
    jump: () => tone(380, 0.16, 'square', 0.05, 760),
    djump: () => tone(560, 0.18, 'square', 0.05, 1200),
    catch: (n) => { const f = 660 * Math.pow(1.0595, Math.min(n, 14) * 2); tone(f, 0.08, 'triangle', 0.13); tone(f * 1.5, 0.12, 'triangle', 0.1, null, 0.06); },
    gold: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.14, 'triangle', 0.12, null, i * 0.06)),
    hit: () => { tone(240, 0.35, 'sawtooth', 0.09, 70); tone(120, 0.3, 'square', 0.05, 60); },
    rocket: () => { tone(160, 0.6, 'sawtooth', 0.07, 900); tone(320, 0.5, 'square', 0.04, 1400, 0.05); [784, 988, 1319].forEach((f, i) => tone(f, 0.14, 'triangle', 0.09, null, 0.25 + i * 0.07)); },
    magic: () => [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.3, 'sine', 0.08, null, i * 0.07)),
    zap: () => { tone(1400, 0.18, 'triangle', 0.07, 2600); tone(2100, 0.12, 'sine', 0.05, null, 0.05); },
    land: () => tone(500, 0.25, 'triangle', 0.08, 200),
    shield: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'sine', 0.1, null, i * 0.05)),
    zone: () => [659, 784, 988].forEach((f, i) => tone(f, 0.18, 'triangle', 0.09, null, i * 0.09)),
    over: () => [523, 440, 349, 262].forEach((f, i) => tone(f, 0.25, 'triangle', 0.1, null, i * 0.16)),
  };
  function syncMute() { ui.muteBtn.classList.toggle('muted', muted); ui.muteBtn.setAttribute('aria-label', muted ? 'הפעלת צלילים' : 'השתקה'); }
  syncMute();

  // ---------- State ----------
  let state = 'title';      // title | play | paused | over
  let best = store.get('hidki.best', 0);
  let hero, obstacles, viruses, powerups, particles, texts, beams;
  let magicMix = 0;          // 0 = normal world, 1 = space world (fades between)
  let speed, elapsed, dist, scroll, caught, hearts, combo, comboTimer;
  let obstGap, virusGap, powerGap, powerCount, shake, zoneIdx, banner, overTimer;

  // Scenery that exists in every state
  const cells = Array.from({ length: 7 }, (_, i) => ({ x: i * 260 + rand(0, 120), y: rand(60, 280), r: rand(40, 95), ph: rand(0, 6) }));
  const stars = Array.from({ length: 90 }, () => ({ x: rand(0, 2000), y: rand(0, GROUND - 40), r: rand(0.6, 2.2), ph: rand(0, 6), p: rand(0.03, 0.12) }));
  const bubbles = Array.from({ length: 22 }, () => ({ x: rand(0, 1600), y: rand(0, H), r: rand(3, 10), s: rand(12, 40) }));

  function reset() {
    hero = { y: REST_Y, vy: 0, onGround: true, jumps: 0, holding: false, buffer: 0, limb: 0, sx: 1, sy: 1, invuln: 0, shield: 0, fly: 0, magic: 0, boost: 1, t: 0 };
    obstacles = []; viruses = []; powerups = []; particles = []; texts = []; beams = [];
    speed = START_SPEED; elapsed = 0; dist = 0; caught = 0; hearts = MAX_HEARTS;
    combo = 0; comboTimer = 0; shake = 0; zoneIdx = 0; banner = null; overTimer = 0;
    obstGap = 700; virusGap = 380; powerGap = START_SPEED * 14; powerCount = 0;
  }
  reset();
  scroll = 0;

  // ---------- Input ----------
  function press() {
    if (state === 'title') return start();
    if (state !== 'play') return;
    hero.holding = true;
    if (hero.fly > 0) return; // while flying, holding = thrust
    if (hero.onGround) jump(false);
    else if (hero.jumps < 2) jump(true);
    else hero.buffer = 0.14;
  }
  function release() {
    hero.holding = false;
    if (state === 'play' && hero.fly === 0 && hero.vy < -200) hero.vy *= JUMP_CUT;
  }
  function jump(double) {
    hero.vy = -(double ? DJUMP_V : JUMP_V);
    hero.onGround = false;
    hero.jumps = double ? 2 : 1;
    hero.sx = 0.84; hero.sy = 1.16;
    (double ? sfx.djump : sfx.jump)();
    burst(HX - 4, REST_Y + 36, double ? 10 : 6, ['#ffffff', '#e8fff6'], 120, double ? 0.45 : 0.35, 3);
  }

  const JUMP_KEYS = new Set(['Space', 'ArrowUp', 'KeyW']);
  window.addEventListener('keydown', (e) => {
    if (JUMP_KEYS.has(e.code)) {
      if (e.target instanceof HTMLButtonElement && state !== 'play') return; // let buttons handle Space
      e.preventDefault();
      if (!e.repeat) press();
    } else if (e.code === 'KeyP' || e.code === 'Escape') {
      togglePause();
    } else if (e.code === 'KeyM') {
      toggleMute();
    }
  });
  window.addEventListener('keyup', (e) => { if (JUMP_KEYS.has(e.code)) release(); });
  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); audio(); press(); });
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);

  ui.startBtn.addEventListener('click', start);
  ui.againBtn.addEventListener('click', start);
  ui.resumeBtn.addEventListener('click', togglePause);
  ui.pauseBtn.addEventListener('click', togglePause);
  ui.muteBtn.addEventListener('click', toggleMute);
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') togglePause(); });

  function toggleMute() { muted = !muted; store.set('hidki.muted', muted); syncMute(); if (!muted) tone(880, 0.08, 'triangle', 0.08); }

  function start() {
    audio();
    reset();
    state = 'play';
    ui.title.hidden = true; ui.over.hidden = true; ui.pause.hidden = true; ui.hud.hidden = false;
    updateHud(true);
    showBanner('יוצאים לדרך!');
    canvas.focus && canvas.focus();
  }
  function togglePause() {
    if (state === 'play') { state = 'paused'; ui.pause.hidden = false; ui.resumeBtn.focus(); }
    else if (state === 'paused') { state = 'play'; ui.pause.hidden = true; last = performance.now(); }
  }
  function gameOver() {
    state = 'over';
    const meters = Math.floor(dist / PX_PER_METER);
    const score = meters + caught * 10;
    const isRecord = score > best;
    if (isRecord) { best = score; store.set('hidki.best', best); }
    ui.sMeters.textContent = meters;
    ui.sViruses.textContent = caught;
    ui.sScore.textContent = score;
    ui.overTitle.textContent = pick(['אוי, חידקי נתקע!', 'אופס! נגמרו הלבבות', 'ריצה יפה, חידקי!']);
    ui.bestOver.textContent = isRecord ? 'שיא חדש! כל הכבוד' : `השיא: ${best}`;
    ui.bestOver.classList.toggle('record', isRecord);
    overTimer = 0.9;
    sfx.over();
  }
  function showBestOnTitle() { ui.bestTitle.textContent = best > 0 ? `השיא שלכם: ${best}` : ''; }
  showBestOnTitle();

  // ---------- HUD ----------
  const HEART = '<svg viewBox="0 0 24 22" class="CLS"><path d="M12 21s-9-5.6-9-12A5 5 0 0 1 12 6a5 5 0 0 1 9 3c0 6.4-9 12-9 12z"/></svg>';
  let hudCache = '';
  function updateHud(force) {
    const meters = Math.floor(dist / PX_PER_METER);
    const key = `${hearts}|${meters}|${caught}`;
    if (!force && key === hudCache) return;
    hudCache = key;
    let h = '';
    for (let i = 0; i < MAX_HEARTS; i++) h += HEART.replace('CLS', i < hearts ? 'full' : 'empty');
    ui.hearts.innerHTML = h;
    ui.hearts.setAttribute('aria-label', `${hearts} לבבות`);
    ui.meters.textContent = meters;
    ui.viruses.textContent = caught;
  }

  // ---------- Effects ----------
  function burst(x, y, n, colors, spd, life, size) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), v = rand(spd * 0.3, spd);
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - spd * 0.3, life, max: life, col: pick(colors), r: rand(size * 0.6, size * 1.3) });
    }
  }
  function floatText(x, y, txt, col) { texts.push({ x, y, txt, col, life: 0.9 }); }
  function showBanner(txt) { banner = { txt, life: 2.2 }; }

  // ---------- Spawning ----------
  const OBSTACLE_TYPES = ['cubes', 'cubes', 'lolli', 'can', 'pill', 'donut'];
  function spawnObstacle() {
    const sf = (speed - START_SPEED) / SPEED_GAIN;
    const type = pick(OBSTACLE_TYPES);
    let o;
    switch (type) {
      case 'cubes': { const n = Math.random() < 0.45 ? 1 : (Math.random() < 0.75 - 0.4 * (1 - sf) ? 2 : 3); const cols = Math.random() < 0.3 ? 2 : 1; o = { type, n: Math.min(n, cols === 2 ? 2 : 3), cols, w: 40 * cols, h: 38 * Math.min(n, cols === 2 ? 2 : 3) }; break; }
      case 'lolli': o = { type, w: 46, h: 108, hue: pick(['#ff6fa8', '#5aa9ff', '#ff9f43']) }; break;
      case 'can': o = { type, w: 40, h: 68, hue: pick(['#ff7a59', '#4cc3ff', '#b47cff']) }; break;
      case 'pill': o = { type, w: 82, h: 34, hue: pick(['#5aa9ff', '#ff6f6f', '#ffc531']) }; break;
      case 'donut': o = { type, w: 64, h: 40 }; break;
    }
    o.x = W + 40;
    obstacles.push(o);
    // Sometimes reward the jump with an arc of viruses above the obstacle
    if (Math.random() < 0.35) {
      const top = GROUND - o.h;
      [-62, 0, 62].forEach((dx, i) => addVirus(o.x + o.w / 2 + dx, top - 58 - (i === 1 ? 26 : 0)));
    }
    return o;
  }
  function addVirus(x, y, gold) {
    viruses.push({ x, y, baseY: y, r: gold ? 15 : 17, ph: rand(0, 6), rot: rand(0, 6), gold: !!gold, kind: Math.floor(rand(0, 3)) });
  }
  function spawnViruses() {
    const x0 = W + 60;
    if (hero.fly > 0) { // a wavy trail of viruses up in the sky
      const base = rand(170, 300), amp = rand(40, 90), ph = rand(0, 6);
      for (let i = 0; i < 7; i++) addVirus(x0 + i * 50, base + Math.sin(ph + i * 0.8) * amp, i === 3 && Math.random() < 0.3);
      return;
    }
    const pattern = pick(['line', 'arc', 'single', 'single', 'low']);
    if (pattern === 'line') { const y = rand(250, 330); for (let i = 0; i < 4; i++) addVirus(x0 + i * 52, y); }
    else if (pattern === 'arc') { for (let i = 0; i < 5; i++) addVirus(x0 + i * 52, 300 - Math.sin((i / 4) * Math.PI) * 90); }
    else if (pattern === 'low') { for (let i = 0; i < 3; i++) addVirus(x0 + i * 52, REST_Y - 6); }
    else addVirus(x0, rand(220, 380), Math.random() < 0.18);
    // keep viruses out of obstacles
    for (const v of viruses) for (const o of obstacles) {
      if (v.x > o.x - 30 && v.x < o.x + o.w + 30 && v.baseY > GROUND - o.h - 34) v.baseY = v.y = GROUND - o.h - 40;
    }
  }
  function spawnPower() {
    const type = ['rocket', 'cape', 'yogurt'][powerCount++ % 3];
    powerups.push({ x: W + 60, y: rand(250, 320), ph: 0, type });
  }

  // ---------- Collision ----------
  function obstacleRects(o) {
    const top = GROUND - o.h;
    if (o.type === 'lolli') return [{ x: o.x + 2, y: top + 2, w: o.w - 4, h: 42 }, { x: o.x + o.w / 2 - 4, y: top + 40, w: 8, h: o.h - 40 }];
    if (o.type === 'pill') return [{ x: o.x + 6, y: top + 4, w: o.w - 12, h: o.h - 4 }];
    return [{ x: o.x + 4, y: top + 4, w: o.w - 8, h: o.h - 4 }];
  }
  function circleRect(cx, cy, r, b) {
    const nx = clamp(cx, b.x, b.x + b.w), ny = clamp(cy, b.y, b.y + b.h);
    const dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy < r * r;
  }

  // ---------- Update ----------
  function update(dt) {
    const playing = state === 'play';
    const runSpeed = playing ? speed * hero.boost : state === 'title' ? 260 : state === 'over' ? Math.max(0, speed * overTimer) : 0;
    if (state === 'paused') return;

    if (playing) {
      elapsed += dt;
      speed = START_SPEED + SPEED_GAIN * (1 - Math.exp(-elapsed / 80));
      dist += speed * hero.boost * dt;
    }
    if (state === 'over') {
      overTimer = Math.max(0, overTimer - dt);
      if (overTimer === 0 && ui.over.hidden) { ui.over.hidden = false; ui.hud.hidden = true; ui.againBtn.focus(); }
    }
    scroll += runSpeed * dt;

    // scenery
    for (const b of bubbles) { b.y -= b.s * dt; b.x -= runSpeed * 0.15 * dt; if (b.y < -20) { b.y = H + 20; b.x = rand(0, W); } if (b.x < -20) b.x += W + 40; }

    // hero
    const h = hero;
    h.t += dt;
    if (h.fly > 0 && playing) {
      // rocket flight: hold to climb, let go to glide down
      h.fly = Math.max(0, h.fly - dt);
      h.vy += (h.holding ? -2300 : 900) * dt;
      h.vy = clamp(h.vy, -460, 380);
      h.y += h.vy * dt;
      if (h.y < FLY_TOP) { h.y = FLY_TOP; h.vy = Math.max(0, h.vy); }
      h.onGround = h.y >= REST_Y;
      if (h.onGround) { h.y = REST_Y; h.vy = Math.min(0, h.vy); }
      h.boost += (FLY_BOOST - h.boost) * Math.min(1, dt * 3);
      if (Math.random() < dt * 60) {
        const fx = HX - 110, fy = h.y - 2;
        particles.push({ x: fx, y: fy, vx: rand(-320, -200), vy: rand(-40, 40), life: 0.35, max: 0.35, col: pick(['#ffd34d', '#ff9f43', '#ff6b3d', '#fff1a8']), r: rand(3, 6), nograv: true });
      }
      if (h.fly === 0) { // rocket burnt out: fall gently, one air jump left
        h.onGround = h.y >= REST_Y; h.jumps = 1; h.invuln = Math.max(h.invuln, 1.2); sfx.land();
        floatText(HX + 20, h.y - 60, 'נגמר הדלק!', '#e2457a');
        burst(HX - 60, h.y + 10, 14, ['#cfcfcf', '#ffffff', '#ffd34d'], 180, 0.5, 4);
      }
    } else if (!h.onGround) {
      h.vy += GRAV * (h.magic > 0 ? MOON_GRAV : 1) * dt * (h.vy > 0 ? 1.15 : 1);
      h.y += h.vy * dt;
      if (h.y < 70) { h.y = 70; h.vy = Math.max(h.vy, 0); }
      if (h.y >= REST_Y) {
        h.y = REST_Y;
        if (h.vy > 300) { h.sx = 1.18; h.sy = 0.84; burst(HX, GROUND - 2, 7, ['#ffffff', '#fff3d6'], 150, 0.35, 3.5); }
        h.vy = 0; h.onGround = true; h.jumps = 0;
        if (h.buffer > 0 && playing) jump(false);
      }
    }
    h.buffer = Math.max(0, h.buffer - dt);
    h.sx += (1 - h.sx) * Math.min(1, dt * 10);
    h.sy += (1 - h.sy) * Math.min(1, dt * 10);
    h.limb += dt * (runSpeed / 46) * (h.onGround ? 1 : h.fly > 0 ? 2.4 : 1.8); // rolls with the ground
    h.invuln = Math.max(0, h.invuln - dt);
    h.shield = Math.max(0, h.shield - dt);
    if (h.fly === 0) h.boost += (1 - h.boost) * Math.min(1, dt * 2);
    if (h.magic > 0 && playing) {
      h.magic = Math.max(0, h.magic - dt);
      if (h.magic === 0) { showBanner('חוזרים הביתה'); sfx.land(); }
    }
    magicMix += ((h.magic > 0 ? 1 : 0) - magicMix) * Math.min(1, dt * 2.5);
    if (playing && h.onGround && h.fly === 0 && Math.random() < dt * 9) particles.push({ x: HX - 10, y: GROUND - 3, vx: -runSpeed * 0.3, vy: rand(-40, -10), life: 0.4, max: 0.4, col: 'rgba(255,255,255,0.8)', r: rand(2, 4) });

    // spawning
    if (playing) {
      const sf = (speed - START_SPEED) / SPEED_GAIN;
      if (h.fly === 0) obstGap -= speed * dt;
      if (obstGap <= 0) { const o = spawnObstacle(); obstGap = speed * rand(0.95, 1.75 - 0.45 * sf) + o.w + 120; }
      virusGap -= speed * dt;
      if (virusGap <= 0) { spawnViruses(); virusGap = h.fly > 0 ? speed * rand(0.9, 1.2) : speed * rand(0.9, 1.9); }
      powerGap -= speed * dt;
      if (powerGap <= 0) { spawnPower(); powerGap = speed * rand(18, 30); }
    }

    // world objects scroll
    const move = runSpeed * dt;
    for (const o of obstacles) o.x -= move;
    for (const v of viruses) { v.x -= move; v.ph += dt * 3; v.rot += dt * 1.4; v.y = v.baseY + Math.sin(v.ph) * 7; }
    for (const p of powerups) { p.x -= move; p.ph += dt * 3; }
    for (const o of obstacles) if (o.zap !== undefined) o.zap += dt;
    obstacles = obstacles.filter((o) => o.x + o.w > -60 && !(o.zap > 0.35));
    for (const b of beams) b.life -= dt;
    beams = beams.filter((b) => b.life > 0);
    viruses = viruses.filter((v) => v.x > -40 && !v.dead);
    powerups = powerups.filter((p) => p.x > -40 && !p.dead);

    if (playing) {
      const hr = 25;
      // viruses: catch
      comboTimer = Math.max(0, comboTimer - dt);
      if (comboTimer === 0) combo = 0;
      for (const v of viruses) {
        const dx = v.x - HX, dy = v.y - h.y;
        if (dx * dx + dy * dy < (hr + v.r + 6) ** 2) {
          v.dead = true;
          combo++; comboTimer = 1.3;
          const pts = v.gold ? 5 : 1;
          caught += pts;
          if (v.gold) { sfx.gold(); floatText(v.x, v.y - 20, '+50', '#ffb000'); }
          else { sfx.catch(combo); floatText(v.x, v.y - 20, combo > 2 ? `+10 ×${combo}` : '+10', '#7b3fd1'); }
          burst(v.x, v.y, v.gold ? 22 : 14, v.gold ? ['#ffd34d', '#fff1a8', '#ffffff'] : ['#b98bef', '#ff6fa8', '#ffffff'], 260, 0.55, 4);
        }
      }
      // power-ups
      for (const p of powerups) {
        const dx = p.x - HX, dy = p.y - h.y;
        if (dx * dx + dy * dy < (hr + 22) ** 2) {
          p.dead = true;
          if (p.type === 'rocket') {
            h.fly = FLY_TIME; h.onGround = false; h.vy = -520; h.jumps = 2; h.buffer = 0;
            sfx.rocket(); showBanner('טסים! להחזיק לחוץ כדי לעלות');
            floatText(p.x, p.y - 30, 'טיל בוטן!', '#d9701f');
            burst(p.x, p.y, 22, ['#ffd34d', '#ff9f43', '#e2b26b', '#ffffff'], 280, 0.6, 4);
            obstGap = Math.max(obstGap, speed * 1.4); // a clear landing strip after the flight
          } else if (p.type === 'cape') {
            h.magic = MAGIC_TIME; sfx.magic(); showBanner('קסם בחלל!');
            floatText(p.x, p.y - 30, 'גלימת קסמים!', '#7b4dff');
            burst(p.x, p.y, 26, ['#7b4dff', '#ffd34d', '#ffffff', '#ff8fc0'], 300, 0.7, 4);
          } else {
            h.shield = 7; sfx.shield();
            floatText(p.x, p.y - 26, 'מגן יוגורט!', '#e2457a');
            burst(p.x, p.y, 18, ['#ffffff', '#ffd1e3', '#bfe9ff'], 240, 0.6, 4);
          }
        }
      }
      // cape magic: the wand turns nearby obstacles into stars and pulls in viruses
      if (h.magic > 0) {
        const wx = HX + 58, wy = h.y - 36;
        for (const o of obstacles) {
          if (o.hit || o.zap !== undefined || o.x > HX + ZAP_RANGE || o.x + o.w < HX - 10) continue;
          o.zap = 0; o.hit = true; sfx.zap();
          const cx = o.x + o.w / 2, cy = GROUND - o.h / 2;
          beams.push({ x1: wx, y1: wy, x2: cx, y2: cy, life: 0.25 });
          burst(cx, cy, 18, ['#ffd34d', '#ffffff', '#c9b6ff', '#8fd8ff'], 260, 0.7, 4);
          floatText(cx, cy - o.h / 2 - 20, 'פוף!', '#7b4dff');
        }
        for (const v of viruses) {
          const dx = HX - v.x, dy = h.y - v.baseY, d = Math.hypot(dx, dy);
          if (d < MAGNET_RANGE && v.x > HX - 40) { const k = Math.min(1, (520 * dt) / d); v.x += dx * k; v.baseY += dy * k; }
        }
        if (Math.random() < dt * 25) particles.push({ x: wx + rand(-6, 6), y: wy + rand(-6, 6), vx: rand(-120, -40), vy: rand(-60, 60), life: 0.5, max: 0.5, col: pick(['#ffd34d', '#ffffff', '#c9b6ff']), r: rand(1.5, 3.5), nograv: true });
      }
      // obstacles
      for (const o of obstacles) {
        if (o.hit) continue;
        if (obstacleRects(o).some((b) => circleRect(HX + 2, h.y + 4, hr, b))) {
          if (h.fly > 0 || h.shield > 0) {
            o.hit = true; o.flyVy = -600; o.spin = 0;
            if (h.fly === 0) h.shield = 0;
            sfx.hit();
            burst(HX + 30, h.y, 20, ['#ffffff', '#bfe9ff'], 300, 0.5, 4);
            floatText(HX + 40, h.y - 50, 'בום!', '#2b8be0');
          } else if (h.invuln === 0) {
            o.hit = true;
            hearts--; h.invuln = 1.6; shake = reduceMotion ? 0 : 0.3; sfx.hit();
            burst(HX + 20, h.y, 16, ['#ff5d73', '#ffd1d8', '#ffffff'], 260, 0.5, 4);
            updateHud(true);
            if (hearts <= 0) { gameOver(); break; }
          }
        }
      }
      // zones
      const meters = dist / PX_PER_METER;
      const zi = Math.floor(meters / ZONE_METERS);
      if (zi !== zoneIdx) { zoneIdx = zi; sfx.zone(); showBanner(`אזור חדש: ${ZONES[zi % ZONES.length].name}`); }
      updateHud(false);
    }
    // knocked-away obstacles (shield hits) fly off
    for (const o of obstacles) if (o.flyVy !== undefined) { o.flyVy += GRAV * dt; o.flyY = (o.flyY || 0) + o.flyVy * dt; o.spin += dt * 8; o.x += 300 * dt; }

    for (const p of particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; if (!p.nograv) p.vy += 600 * dt; }
    particles = particles.filter((p) => p.life > 0);
    for (const t of texts) { t.life -= dt; t.y -= 50 * dt; }
    texts = texts.filter((t) => t.life > 0);
    if (banner) { banner.life -= dt; if (banner.life <= 0) banner = null; }
    shake = Math.max(0, shake - dt);
  }

  // ---------- Render: background ----------
  function zoneColors() {
    const meters = dist / PX_PER_METER;
    const i = Math.floor(meters / ZONE_METERS);
    const local = meters - i * ZONE_METERS;
    const t = clamp((local - (ZONE_METERS - 30)) / 30, 0, 1);
    const a = ZONES[i % ZONES.length], b = ZONES[(i + 1) % ZONES.length];
    const out = {};
    for (const k of Object.keys(a)) if (k !== 'name') out[k] = Array.isArray(a[k]) ? a[k].map((c, j) => mix(c, b[k][j], t)) : mix(a[k], b[k], t);
    return out;
  }

  function drawBackground(z) {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND);
    g.addColorStop(0, z.sky[0]); g.addColorStop(1, z.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // far floating cells (slow parallax)
    const span = 7 * 260;
    for (const c of cells) {
      let x = ((c.x - scroll * 0.08) % span + span) % span - 120;
      const y = c.y + Math.sin(scroll * 0.002 + c.ph) * 8;
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = z.cell;
      ctx.beginPath(); ctx.ellipse(x, y, c.r, c.r * 0.86, c.ph, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 3; ctx.strokeStyle = z.cell; ctx.stroke();
      ctx.globalAlpha = 0.22;
      ctx.beginPath(); ctx.arc(x + c.r * 0.2, y - c.r * 0.1, c.r * 0.32, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // bubbles
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5;
    for (const b of bubbles) {
      if (b.x > W + 20) continue;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath(); ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.25, 0, Math.PI * 2); ctx.fill();
    }

    // villi hills: two layers of rounded "fingers"
    drawVilli(scroll * 0.18, GROUND - 40, 120, 0.011, z.hillFar, 0.9);
    drawVilli(scroll * 0.4 + 300, GROUND - 6, 80, 0.016, z.hill, 1);
  }
  function drawVilli(off, baseY, amp, freq, color, alpha) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W + 8; x += 8) {
      const s = Math.abs(Math.sin((x + off) * freq));
      const wobble = 0.75 + 0.25 * hash(Math.floor((x + off) * freq / Math.PI));
      ctx.lineTo(x, baseY - amp * Math.pow(s, 0.55) * wobble);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawGround(z) {
    ctx.fillStyle = z.ground;
    ctx.fillRect(0, GROUND, W, H - GROUND);
    // scalloped top edge
    const step = 30, off = scroll % step;
    ctx.fillStyle = z.ground;
    ctx.beginPath();
    for (let x = -off - step; x < W + step; x += step) { ctx.moveTo(x + step, GROUND); ctx.arc(x + step / 2, GROUND, step / 2, Math.PI, 0); }
    ctx.fill();
    ctx.strokeStyle = z.groundDark; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = -off - step; x < W + step; x += step) { ctx.moveTo(x, GROUND); ctx.arc(x + step / 2, GROUND, step / 2, Math.PI, 0); }
    ctx.stroke();
    // pebbles & dots scrolling at ground speed
    const k0 = Math.floor(scroll / 46);
    for (let k = k0; k < k0 + W / 46 + 2; k++) {
      const x = k * 46 - scroll;
      const y = GROUND + 22 + hash(k) * 60;
      ctx.fillStyle = z.groundDark;
      ctx.globalAlpha = 0.55;
      ctx.beginPath(); ctx.ellipse(x, y, 4 + hash(k + 9) * 7, 3 + hash(k + 3) * 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.5; ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(x + 20, GROUND + 14 + hash(k + 5) * 70, 2, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // ---------- Render: Hidki ----------
  // Drawn from the family's sketch (assets/hidki-drawing.webp): a small round body with six
  // bulb-tipped lobes. All six lobes turn together as he runs, like a rolling star.
  // Eyes and smile never move or turn.
  const C = {
    ink: '#1f2a5c',            // the pen outline from the drawing
    fill1: '#e6ffb0', fill2: '#8fe070', fill3: '#45b85a',
    blush: 'rgba(255,120,150,0.5)',
  };
  const LOBE_NECK = 11, LOBE_TIP = 12.5, OUTLINE = 3.5;

  // Lobe directions measured from the drawing, in degrees clockwise from straight up.
  const LOBE_DIRS = [10, 80, 150, 200, 260, 310];
  const LOBE_LENS = [42, 42, 40, 40, 40, 40];
  function hidkiLobes(a) {
    // The whole star of lobes turns clockwise (rolling forward); the face does not.
    return LOBE_DIRS.map((d, i) => ({ px: 0, py: 0, ang: Math.PI - (d * Math.PI) / 180 - a, len: LOBE_LENS[i] }));
  }
  // How far below the body centre the lowest lobe reaches right now.
  function lobesBottom(lobes) {
    let m = 0;
    for (const l of lobes) m = Math.max(m, Math.cos(l.ang) * l.len);
    return m + LOBE_TIP + OUTLINE;
  }

  function drawSilhouette(lobes, pad, style) {
    ctx.strokeStyle = style; ctx.fillStyle = style; ctx.lineCap = 'round';
    ctx.lineWidth = LOBE_NECK + pad * 2;
    for (const l of lobes) {
      const ex = l.px + Math.sin(l.ang) * l.len, ey = l.py + Math.cos(l.ang) * l.len;
      ctx.beginPath(); ctx.moveTo(l.px * 0.3, l.py * 0.3); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.beginPath(); ctx.arc(ex, ey, LOBE_TIP + pad, 0, Math.PI * 2); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(0, 0, BODY_R + pad, 0, Math.PI * 2); ctx.fill();
  }

  function drawHidki() {
    const h = hero;
    const lobes = hidkiLobes(h.limb);
    // keep the lowest lobe on the ground while rolling (the body bobs a little)
    const x = HX, y = h.y + (FOOT_OFFSET - lobesBottom(lobes)), t = h.t;
    // ground shadow
    const lift = clamp((REST_Y - y) / 220, 0, 1);
    ctx.fillStyle = 'rgba(23,48,46,0.18)';
    ctx.beginPath(); ctx.ellipse(x, GROUND + 3, 34 * (1 - lift * 0.5), 7 * (1 - lift * 0.5), 0, 0, Math.PI * 2); ctx.fill();

    if (h.fly > 0) {
      ctx.save();
      ctx.translate(x - 62, y + 14);
      ctx.rotate(clamp(h.vy / 1400, -0.3, 0.3));
      drawPeanutRocket(h.t, 1.2, true);
      ctx.restore();
    }

    if (h.magic > 0) drawCape(x, y, t, h.magic);

    ctx.save();
    ctx.translate(x, y);
    if (h.invuln > 0 && Math.floor(h.invuln * 14) % 2 === 0) ctx.globalAlpha = 0.4;

    // squash & stretch the silhouette around the feet; the face is drawn afterwards, unscaled
    ctx.save();
    ctx.translate(0, FOOT_OFFSET);
    ctx.scale(h.sx, h.sy);
    ctx.translate(0, -FOOT_OFFSET);
    drawSilhouette(lobes, OUTLINE, C.ink);                 // ink outline pass
    const g = ctx.createRadialGradient(-10, -14, 4, 0, 0, 58);
    g.addColorStop(0, C.fill1); g.addColorStop(0.45, C.fill2); g.addColorStop(1, C.fill3);
    drawSilhouette(lobes, 0, g);                           // fill pass merges into one shape
    // shine on the body and each lobe tip
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.ellipse(-9, -12, 8, 4.5, -0.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (const l of lobes) {
      const ex = l.px + Math.sin(l.ang) * l.len, ey = l.py + Math.cos(l.ang) * l.len;
      ctx.beginPath(); ctx.arc(ex - 4, ey - 4, 3.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    drawFace();
    ctx.restore();
    if (h.magic > 0) drawWand(x, y, t, h.magic);

    // rocket fuel gauge above Hidki
    if (h.fly > 0) {
      const fw = 64, frac = h.fly / FLY_TIME;
      const gy = y - 78;
      rr(x - fw / 2 - 3, gy - 3, fw + 6, 13, 6.5); ctx.fillStyle = 'rgba(31,42,92,0.75)'; ctx.fill();
      rr(x - fw / 2, gy, Math.max(7, fw * frac), 7, 3.5); ctx.fillStyle = frac < 0.25 ? '#ff5d73' : '#ffc531'; ctx.fill();
    }

    // shield bubble
    if (h.shield > 0) {
      const blink = h.shield < 1.5 && Math.floor(h.shield * 8) % 2 === 0;
      if (!blink) {
        ctx.save();
        ctx.translate(x, y + 4);
        const r = 64 + Math.sin(t * 6) * 2;
        const sg = ctx.createRadialGradient(-14, -18, 6, 0, 0, r);
        sg.addColorStop(0, 'rgba(255,255,255,0.15)'); sg.addColorStop(0.8, 'rgba(160,220,255,0.18)'); sg.addColorStop(1, 'rgba(120,200,255,0.45)');
        ctx.fillStyle = sg;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, r - 8, -2.4, -1.7); ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawFace() {
    // two small dot eyes, close together, as in the drawing
    for (const ex of [-3, 9]) {
      ctx.fillStyle = C.ink;
      ctx.beginPath(); ctx.ellipse(ex, -5, 3.4, 4.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(ex + 1.1, -6.4, 1.2, 0, Math.PI * 2); ctx.fill();
    }
    // cheeks
    ctx.fillStyle = C.blush;
    ctx.beginPath(); ctx.ellipse(-10, 5, 4.5, 2.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(16, 5, 4.5, 2.6, 0, 0, Math.PI * 2); ctx.fill();
    // the V smile
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2.8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-1, 4); ctx.lineTo(3.5, 10); ctx.lineTo(9.5, 3); ctx.stroke();
  }

  // ---------- Render: obstacles ----------
  function drawObstacle(o) {
    const top = GROUND - o.h;
    ctx.save();
    if (o.zap !== undefined) { const k = Math.max(0.01, 1 - o.zap / 0.35); const cx = o.x + o.w / 2, cy = top + o.h / 2; ctx.translate(cx, cy); ctx.rotate(o.zap * 10); ctx.scale(k, k); ctx.translate(-cx, -cy); }
    else if (o.flyY !== undefined) { ctx.translate(o.x + o.w / 2, top + o.h / 2 + o.flyY); ctx.rotate(o.spin); ctx.translate(-(o.x + o.w / 2), -(top + o.h / 2)); }
    else {
      ctx.fillStyle = 'rgba(23,48,46,0.16)';
      ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, GROUND + 3, o.w / 2 + 6, 6, 0, 0, Math.PI * 2); ctx.fill();
    }
    switch (o.type) {
      case 'cubes':
        for (let c = 0; c < o.cols; c++) for (let i = 0; i < o.n; i++) {
          const cx = o.x + c * 40, cy = GROUND - 38 * (i + 1);
          rr(cx + 1, cy + 1, 38, 36, 7); ctx.fillStyle = '#ffffff'; ctx.fill();
          ctx.strokeStyle = '#b9c9dd'; ctx.lineWidth = 2.5; ctx.stroke();
          ctx.fillStyle = '#e7eef7'; rr(cx + 5, cy + 22, 30, 10, 4); ctx.fill();
          ctx.fillStyle = '#c9d8ea';
          [[10, 9], [22, 14], [29, 7], [14, 18]].forEach(([dx, dy]) => ctx.fillRect(cx + dx, cy + dy, 2.5, 2.5));
        }
        break;
      case 'lolli': {
        const cx = o.x + o.w / 2, cy = top + 22;
        ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#b9c9dd'; ctx.lineWidth = 2;
        rr(cx - 4, cy + 10, 8, o.h - 32, 3); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, 23, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
        ctx.strokeStyle = o.hue; ctx.lineWidth = 6; ctx.lineCap = 'round';
        ctx.beginPath();
        for (let s = 0; s < 6 * Math.PI; s += 0.2) { const r = 1.5 + s * 1.05; const px = cx + Math.cos(s) * r, py = cy + Math.sin(s) * r; s ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
        ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, 23, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(cx - 9, cy - 10, 6, 3.5, -0.6, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'can': {
        const g = ctx.createLinearGradient(o.x, 0, o.x + o.w, 0);
        g.addColorStop(0, o.hue); g.addColorStop(0.35, '#ffffff'); g.addColorStop(0.5, o.hue); g.addColorStop(1, mix(o.hue, '#000000', 0.35));
        rr(o.x, top + 4, o.w, o.h - 4, 8); ctx.fillStyle = g; ctx.fill();
        ctx.fillStyle = '#d7dde6'; ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, top + 6, o.w / 2 - 2, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#9aa6b5'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(o.x + 2, top + 40); ctx.bezierCurveTo(o.x + 14, top + 30, o.x + 26, top + 50, o.x + o.w - 2, top + 38); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        [[10, 22, 3], [22, 16, 2], [28, 26, 2.5], [14, 56, 2]].forEach(([dx, dy, r]) => { ctx.beginPath(); ctx.arc(o.x + dx, top + dy, r, 0, Math.PI * 2); ctx.fill(); });
        break;
      }
      case 'pill': {
        const r = o.h / 2, mid = o.x + o.w / 2;
        ctx.save();
        rr(o.x, top, o.w, o.h, r); ctx.clip();
        ctx.fillStyle = '#ffffff'; ctx.fillRect(o.x, top, o.w / 2, o.h);
        ctx.fillStyle = o.hue; ctx.fillRect(mid, top, o.w / 2, o.h);
        ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(o.x + 8, top + 6, o.w - 16, 5);
        ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(o.x, top + o.h - 8, o.w, 8);
        ctx.restore();
        rr(o.x, top, o.w, o.h, r); ctx.strokeStyle = 'rgba(23,48,46,0.35)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(mid, top); ctx.lineTo(mid, top + o.h); ctx.stroke();
        break;
      }
      case 'donut': {
        const cx = o.x + o.w / 2, cy = top + o.h / 2 + 2;
        ctx.fillStyle = '#e0a060'; ctx.beginPath(); ctx.ellipse(cx, cy, o.w / 2, o.h / 2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff8fc0'; ctx.beginPath(); ctx.ellipse(cx, cy - 3, o.w / 2 - 4, o.h / 2 - 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#c47d3e'; ctx.beginPath(); ctx.ellipse(cx, cy - 3, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
        const sprinkles = ['#ffffff', '#ffd34d', '#5aa9ff', '#7be07b'];
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2, rx = 18 + (i % 2) * 5;
          ctx.save(); ctx.translate(cx + Math.cos(a) * rx, cy - 3 + Math.sin(a) * rx * 0.45); ctx.rotate(a * 2);
          ctx.fillStyle = sprinkles[i % 4]; ctx.fillRect(-3, -1, 6, 2.2); ctx.restore();
        }
        break;
      }
    }
    ctx.restore();
  }

  // ---------- Render: viruses & power-ups ----------
  const VIRUS_SKINS = [
    { body: '#8f5bd6', ring: '#6a3fb0', knob: '#ff6fa8' },
    { body: '#e2457a', ring: '#b52a5a', knob: '#ffc531' },
    { body: '#3aa3c9', ring: '#24789a', knob: '#ff8a5c' },
  ];
  function drawVirus(v) {
    const skin = v.gold ? { body: '#ffc531', ring: '#d99a00', knob: '#ffffff' } : VIRUS_SKINS[v.kind];
    ctx.save(); ctx.translate(v.x, v.y);
    if (v.gold) { ctx.fillStyle = 'rgba(255,214,90,0.35)'; ctx.beginPath(); ctx.arc(0, 0, v.r + 16 + Math.sin(v.ph * 2) * 3, 0, Math.PI * 2); ctx.fill(); }
    ctx.save(); ctx.rotate(v.rot);
    ctx.strokeStyle = skin.ring; ctx.lineWidth = 3;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * v.r, Math.sin(a) * v.r); ctx.lineTo(Math.cos(a) * (v.r + 8), Math.sin(a) * (v.r + 8)); ctx.stroke();
      ctx.fillStyle = skin.knob; ctx.beginPath(); ctx.arc(Math.cos(a) * (v.r + 9), Math.sin(a) * (v.r + 9), 3.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = skin.body; ctx.beginPath(); ctx.arc(0, 0, v.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = skin.ring; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.arc(-5, -6, 5, 0, Math.PI * 2); ctx.fill();
    // smiling face (looking at Hidki on the left)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(-6, -2, 4.4, 0, Math.PI * 2); ctx.arc(5, -2, 4.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#17302e';
    ctx.beginPath(); ctx.arc(-7.2, -1.6, 2.4, 0, Math.PI * 2); ctx.arc(3.8, -1.6, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(-6.4, -2.6, 0.9, 0, Math.PI * 2); ctx.arc(4.6, -2.6, 0.9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,170,200,0.75)';
    ctx.beginPath(); ctx.ellipse(-11, 4, 2.8, 1.8, 0, 0, Math.PI * 2); ctx.ellipse(10, 4, 2.8, 1.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5a1f3a';
    ctx.beginPath(); ctx.arc(-0.5, 4, 5.2, 0.15, Math.PI - 0.15); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // A peanut with a little rocket strapped on. Drawn facing right, centred on the peanut.
  function drawPeanutRocket(t, sc, burning) {
    ctx.save();
    ctx.scale(sc, sc);
    // rocket (on the peanut's back, nose pointing forward)
    ctx.save();
    ctx.translate(-6, -15);
    // flame
    if (burning) {
      const fl = 1 + Math.sin(t * 40) * 0.18 + Math.sin(t * 23) * 0.1;
      ctx.fillStyle = '#ff7a2f';
      ctx.beginPath(); ctx.moveTo(-29, -6); ctx.quadraticCurveTo(-29 - 26 * fl, -3, -29 - 34 * fl, 0); ctx.quadraticCurveTo(-29 - 26 * fl, 3, -29, 6); ctx.fill();
      ctx.fillStyle = '#ffd34d';
      ctx.beginPath(); ctx.moveTo(-29, -3.5); ctx.quadraticCurveTo(-29 - 14 * fl, -2, -29 - 20 * fl, 0); ctx.quadraticCurveTo(-29 - 14 * fl, 2, -29, 3.5); ctx.fill();
    }
    ctx.fillStyle = '#ff5d73';
    ctx.beginPath(); ctx.moveTo(-22, -5); ctx.lineTo(-22, -11); ctx.lineTo(-12, -5); ctx.closePath(); ctx.fill();   // top fin
    ctx.beginPath(); ctx.moveTo(-22, 5); ctx.lineTo(-22, 11); ctx.lineTo(-12, 5); ctx.closePath(); ctx.fill();      // bottom fin
    rr(-26, -6, 34, 12, 6); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#ff5d73'; ctx.beginPath(); ctx.moveTo(8, -6); ctx.quadraticCurveTo(20, -3, 22, 0); ctx.quadraticCurveTo(20, 3, 8, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#5aa9ff'; ctx.beginPath(); ctx.arc(-4, 0, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#9aa6b5'; ctx.fillRect(-29, -4, 4, 8);
    ctx.restore();
    // peanut shell: two lobes with a waist
    ctx.fillStyle = '#e8b974'; ctx.strokeStyle = '#9c6a34'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(-11, 0, 15, 12.5, 0, 0, Math.PI * 2);
    ctx.ellipse(12, 0, 14, 11.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath(); ctx.ellipse(-11, 0, 15, 12.5, 0, 0.55, Math.PI * 2 - 0.55); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(12, 0, 14, 11.5, 0, Math.PI + 0.6, Math.PI - 0.6); ctx.stroke();
    // shell dimples
    ctx.fillStyle = 'rgba(156,106,52,0.35)';
    [[-18, -5], [-12, 5], [-5, -6], [-20, 4], [16, -6], [8, 5], [19, 3], [10, -4]].forEach(([dx, dy]) => { ctx.beginPath(); ctx.arc(dx, dy, 1.4, 0, Math.PI * 2); ctx.fill(); });
    // strap holding the rocket
    ctx.fillStyle = '#5a6cc8'; ctx.fillRect(-3, -14, 5, 22);
    // happy peanut face
    ctx.fillStyle = C.ink;
    ctx.beginPath(); ctx.arc(10, -2, 1.9, 0, Math.PI * 2); ctx.arc(17, -2, 1.9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(13.5, 2, 3.4, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.restore();
  }

  function drawRocketPickup(p) {
    const y = p.y + Math.sin(p.ph) * 6;
    ctx.save(); ctx.translate(p.x, y);
    ctx.fillStyle = 'rgba(255,214,120,0.45)'; ctx.beginPath(); ctx.arc(0, -6, 44 + Math.sin(p.ph * 2) * 2, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(-0.15 + Math.sin(p.ph * 1.3) * 0.08);
    drawPeanutRocket(p.ph, 1.35, true);
    ctx.restore();
  }

  // ---------- Cape magic ----------
  function capeShape(t, len, wid) {
    // a flowing cape attached at (0,0), streaming to the left with a wavy hem
    ctx.beginPath();
    ctx.moveTo(4, -wid * 0.35);
    ctx.quadraticCurveTo(-len * 0.45, -wid * 0.55 + Math.sin(t * 9) * 4, -len, -wid * 0.5 + Math.sin(t * 9 + 1) * 7);
    for (let i = 0; i <= 4; i++) {
      const yy = -wid * 0.5 + (wid * i) / 4;
      ctx.quadraticCurveTo(-len - 10 + Math.sin(t * 11 + i) * 5, yy + wid / 8, -len + Math.sin(t * 9 + i + 1.5) * 7, yy + wid / 4 * (i < 4 ? 1 : 0));
    }
    ctx.quadraticCurveTo(-len * 0.45, wid * 0.55 + Math.sin(t * 9 + 2) * 4, 4, wid * 0.35);
    ctx.closePath();
  }
  function paintCape(t, len, wid) {
    const g = ctx.createLinearGradient(0, 0, -len, 0);
    g.addColorStop(0, '#9b6bff'); g.addColorStop(1, '#4a2bb8');
    capeShape(t, len, wid); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.fillStyle = '#ffd34d';
    [[-len * 0.35, -wid * 0.15, 3], [-len * 0.6, wid * 0.2, 2.4], [-len * 0.8, -wid * 0.25, 2.8], [-len * 0.5, -wid * 0.35, 1.8]].forEach(([sx, sy, r]) => drawStar(sx, sy + Math.sin(t * 9 + sx) * 3, r * 1.6, r * 0.7, 0));
  }
  function drawCape(x, y, t, left) {
    ctx.save();
    ctx.translate(x - 6, y - 10);
    ctx.rotate(-0.12 + Math.sin(t * 4) * 0.05);
    if (left < 1.5 && Math.floor(left * 8) % 2 === 0) ctx.globalAlpha = 0.5;
    paintCape(t, 92, 54);
    // gold clasp
    ctx.fillStyle = '#ffd34d'; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(4, 0, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  function drawWand(x, y, t, left) {
    ctx.save();
    ctx.translate(x + 40, y - 6);
    ctx.rotate(-0.7 + Math.sin(t * 6) * 0.15);
    if (left < 1.5 && Math.floor(left * 8) % 2 === 0) ctx.globalAlpha = 0.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = C.ink; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -38); ctx.stroke();
    ctx.strokeStyle = '#3b2a7a'; ctx.lineWidth = 4.5; ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4.5; ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(0, -38); ctx.stroke();
    ctx.fillStyle = 'rgba(255,230,120,0.4)'; ctx.beginPath(); ctx.arc(0, -46, 16 + Math.sin(t * 10) * 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd34d'; ctx.strokeStyle = C.ink; ctx.lineWidth = 2.2;
    drawStar(0, -46, 12, 5.5, t * 3); ctx.stroke();
    ctx.restore();
  }
  function drawStar(cx, cy, ro, ri, rot) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = rot - Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? ri : ro;
      i ? ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) : ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill();
  }
  function drawCapePickup(p) {
    const y = p.y + Math.sin(p.ph) * 6;
    ctx.save(); ctx.translate(p.x, y);
    ctx.fillStyle = 'rgba(180,150,255,0.45)'; ctx.beginPath(); ctx.arc(0, 0, 40 + Math.sin(p.ph * 2) * 2, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(22, -6); ctx.rotate(-0.25); paintCape(p.ph, 46, 34); ctx.restore();
    ctx.fillStyle = '#ffd34d'; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(22, -8, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // sparkles around it
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 3; i++) { const a = p.ph * 0.8 + i * 2.1; drawStar(Math.cos(a) * 34, Math.sin(a) * 30, 4, 1.6, a); }
    ctx.restore();
  }

  // ---------- Space world (drawn over the normal world while the cape is on) ----------
  function drawSpace(mix) {
    ctx.globalAlpha = mix;
    const g = ctx.createLinearGradient(0, 0, 0, GROUND);
    g.addColorStop(0, '#120c33'); g.addColorStop(0.6, '#2a1b63'); g.addColorStop(1, '#4b2f8f');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, GROUND + 20);
    // stars
    const span = 2000;
    for (const st of stars) {
      const x = ((st.x - scroll * st.p) % span + span) % span;
      if (x > W) continue;
      ctx.globalAlpha = mix * (0.55 + 0.45 * Math.sin(st.ph + scroll * 0.01));
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(x, st.y, st.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = mix;
    // ringed planet
    const px = W * 0.72, py = 120;
    ctx.fillStyle = '#ff9fc8';
    ctx.beginPath(); ctx.arc(px, py, 46, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.ellipse(px - 6, py - 14, 30, 9, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.ellipse(px, py, 78, 16, -0.3, 0.15 * Math.PI, 0.95 * Math.PI, true); ctx.stroke();
    // small moon
    ctx.fillStyle = '#e8e4ff'; ctx.beginPath(); ctx.arc(W * 0.3, 80, 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c9c2f0'; ctx.beginPath(); ctx.arc(W * 0.3 + 5, 76, 4, 0, Math.PI * 2); ctx.arc(W * 0.3 - 6, 86, 3, 0, Math.PI * 2); ctx.fill();
    // purple lunar hills
    drawVilli(scroll * 0.18, GROUND - 40, 90, 0.008, '#5b3fa8', mix * 0.9);
    drawVilli(scroll * 0.4 + 300, GROUND - 6, 60, 0.012, '#7a5cc9', mix);
    ctx.globalAlpha = 1;
  }
  function drawMoonGround(mix) {
    ctx.globalAlpha = mix;
    ctx.fillStyle = '#b9b2e3';
    ctx.fillRect(0, GROUND, W, H - GROUND);
    // moon-coloured scalloped edge over the normal one
    const step = 30, off = scroll % step;
    ctx.beginPath();
    for (let x = -off - step; x < W + step; x += step) { ctx.moveTo(x + step, GROUND); ctx.arc(x + step / 2, GROUND, step / 2 + 2, Math.PI, 0); }
    ctx.fill();
    ctx.strokeStyle = '#9d94d4'; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = -off - step; x < W + step; x += step) { ctx.moveTo(x - 2, GROUND); ctx.arc(x + step / 2, GROUND, step / 2 + 2, Math.PI, 0); }
    ctx.stroke();
    const k0 = Math.floor(scroll / 90);
    for (let k = k0; k < k0 + W / 90 + 2; k++) {
      const x = k * 90 - scroll + hash(k) * 30, y = GROUND + 18 + hash(k + 2) * 55, r = 6 + hash(k + 4) * 12;
      ctx.fillStyle = '#9d94d4'; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d6d0f5'; ctx.beginPath(); ctx.ellipse(x + 1, y + r * 0.18, r * 0.8, r * 0.2, 0, 0, Math.PI); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawYogurt(p) {
    const y = p.y + Math.sin(p.ph) * 6;
    ctx.save(); ctx.translate(p.x, y);
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.arc(0, 0, 30 + Math.sin(p.ph * 2) * 2, 0, Math.PI * 2); ctx.fill();
    // cup
    ctx.beginPath(); ctx.moveTo(-15, -12); ctx.lineTo(15, -12); ctx.lineTo(11, 18); ctx.lineTo(-11, 18); ctx.closePath();
    ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = '#9fb7cc'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#ff8fb8'; ctx.fillRect(-13, -1, 26, 9);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(-4, 3.5, 2.2, 0, Math.PI * 2); ctx.arc(5, 3.5, 2.2, 0, Math.PI * 2); ctx.fill();
    // lid
    rr(-18, -18, 36, 7, 3); ctx.fillStyle = '#ff5d93'; ctx.fill();
    ctx.restore();
  }

  // ---------- Render: frame ----------
  function render() {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const z = zoneColors();
    ctx.save();
    if (shake > 0) ctx.translate(rand(-6, 6) * shake * 3, rand(-6, 6) * shake * 3);
    drawBackground(z);
    if (magicMix > 0.01) drawSpace(magicMix);
    drawGround(z);
    if (magicMix > 0.01) drawMoonGround(magicMix);
    for (const o of obstacles) drawObstacle(o);
    for (const p of powerups) ({ rocket: drawRocketPickup, cape: drawCapePickup, yogurt: drawYogurt })[p.type](p);
    for (const v of viruses) drawVirus(v);
    drawHidki();
    for (const b of beams) {
      ctx.globalAlpha = clamp(b.life / 0.25, 0, 1);
      ctx.strokeStyle = '#fff6c2'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
      ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 2.5; ctx.stroke();
    }
    ctx.globalAlpha = 1;

    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.col;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    for (const t of texts) {
      ctx.globalAlpha = clamp(t.life / 0.9, 0, 1);
      ctx.font = `700 24px ${FONT}`;
      ctx.lineWidth = 5; ctx.strokeStyle = '#ffffff'; ctx.strokeText(t.txt, t.x, t.y);
      ctx.fillStyle = t.col; ctx.fillText(t.txt, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    if (banner && state !== 'title') {
      const a = clamp(Math.min(banner.life, 2.2 - banner.life) * 4, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = `700 40px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.direction = 'rtl';
      const y = 120 - (1 - a) * 14;
      ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(23,48,46,0.85)'; ctx.lineJoin = 'round';
      ctx.strokeText(banner.txt, W / 2, y);
      ctx.fillStyle = '#ffffff'; ctx.fillText(banner.txt, W / 2, y);
      ctx.direction = 'ltr';
      ctx.globalAlpha = 1;
    }
  }

  // ---------- Loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
