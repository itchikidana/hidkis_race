/* המירוץ של חידקי — an endless runner starring Hidki, a good bacterium.
   Everything is drawn on one canvas in "world units": the world is always 540 units tall
   and as wide as the screen's aspect ratio allows. */
(() => {
  'use strict';

  // ---------- Tunables ----------
  const H = 540;               // world height
  const GROUND = 452;          // y of the ground surface
  const HX = 170;              // Hidki's x position
  const BODY_RX = 36, BODY_RY = 30;
  const LEG = 20;
  const REST_Y = GROUND - LEG - BODY_RY + 8; // body centre while standing
  const GRAV = 2700;
  const JUMP_V = 960;
  const DJUMP_V = 820;
  const JUMP_CUT = 0.45;       // velocity kept when the jump key is released early
  const START_SPEED = 340;
  const SPEED_GAIN = 460;      // speed approaches START_SPEED + SPEED_GAIN
  const MAX_HEARTS = 3;
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
    shield: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'sine', 0.1, null, i * 0.05)),
    zone: () => [659, 784, 988].forEach((f, i) => tone(f, 0.18, 'triangle', 0.09, null, i * 0.09)),
    over: () => [523, 440, 349, 262].forEach((f, i) => tone(f, 0.25, 'triangle', 0.1, null, i * 0.16)),
  };
  function syncMute() { ui.muteBtn.classList.toggle('muted', muted); ui.muteBtn.setAttribute('aria-label', muted ? 'הפעלת צלילים' : 'השתקה'); }
  syncMute();

  // ---------- State ----------
  let state = 'title';      // title | play | paused | over
  let best = store.get('hidki.best', 0);
  let hero, obstacles, viruses, powerups, particles, texts;
  let speed, elapsed, dist, scroll, caught, hearts, combo, comboTimer;
  let obstGap, virusGap, powerGap, shake, zoneIdx, banner, overTimer;

  // Scenery that exists in every state
  const cells = Array.from({ length: 7 }, (_, i) => ({ x: i * 260 + rand(0, 120), y: rand(60, 280), r: rand(40, 95), ph: rand(0, 6) }));
  const bubbles = Array.from({ length: 22 }, () => ({ x: rand(0, 1600), y: rand(0, H), r: rand(3, 10), s: rand(12, 40) }));

  function reset() {
    hero = { y: REST_Y, vy: 0, onGround: true, jumps: 0, holding: false, buffer: 0, limb: 0, sx: 1, sy: 1, invuln: 0, shield: 0, t: 0 };
    obstacles = []; viruses = []; powerups = []; particles = []; texts = [];
    speed = START_SPEED; elapsed = 0; dist = 0; caught = 0; hearts = MAX_HEARTS;
    combo = 0; comboTimer = 0; shake = 0; zoneIdx = 0; banner = null; overTimer = 0;
    obstGap = 700; virusGap = 380; powerGap = START_SPEED * 22;
  }
  reset();
  scroll = 0;

  // ---------- Input ----------
  function press() {
    if (state === 'title') return start();
    if (state !== 'play') return;
    hero.holding = true;
    if (hero.onGround) jump(false);
    else if (hero.jumps < 2) jump(true);
    else hero.buffer = 0.14;
  }
  function release() {
    hero.holding = false;
    if (state === 'play' && hero.vy < -200) hero.vy *= JUMP_CUT;
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
    const pattern = pick(['line', 'arc', 'single', 'single', 'low']);
    const x0 = W + 60;
    if (pattern === 'line') { const y = rand(250, 330); for (let i = 0; i < 4; i++) addVirus(x0 + i * 52, y); }
    else if (pattern === 'arc') { for (let i = 0; i < 5; i++) addVirus(x0 + i * 52, 300 - Math.sin((i / 4) * Math.PI) * 90); }
    else if (pattern === 'low') { for (let i = 0; i < 3; i++) addVirus(x0 + i * 52, REST_Y - 6); }
    else addVirus(x0, rand(220, 380), Math.random() < 0.18);
    // keep viruses out of obstacles
    for (const v of viruses) for (const o of obstacles) {
      if (v.x > o.x - 30 && v.x < o.x + o.w + 30 && v.baseY > GROUND - o.h - 34) v.baseY = v.y = GROUND - o.h - 40;
    }
  }
  function spawnPower() { powerups.push({ x: W + 60, y: rand(250, 320), ph: 0, type: 'yogurt' }); }

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
    const runSpeed = playing ? speed : state === 'title' ? 260 : state === 'over' ? Math.max(0, speed * overTimer) : 0;
    if (state === 'paused') return;

    if (playing) {
      elapsed += dt;
      speed = START_SPEED + SPEED_GAIN * (1 - Math.exp(-elapsed / 80));
      dist += speed * dt;
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
    if (!h.onGround) {
      h.vy += GRAV * dt * (h.vy > 0 ? 1.15 : 1);
      h.y += h.vy * dt;
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
    h.limb += dt * (runSpeed / 22) * (h.onGround ? 1 : 1.5);
    h.invuln = Math.max(0, h.invuln - dt);
    h.shield = Math.max(0, h.shield - dt);
    if (playing && h.onGround && Math.random() < dt * 9) particles.push({ x: HX - 10, y: GROUND - 3, vx: -runSpeed * 0.3, vy: rand(-40, -10), life: 0.4, max: 0.4, col: 'rgba(255,255,255,0.8)', r: rand(2, 4) });

    // spawning
    if (playing) {
      const sf = (speed - START_SPEED) / SPEED_GAIN;
      obstGap -= speed * dt;
      if (obstGap <= 0) { const o = spawnObstacle(); obstGap = speed * rand(0.95, 1.75 - 0.45 * sf) + o.w + 120; }
      virusGap -= speed * dt;
      if (virusGap <= 0) { spawnViruses(); virusGap = speed * rand(0.9, 1.9); }
      powerGap -= speed * dt;
      if (powerGap <= 0) { spawnPower(); powerGap = speed * rand(18, 30); }
    }

    // world objects scroll
    const move = runSpeed * dt;
    for (const o of obstacles) o.x -= move;
    for (const v of viruses) { v.x -= move; v.ph += dt * 3; v.rot += dt * 1.4; v.y = v.baseY + Math.sin(v.ph) * 7; }
    for (const p of powerups) { p.x -= move; p.ph += dt * 3; }
    obstacles = obstacles.filter((o) => o.x + o.w > -60);
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
          p.dead = true; h.shield = 7; sfx.shield();
          floatText(p.x, p.y - 26, 'מגן יוגורט!', '#e2457a');
          burst(p.x, p.y, 18, ['#ffffff', '#ffd1e3', '#bfe9ff'], 240, 0.6, 4);
        }
      }
      // obstacles
      for (const o of obstacles) {
        if (o.hit) continue;
        if (obstacleRects(o).some((b) => circleRect(HX + 2, h.y + 4, hr, b))) {
          if (h.shield > 0) {
            o.hit = true; o.flyVy = -600; o.spin = 0;
            h.shield = 0; sfx.hit();
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

    for (const p of particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; }
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
  const C = {
    body1: '#c6f68a', body2: '#5bcf55', body3: '#2f9b3c', outline: '#1d6f33',
    limb: '#2f9b3c', limbBack: '#237d34', shoe: '#ff5d73', shoeBack: '#d93a55', sole: '#ffffff',
  };

  function drawLimb(px, py, ang, len, color, end, shoe) {
    const ex = px + Math.sin(ang) * len, ey = py + Math.cos(ang) * len;
    ctx.strokeStyle = color; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(ex, ey); ctx.stroke();
    if (end === 'foot') {
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(-ang * 0.25);
      ctx.fillStyle = shoe; ctx.beginPath(); ctx.ellipse(4, 1, 9, 5.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.sole; ctx.fillRect(-4, 4, 16, 2.5);
      ctx.restore();
    } else {
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(ex, ey, 5.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  function bodyPath(t) {
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const w = 1 + 0.025 * Math.sin(a * 3 + t * 5) + 0.015 * Math.sin(a * 5 - t * 3);
      const x = Math.cos(a) * BODY_RX * w, y = Math.sin(a) * BODY_RY * w;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
  }

  function drawHidki() {
    const h = hero;
    const x = HX, y = h.y, t = h.t, a = h.limb;
    // ground shadow
    const lift = clamp((REST_Y - y) / 220, 0, 1);
    ctx.fillStyle = 'rgba(23,48,46,0.18)';
    ctx.beginPath(); ctx.ellipse(x, GROUND + 3, 34 * (1 - lift * 0.5), 7 * (1 - lift * 0.5), 0, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    ctx.translate(x, y);
    if (h.invuln > 0 && Math.floor(h.invuln * 14) % 2 === 0) ctx.globalAlpha = 0.4;

    // flagellum tail
    ctx.strokeStyle = C.body3; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i <= 16; i++) {
      const px = -BODY_RX + 2 - i * 3.2;
      const py = 4 + Math.sin(i * 0.7 - t * 14) * (2 + i * 0.5);
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke();

    // back limbs
    drawLimb(-8, 20, a + Math.PI, LEG, C.limbBack, 'foot', C.shoeBack);
    drawLimb(-24, 4, -a * 1.1 + Math.PI, 17, C.limbBack, 'hand');

    // body (squash & stretch around the feet)
    ctx.save();
    ctx.translate(0, BODY_RY);
    ctx.scale(h.sx, h.sy);
    ctx.translate(0, -BODY_RY);
    const g = ctx.createRadialGradient(-12, -14, 4, 0, 0, BODY_RX + 6);
    g.addColorStop(0, C.body1); g.addColorStop(0.55, C.body2); g.addColorStop(1, C.body3);
    // little hairs (pili)
    ctx.strokeStyle = C.body3; ctx.lineWidth = 2;
    for (let i = 0; i < 13; i++) {
      const ang = Math.PI + (i / 12) * Math.PI;
      const wv = Math.sin(t * 6 + i) * 0.08;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * BODY_RX * 0.96, Math.sin(ang) * BODY_RY * 0.96);
      ctx.lineTo(Math.cos(ang + wv) * (BODY_RX + 7), Math.sin(ang + wv) * (BODY_RY + 7));
      ctx.stroke();
    }
    bodyPath(t);
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = C.outline; ctx.stroke();
    // spots and shine
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    [[-20, 8, 4], [-12, 16, 2.8], [-24, -4, 2.4], [4, 18, 2.2]].forEach(([sx, sy, r]) => { ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.ellipse(-14, -16, 10, 5, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // front limbs
    drawLimb(8, 20, a, LEG, C.limb, 'foot', C.shoe);
    drawLimb(26, 6, -a * 1.1, 17, C.limb, 'hand');

    // face — always the same, never squashed or rotated
    drawFace();

    ctx.restore();

    // shield bubble
    if (h.shield > 0) {
      const blink = h.shield < 1.5 && Math.floor(h.shield * 8) % 2 === 0;
      if (!blink) {
        ctx.save();
        ctx.translate(x, y + 2);
        const r = 54 + Math.sin(t * 6) * 2;
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
    // eyes
    for (const [ex, ey] of [[6, -8], [24, -7]]) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(ex, ey, 8, 9.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = C.outline; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#17302e';
      ctx.beginPath(); ctx.arc(ex + 2.2, ey + 1, 4.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(ex + 3.8, ey - 1.2, 1.7, 0, Math.PI * 2); ctx.fill();
    }
    // cheeks
    ctx.fillStyle = 'rgba(255,111,150,0.45)';
    ctx.beginPath(); ctx.ellipse(-3, 7, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(31, 7, 4.5, 3, 0, 0, Math.PI * 2); ctx.fill();
    // smile
    ctx.fillStyle = '#7a1f2e';
    ctx.beginPath(); ctx.moveTo(6, 6); ctx.quadraticCurveTo(15, 22, 26, 6); ctx.quadraticCurveTo(15, 11, 6, 6); ctx.fill();
    ctx.fillStyle = '#ff8fa3';
    ctx.beginPath(); ctx.ellipse(16, 13, 4, 2.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = C.outline; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(6, 6); ctx.quadraticCurveTo(15, 22, 26, 6); ctx.stroke();
  }

  // ---------- Render: obstacles ----------
  function drawObstacle(o) {
    const top = GROUND - o.h;
    ctx.save();
    if (o.flyY !== undefined) { ctx.translate(o.x + o.w / 2, top + o.h / 2 + o.flyY); ctx.rotate(o.spin); ctx.translate(-(o.x + o.w / 2), -(top + o.h / 2)); }
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
    // grumpy face (looking at Hidki on the left)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(-6, -1, 4.2, 0, Math.PI * 2); ctx.arc(5, -1, 4.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#17302e';
    ctx.beginPath(); ctx.arc(-7.5, 0, 2.2, 0, Math.PI * 2); ctx.arc(3.5, 0, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#17302e'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-11, -7); ctx.lineTo(-3, -5); ctx.moveTo(10, -7); ctx.lineTo(2, -5); ctx.stroke();
    ctx.beginPath(); ctx.arc(-1, 9, 4, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    ctx.restore();
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
    drawGround(z);
    for (const o of obstacles) drawObstacle(o);
    for (const p of powerups) drawYogurt(p);
    for (const v of viruses) drawVirus(v);
    drawHidki();

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
