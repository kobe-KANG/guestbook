// 이벤트 NPC "웨딩 케이크 쌓기": 좌우로 움직이는 케이크 시트를 눌러서(터치·클릭·Space) 떨어뜨려 높이 쌓기 (기록은 api/cake.js)
// - 아래 층과 어긋난 부분은 잘려 떨어짐 → 폭이 좁아질수록 어려움. 폭이 MIN_W보다 좁아지거나 완전히 빗나가면 끝
// - 가운데를 PERFECT_PX 안으로 맞추면 아래 층에 딱 붙고 1점 더. 3번 연속 완벽 → '웨딩마치' 버프: 다음 BUFF_DROPS층은 시트가 넓게 나오고 잘리지 않음
// - 창을 닫거나 다른 탭으로 가면 그때 점수로 기록
// 아래쪽 랭킹·연락처·개발자 관리 칸은 공통 (js/board.js)

const Cake = (() => {
  const el = document.getElementById('cake-modal');
  const modal = UI.setupModal(el);
  const $ = (sel) => el.querySelector(sel);
  const form = $('.cake-start');
  const errorEl = $('.cake-error');
  const resultEl = $('.cake-result');
  const canvas = $('.cake-canvas');
  const ctx = canvas.getContext('2d');

  // 게임 좌표(논리 px). 캔버스는 CSS 폭에 맞춰 늘어남
  const W = 300;
  const H = 400;
  const GROUND = H - 40; // 케이크 받침 윗면
  const BASE_W = 200; // 첫 시트 폭
  const LH = 24; // 시트 높이
  const MIN_W = 8; // 이보다 좁아지면 끝
  const PERFECT_PX = 4;
  const BUFF_STREAK = 3; // 연속 완벽 횟수 → 웨딩마치
  const BUFF_DROPS = 5; // 웨딩마치 동안 쌓는 층 수
  const BUFF_EXTRA = 40; // 웨딩마치 동안 시트가 넓어지는 폭
  const FALL_MS = 160; // 시트가 떨어지는 시간
  const SPAWN_LOCK_MS = 120; // 새 시트가 나오고 이 시간 동안은 못 누름 (FALL_MS + 이것 > api/cake.js MIN_DROP_MS)
  const COLORS = [
    ['#fff4e0', '#f0d6ad'],
    ['#ffd6e0', '#f0a6bb'],
    ['#d8f3e8', '#a3d8c2'],
    ['#e6ddff', '#bcaef0'],
    ['#fff3b8', '#e9d27a'],
  ];

  let password = ''; // 이 창에서 한 번 맞게 입력하면 "다시 도전"에 그대로
  let busy = false;
  let mine = null;
  let g = null; // 진행 중인 게임

  // 개발자 모드 테스트 플레이(test)는 서버 없이 → 기록 안 됨
  const api = (body, test) =>
    test ? Promise.resolve({ score: body.score, ended: true, rank: null }) : postJson('/api/cake', body);
  const board = eventBoard(el, {
    path: '/api/cake',
    title: '🏆 케이크 높이 랭킹',
    score: (r) => `${r.score}점`,
    password: { get: () => password, set: (pw) => (password = pw) },
    isPlaying: () => Boolean(g),
    close: () => modal.close(),
    test: () => g || begin(null, true),
  });

  function showError(msg) {
    errorEl.textContent = msg || '';
    errorEl.hidden = !msg;
  }

  function setPlaying(on) {
    form.hidden = on;
    $('.cake-intro').hidden = on;
    canvas.hidden = !on;
    if (on) {
      resultEl.hidden = true;
      board.hideContact();
    }
  }

  /** settings: 개발자 모드일 때 "NPC 설정" 버튼이 여는 함수 */
  function open(settings) {
    if (g) return;
    mine = UI.getMine?.();
    board.reset(mine, settings);
    $('.cake-need').hidden = Boolean(mine);
    $('.cake-pw').hidden = !mine;
    $('.cake-go').hidden = !mine;
    $('.cake-go').textContent = '도전하기';
    form.elements.password.value = password;
    resultEl.hidden = true;
    setPlaying(false);
    showError('');
    modal.open();
    board.load();
  }

  // 도전 시작: 비밀번호 확인 → 토큰 → 게임
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy || !mine) return;
    const pw = form.elements.password.value;
    if (!pw) return showError('비밀번호를 입력해 주세요.');
    if (!mine.info.number) return showError('방금 만든 캐릭터는 1~2분 뒤에 도전할 수 있어요.');
    busy = true;
    showError('');
    $('.cake-go').textContent = '확인 중...';
    try {
      const r = await api({ action: 'start', number: mine.info.number, id: mine.info.id, password: pw });
      password = pw;
      begin(r.token);
    } catch (err) {
      showError(err.message);
    } finally {
      busy = false;
      $('.cake-go').textContent = '도전하기';
    }
  });

  // ---------- 게임 ----------

  function begin(token, test = false) {
    const now = performance.now();
    g = {
      token,
      test,
      stack: [{ x: (W - BASE_W) / 2, w: BASE_W, c: 0 }],
      moving: null,
      drop: null, // 떨어지는 중인 시트 { x, w, c, t0 }
      pieces: [], // 잘려서 떨어지는 조각
      texts: [], // 떠오르는 글자 (PERFECT!, 웨딩마치 …)
      notes: [], // 웨딩마치 음표
      score: 0,
      floors: 0,
      streak: 0,
      buff: 0, // 남은 웨딩마치 층 수
      cam: 0,
      over: false,
      last: now,
      hintUntil: now + 2200,
    };
    spawn(BASE_W);
    setPlaying(true);
    resizeCanvas();
    requestAnimationFrame(frame);
  }

  /** 다음 시트: 왼쪽·오른쪽 끝에서 번갈아 나와 좌우로 왕복. 층이 오를수록 빨라짐 */
  function spawn(w) {
    const fromLeft = g.floors % 2 === 0;
    g.moving = {
      x: fromLeft ? -w * 0.3 : W - w * 0.7,
      w,
      c: g.stack.length % COLORS.length,
      dir: fromLeft ? 1 : -1,
      speed: Math.min(110 + g.floors * 7, 330),
      at: performance.now(),
    };
  }

  const topY = (i) => GROUND - (i + 1) * LH; // i번째 층(0 = 첫 시트) 윗면
  const hoverY = () => topY(g.stack.length) - 34; // 움직이는 시트 윗면

  function drop() {
    if (!g || g.over || g.drop || !g.moving) return;
    if (performance.now() - g.moving.at < SPAWN_LOCK_MS) return;
    g.drop = { ...g.moving, t0: performance.now() };
    g.moving = null;
  }

  /** 떨어진 시트가 아래 층에 닿음: 잘라내기·완벽·웨딩마치 판정 */
  function land() {
    const d = g.drop;
    g.drop = null;
    const top = g.stack[g.stack.length - 1];
    const y = topY(g.stack.length);
    const left = Math.max(d.x, top.x);
    const right = Math.min(d.x + d.w, top.x + top.w);
    if (right - left <= 0) {
      g.pieces.push(piece(d.x, y, d.w, d.c, d.x < top.x ? -1 : 1));
      return gameOver('와르르!');
    }
    const perfect = Math.abs(d.x + d.w / 2 - (top.x + top.w / 2)) <= PERFECT_PX;
    let placed;
    if (perfect) placed = { x: top.x + top.w / 2 - d.w / 2, w: d.w, c: d.c }; // 가운데에 딱
    else if (g.buff > 0) placed = { x: d.x, w: d.w, c: d.c }; // 웨딩마치: 안 잘림
    else {
      placed = { x: left, w: right - left, c: d.c };
      if (d.x < left) g.pieces.push(piece(d.x, y, left - d.x, d.c, -1));
      if (d.x + d.w > right) g.pieces.push(piece(right, y, d.x + d.w - right, d.c, 1));
    }
    if (placed.w < MIN_W) {
      g.pieces.push(piece(placed.x, y, placed.w, placed.c, 1));
      return gameOver('너무 좁아졌어요!');
    }
    g.stack.push(placed);
    g.floors++;
    g.score += perfect ? 2 : 1;
    if (g.buff > 0) g.buff--;
    g.streak = perfect ? g.streak + 1 : 0;
    const cx = placed.x + placed.w / 2;
    if (perfect) {
      floatText(g.streak > 1 ? `PERFECT x${g.streak}` : 'PERFECT!', cx, y - 6, '#ff6f91');
      for (let i = 0; i < 8; i++) g.notes.push(sparkle(cx + (Math.random() - 0.5) * placed.w, y, '✦'));
    }
    if (g.streak >= BUFF_STREAK && g.buff === 0) {
      g.streak = 0;
      g.buff = BUFF_DROPS;
      floatText('💒 웨딩마치!', W / 2, y - 30, '#b27cff', 1600, 22);
      for (let i = 0; i < 14; i++) g.notes.push(sparkle(Math.random() * W, y + Math.random() * 60, Math.random() < 0.5 ? '♪' : '♫'));
    }
    spawn(g.buff > 0 ? Math.min(placed.w + BUFF_EXTRA, BASE_W) : placed.w);
  }

  const piece = (x, y, w, c, dir) => ({ x, y, w, c, vx: dir * (40 + Math.random() * 40), vy: -60, rot: 0, vr: dir * (2 + Math.random() * 2) });
  const sparkle = (x, y, ch) => ({ x, y, ch, vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 60, life: 1 });

  function floatText(text, x, y, color, ms = 900, size = 18) {
    g.texts.push({ text, x, y, color, size, t0: performance.now(), ms });
  }

  function gameOver(text) {
    g.over = true;
    g.moving = null;
    floatText(text, W / 2, topY(g.stack.length) - 20, '#e0524c', 1200, 24);
    setTimeout(() => finish(), 1100);
  }

  /** 기록 저장 → 결과·랭킹. stop이면 창을 닫았거나 다른 탭으로 감 */
  async function finish(stop = false) {
    const run = g;
    if (!run || run.done) return;
    run.done = run.over = true;
    let r = null;
    try {
      r = await api({ action: 'end', token: run.token, score: run.score, floors: run.floors }, run.test);
    } catch (err) {
      UI.showToast(err.message, 3000);
    }
    g = null;
    const rank = run.test ? ' (테스트 — 기록 안 됨)' : rankSuffix(r);
    if (stop || el.hidden) {
      if (r) UI.showToast(run.test ? `🎂 테스트 ${run.floors}층 ${r.score}점 (기록 안 됨)` : r.closed ? `🎂 ${run.floors}층 ${r.score}점${rank}` : `🎂 ${run.floors}층 ${r.score}점으로 기록했어요${rank}`, 3000);
      return;
    }
    setPlaying(false);
    $('.cake-go').textContent = '다시 도전';
    if (!r) return board.load();
    resultEl.textContent = `🎂 ${run.floors}층 · ${r.score}점${rank}`;
    resultEl.hidden = false;
    board.render({ ranking: r.ranking, hasContact: r.hasContact });
    board.load(); // 내 도전 기록까지
  }

  function frame(now) {
    const run = g;
    if (!run || run.done) return;
    if (el.hidden) return finish(true); // 창을 닫음 (× · ESC)
    const dt = Math.min(0.05, (now - run.last) / 1000);
    run.last = now;

    const m = run.moving;
    if (m) {
      m.x += m.dir * m.speed * dt;
      const cx = m.x + m.w / 2;
      if ((cx < 20 && m.dir < 0) || (cx > W - 20 && m.dir > 0)) m.dir = -m.dir;
    }
    if (run.drop && now - run.drop.t0 >= FALL_MS) land();
    for (const p of run.pieces) {
      p.vy += 900 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    run.pieces = run.pieces.filter((p) => p.y - run.cam < H + 80);
    for (const s of run.notes) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt * 0.9;
    }
    run.notes = run.notes.filter((s) => s.life > 0);
    run.texts = run.texts.filter((t) => now - t.t0 < t.ms);
    // 쌓일수록 화면이 위로 따라감: 맨 위 층이 화면 45% 높이쯤에 오게
    const want = Math.min(0, topY(run.stack.length) - H * 0.45);
    run.cam += (want - run.cam) * Math.min(1, dt * 6);

    draw(run, now);
    requestAnimationFrame(frame);
  }

  // ---------- 그리기 ----------

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
  }

  function draw(run, now) {
    const s = canvas.width / W;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    // 배경: 위로 갈수록 하늘색이 짙어짐
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    const high = Math.min(1, -run.cam / 1500);
    sky.addColorStop(0, high > 0.5 ? '#cfe3ff' : '#ffe8ef');
    sky.addColorStop(1, '#fff8f0');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    for (let i = 0; i < 18; i++) {
      const x = (i * 97) % W;
      const y = (((i * 61 - run.cam * 0.3) % H) + H) % H;
      ctx.fillRect(x, y, 2, 2);
    }

    ctx.save();
    ctx.translate(0, -run.cam);
    // 케이크 받침
    ctx.fillStyle = '#d9dde6';
    ctx.fillRect(W / 2 - 125, GROUND, 250, 9);
    ctx.fillStyle = '#b7bdcb';
    ctx.fillRect(W / 2 - 10, GROUND + 9, 20, 22);
    ctx.fillRect(W / 2 - 40, GROUND + 28, 80, 5);

    run.stack.forEach((l, i) => drawLayer(l.x, topY(i), l.w, l.c));
    // 웨딩마치 중에는 맨 위에 반짝이는 테두리
    if (run.buff > 0 && !run.over) {
      const t = run.stack[run.stack.length - 1];
      ctx.strokeStyle = `rgba(178,124,255,${0.5 + 0.4 * Math.sin(now / 120)})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(t.x - 2, topY(run.stack.length - 1) - 2, t.w + 4, LH + 4);
    }
    const m = run.moving;
    if (m) drawLayer(m.x, hoverY(), m.w, m.c, run.buff > 0);
    if (run.drop) {
      const k = Math.min(1, (now - run.drop.t0) / FALL_MS);
      drawLayer(run.drop.x, hoverY() + (topY(run.stack.length) - hoverY()) * k * k, run.drop.w, run.drop.c, run.buff > 0);
    }
    for (const p of run.pieces) {
      ctx.save();
      ctx.translate(p.x + p.w / 2, p.y + LH / 2);
      ctx.rotate(p.rot);
      drawLayer(-p.w / 2, -LH / 2, p.w, p.c);
      ctx.restore();
    }
    ctx.textAlign = 'center';
    for (const n of run.notes) {
      ctx.globalAlpha = Math.max(0, n.life);
      ctx.fillStyle = n.ch === '✦' ? '#ffc93c' : '#b27cff';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(n.ch, n.x, n.y);
    }
    ctx.globalAlpha = 1;
    for (const t of run.texts) {
      const k = (now - t.t0) / t.ms;
      ctx.globalAlpha = 1 - k * k;
      ctx.font = `800 ${t.size}px ${CONFIG.fontFamily}`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#fff';
      ctx.strokeText(t.text, t.x, t.y - k * 26);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y - k * 26);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // 점수·층·웨딩마치 표시 (화면 고정)
    ctx.textAlign = 'center';
    ctx.font = `800 30px ${CONFIG.fontFamily}`;
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#fff';
    ctx.strokeText(run.score, W / 2, 42);
    ctx.fillStyle = '#e8615a';
    ctx.fillText(run.score, W / 2, 42);
    ctx.font = `600 13px ${CONFIG.fontFamily}`;
    ctx.fillStyle = '#8a5a52';
    ctx.fillText(`${run.floors}층`, W / 2, 62);
    if (run.buff > 0) {
      ctx.fillStyle = '#b27cff';
      ctx.fillText(`💒 웨딩마치 ${run.buff}층 남음`, W / 2, 80);
    }
    if (now < run.hintUntil) {
      ctx.globalAlpha = Math.min(1, (run.hintUntil - now) / 400);
      ctx.fillStyle = '#6b4a44';
      ctx.font = `600 14px ${CONFIG.fontFamily}`;
      ctx.fillText('화면을 눌러 시트를 떨어뜨려요!', W / 2, H - 8);
      ctx.globalAlpha = 1;
    }
  }

  /** 케이크 시트 한 장: 몸통 + 아래 그림자 + 위 크림(흘러내림) + 진주 장식 */
  function drawLayer(x, y, w, c, glow = false) {
    const [body, shade] = COLORS[c];
    if (glow) {
      ctx.shadowColor = 'rgba(178,124,255,.8)';
      ctx.shadowBlur = 10;
    }
    ctx.fillStyle = body;
    ctx.fillRect(x, y, w, LH);
    ctx.shadowBlur = 0;
    ctx.fillStyle = shade;
    ctx.fillRect(x, y + LH - 6, w, 6);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, w, 5);
    for (let dx = 4; dx < w - 2; dx += 12) {
      ctx.beginPath();
      ctx.arc(x + dx, y + 5, 3.2, 0, Math.PI);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    for (let dx = 8; dx < w - 4; dx += 14) {
      ctx.beginPath();
      ctx.arc(x + dx, y + 13, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(120,80,70,.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, LH - 1);
  }

  // 누르기: 캔버스 터치·클릭, Space
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    drop();
  });
  document.addEventListener('keydown', (e) => {
    if (!g || el.hidden || (e.code !== 'Space' && e.key !== ' ')) return;
    e.preventDefault();
    drop();
  });
  // 다른 탭으로 가면 그 점수로 기록
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && g) finish(true);
  });

  return { open };
})();
