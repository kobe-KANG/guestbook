class MapScene extends Phaser.Scene {
  constructor() {
    super('MapScene');
  }

  preload() {
    // 진행률 단위: 배경 1칸 + 캐릭터 1명당 1칸. 배경 몫은 로드 진행에 맞춰 0~1로 채운다
    const { onProgress } = this.sys.settings.data ?? {};
    this.load.on('progress', (value) => onProgress?.(value));
    if (CONFIG.mapImage) this.load.image('map', CONFIG.mapImage);
    const wg = CONFIG.warpgate;
    if (wg) this.load.spritesheet('warpgate', wg.image, { frameWidth: wg.frameWidth, frameHeight: wg.frameHeight });
  }

  create({ guests = [], live = false, onProgress, onReady } = {}) {
    if (this.textures.exists('map')) {
      this.add.image(0, 0, 'map').setOrigin(0).setDisplaySize(CONFIG.width, CONFIG.height);
    } else {
      // 배경 이미지가 없거나 로드 실패 시 임시 맵
      this.drawBackground();
      this.drawPlatforms();
      this.drawWeddingArch();
    }

    this.view = new MapView(this);
    this.addPetals();
    this.addWarpgate();

    // ?dev = 이동 가능 영역 편집기, ?debug = 발판 위치만 선으로 표시
    this.control = new Controller(this); // 캐릭터 직접 조종 (방명록 팝업 "조종하기", 등록 직후, 개발자 모드)
    const params = new URLSearchParams(location.search);
    if (params.has('dev')) this.dev = new DevMode(this);
    else if (params.has('debug')) this.drawFloorGuides();

    this.onSelect = (character) => {
      // 이벤트 NPC: 가위바위보 머신·도둑 잡기·케이크 쌓기 (개발자 모드면 관리 칸 + "NPC 설정" 버튼)
      const event = character instanceof NpcCharacter && { rps: Rps, chase: Chase, cake: Cake }[character.npc.event];
      if (event) return event.open(this.dev && (() => this.dev.openNpcSettings(character)));
      if (this.dev && character instanceof NpcCharacter) return this.dev.openNpcSettings(character); // 개발자 모드: NPC 설정 창
      // 앨범 NPC: 그 앨범 사진 (img/gallery/<album>/)
      const album = character instanceof NpcCharacter && CONFIG.npcs[character.npc.id]?.album;
      if (album) return UI.openAlbum(album, character.info.name);
      const isCouple = character instanceof CoupleCharacter;
      // 일반 방문자는 내 캐릭터만 메뉴(모드 전환·캐릭터 수정)로 조종·수정 → 캐릭터창엔 버튼 없음.
      // 개발자 모드에선 테스트용으로 하객·신랑신부 조종, 하객 수정, 신랑·신부 멘트 수정 버튼을 보여준다
      const canControl = this.dev && !character.info.npc;
      const canManage = this.dev && !character.info.npc && !isCouple && character.info.number;
      const coupleEdit = isCouple && this.dev ? { onEdit: () => this.dev.openCoupleSettings(character) } : null;
      UI.openGuestbook(
        { ...character.info, avatarUrl: character.getAvatarUrl() },
        canControl
          ? {
              controlling: this.control.controlled === character,
              onControl: () => this.control.take(character, { zoom: true }),
              // 조종 끝내기 = 기본 모드: 캐릭터는 스스로 돌아다니고 화면은 처음 보기로
              onRelease: () => {
                this.control.release();
                this.view.touched = false;
                this.view.reset();
                if (matchMedia('(pointer: coarse)').matches) UI.showToast('두 손가락으로 확대,\n드래그로 이동할 수 있어요', 3000);
              },
            }
          : null,
        coupleEdit ??
        (canManage
          ? {
              info: character.info,
              onUpdated: (guest) => character.updateInfo(guest),
              onDeleted: () => this.removeGuest(character),
            }
          : null)
      );
    };

    // 신랑/신부: 제자리 고정 (CONFIG.couple, 기본은 무대 가운데)
    this.couple = COUPLE.map((info) => new CoupleCharacter(this, { ...info, ...coupleTexts(info.id) }, { onSelect: this.onSelect }));

    this.guests = [];
    this.guestIds = new Set();
    guests.forEach((info) => this.addGuest(info));

    // NPC (js/npcs.js): 토끼 푸딩, 얼룩말, 고양이 4마리, 강아지 에쏘, 택시
    // 개발자 모드에서 삭제한 기본 NPC(CONFIG.npcs[id].deleted)는 빼고
    this.npcs = NPCS.filter((npc) => !CONFIG.npcs[npc.id]?.deleted).map((npc) => new NpcCharacter(this, npc, { onSelect: this.onSelect }));

    // 처음 스폰한 캐릭터들의 이미지가 모두 적용되면 로딩 화면을 걷는다
    const initial = [...this.couple, ...this.guests, ...this.npcs];
    let done = 0;
    const report = () => onProgress?.(1 + done);
    report();
    Promise.all(
      initial.map((c) =>
        c.ready.then(() => {
          done++;
          report();
        })
      )
    ).then(() => onReady?.());

    // 새 방명록이 올라오면 주기적으로 반영 (식장 스크린에 켜둘 때용)
    if (live) {
      this.time.addEvent({
        delay: CONFIG.refreshInterval,
        loop: true,
        callback: async () => {
          const latest = await fetchGuests();
          latest?.forEach((info) => this.addGuest(info));
        },
      });
    }
  }

  /** 하객 한 명을 스폰 (atSpawn이면 시작점, 아니면 랜덤 층). 이미 있는 id면 무시. */
  addGuest(info, { atSpawn = false } = {}) {
    if (this.guestIds.has(info.id)) return null;
    this.guestIds.add(info.id);
    if (!info.spriteUrl) Object.assign(info, defaultSprite(info.id)); // 캐릭터 없이 등록한 하객 → 기본 캐릭터
    const spawn = atSpawn ? spawnPoint() : null;
    const floor = spawn ? CONFIG.floors[spawn.floor] : pickGuestFloor();
    const guest = new GuestCharacter(this, floor, info, { onSelect: this.onSelect, x: spawn?.x });
    this.guests.push(guest);
    return guest;
  }

  /** 하객 삭제: 맵에서 지운다 (id는 guestIds에 남겨 재조회 때 다시 생기지 않게) */
  removeGuest(character) {
    if (this.control.controlled === character) this.control.release();
    this.guests = this.guests.filter((g) => g !== character);
    character.destroy();
  }

  /**
   * 메뉴 "전체 사진 찍기": 화면이 잠깐 까매진 사이 하객을 신랑·신부 가까이 줄 세움 → 밝아지면 찰칵(PNG 저장)
   * → 그 자리에서 다시 돌아다니고 원래 모드(조종 중이던 캐릭터 / 보던 화면)로 돌아감
   */
  async groupPhoto() {
    if (this.photoing) return;
    if (this.onTick) return UI.showToast('게임 중에는 사진을 찍을 수 없어요');
    this.photoing = true;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const shade = document.getElementById('photo-shade');
    const prev = this.control.controlled;
    const saved = { zoom: this.view.zoom, center: { ...this.view.center }, touched: this.view.touched };

    shade.hidden = false;
    shade.offsetWidth; // 트랜지션이 걸리게
    shade.classList.add('dark');
    await wait(400);

    // 까만 동안 자리 잡기
    this.control.release();
    for (const c of this.couple) {
      c.posing = true;
      c.standAtHome();
    }
    const spots = this.photoSpots(this.guests.length);
    this.guests.forEach((g, i) => (spots[i] ? g.startPose(spots[i].name, spots[i].x) : g.startPose(g.floorName, g.x)));

    // 보는 화면은 맵 전체
    const all = [...this.couple, ...this.guests];
    Object.assign(this.view, { touched: true, zoom: this.view.fitZoom, center: { x: CONFIG.width / 2, y: CONFIG.height / 2 } });
    this.view.apply();

    shade.classList.remove('dark');
    await wait(1800); // 밝아지고 잠깐 포즈 (점프·앉기)

    // 찰칵: 하얗게 번쩍 → 가려진 동안 캔버스를 맵 크기 × PHOTO.scale로 키워 맵 전체를 찍고 되돌림
    shade.classList.add('white', 'flash');
    const { width, height } = this.scale;
    this.scale.resize(CONFIG.width * PHOTO.scale, CONFIG.height * PHOTO.scale);
    Object.assign(this.view, { zoom: PHOTO.scale, center: { x: CONFIG.width / 2, y: CONFIG.height / 2 } });
    this.view.apply();
    await wait(100); // 화면 밖이라 숨겼던 캐릭터가 다시 보이게 몇 프레임
    const img = await new Promise((r) => this.game.renderer.snapshot(r));
    this.scale.resize(width, height);
    this.scale.setZoom(1 / DPR);
    this.view.zoom = this.view.fitZoom;
    this.view.apply();
    // 큰 data URL을 그대로 내려받으면 브라우저가 죽을 수 있어 Blob URL로
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await (await fetch(img.src)).blob());
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    a.download = `wedding-photo-${Date.now()}.png`;
    a.click();
    shade.classList.remove('flash');
    UI.showToast('사진을 저장했어요');
    await wait(1200);

    for (const c of all) {
      c.posing = false;
      c.idlePose = null;
      c.stateTimer = 0; // 바로 다시 돌아다님
    }
    if (prev?.active) this.control.take(prev, { zoom: true });
    else {
      Object.assign(this.view, saved);
      this.view.apply();
    }
    shade.hidden = true;
    shade.classList.remove('white');
    this.photoing = false;
  }

  /**
   * 단체 사진 자리 n개 (맵 전체 발판, 신랑·신부에서 가까운 순). 다 못 서면 간격을 max → min으로 좁히고,
   * 최소 간격으로도 모자라면 같은 자리에 반 칸씩 비껴 겹쳐 세운다
   */
  photoSpots(n) {
    let spots = [];
    for (let gap = PHOTO.maxGap; gap >= PHOTO.minGap; gap -= 5) {
      spots = this.photoGrid(gap);
      if (spots.length >= n) return spots.slice(0, n);
    }
    if (!spots.length) return [];
    return Array.from({ length: n }, (_, i) => {
      const s = spots[i % spots.length];
      const round = Math.floor(i / spots.length); // 0 = 제자리, 1 = 오른쪽 7px, 2 = 왼쪽 7px, 3 = 오른쪽 14px …
      return { ...s, x: s.x + Math.ceil(round / 2) * 7 * (round % 2 ? 1 : -1) };
    });
  }

  /** 신랑·신부 가운데를 기준으로 발판마다 gap 간격 칸 + 거리 d (세로로 먼 발판은 덜 가깝게) → 가까운 순 */
  photoGrid(gap) {
    const cx = (this.couple[0].x + this.couple[1].x) / 2;
    const cy = (this.couple[0].y + this.couple[1].y) / 2;
    const spots = [];
    for (const [name, f] of Object.entries(CONFIG.floors)) {
      const { x1, x2 } = floorSpan(f);
      for (let k = Math.ceil((x1 + 10 - cx) / gap); cx + k * gap <= x2 - 10; k++) {
        const x = cx + k * gap;
        const y = floorY(f, x);
        if (this.couple.some((c) => Math.abs(c.x - x) < 40 && Math.abs(c.y - y) < 30)) continue; // 신랑·신부 자리
        spots.push({ name, x, d: Math.hypot(x - cx, (y - cy) * 2) });
      }
    }
    return spots.sort((a, b) => a.d - b.d);
  }

  /** 맵 전체에 꽃잎이 조금씩 흩날리는 효과 (위에서 천천히 떨어지며 좌우로 흔들림) */
  addPetals() {
    // 꽃잎 텍스처 2종 (진분홍 / 연분홍), 확대해도 선명하게 2배로 그림
    const colors = [[0xff9fb8, 0xffd3de], [0xffc4d4, 0xfff0f4]];
    colors.forEach(([base, light], i) => {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(base, 1).fillEllipse(8, 5, 16, 10);
      g.fillStyle(light, 1).fillEllipse(6, 4, 7, 4);
      g.generateTexture(`petal${i}`, 16, 10);
      g.destroy();
    });
    const c = CONFIG.petals;
    const common = {
      x: { min: -40, max: CONFIG.width + 40 },
      y: -20,
      lifespan: ((CONFIG.height + 60) / c.fallSpeed.min) * 1000, // 가장 느린 꽃잎도 바닥까지
      speedY: c.fallSpeed,
      speedX: c.drift,
      scale: { min: 0.35, max: 0.7 },
      rotate: { start: 0, end: 360 },
      alpha: { start: c.alpha, end: c.alpha * 0.6 },
      frequency: c.frequency * 2, // 두 종류가 반씩
      advance: 60000, // 처음부터 화면 곳곳에 꽃잎이 있게 미리 흘려 둠
    };
    this.petals = ['petal0', 'petal1'].map((key) => {
      const emitter = this.add.particles(0, 0, key, common).setDepth(15000);
      // 좌우로 살랑살랑: 꽃잎마다 다른 주기로 가로 속도를 흔든다
      emitter.addParticleProcessor({
        active: true,
        update: (particle, delta) => {
          particle.sway ??= Math.random() * Math.PI * 2;
          particle.sway += delta * 0.0015;
          particle.x += Math.sin(particle.sway) * 0.25 * (delta / 16);
        },
      });
      return emitter;
    });
  }

  /** 개발자 모드에서 발판/사다리를 바꾸면 하객들을 새 지도에 맞춘다 */
  refreshMap() {
    for (const guest of this.guests) guest.onMapChanged();
    for (const n of this.npcs) n.onMapChanged();
    for (const c of this.couple) if (!c.controlled) c.onMapChanged(); // 자리(CONFIG.couple)가 바뀌었을 수 있음
    this.placeWarpgate();
  }

  /** 시작점(CONFIG.spawn)에 워프게이트 애니메이션 (이미지 로드 실패 시 생략) */
  addWarpgate() {
    const wg = CONFIG.warpgate;
    if (!wg || !this.textures.exists('warpgate')) return;
    this.anims.create({
      key: 'warpgate',
      frames: this.anims.generateFrameNumbers('warpgate', { start: 0, end: wg.frames - 1 }),
      frameRate: wg.fps,
      repeat: -1,
    });
    const scale = wg.height / wg.frameHeight;
    this.warpgate = this.add.sprite(0, 0, 'warpgate').setOrigin(0.5, wg.originY).setScale(scale).play('warpgate');
    this.placeWarpgate();
  }

  /** 시작점이 바뀌면(개발자 모드 편집·되돌리기) 따라 옮기고, 시작점이 없으면 숨김 */
  placeWarpgate() {
    if (!this.warpgate) return;
    const spawn = spawnPoint();
    this.warpgate.setVisible(!!spawn);
    // depth는 발 높이 바로 아래 → 시작점에 선 캐릭터가 게이트 앞에 보임
    if (spawn) this.warpgate.setPosition(spawn.x, spawn.y).setDepth(spawn.y - 1);
  }

  update(_time, delta) {
    this.control.update();
    this.onTick?.(delta); // 도둑 잡기 (js/chase.js)
    for (const guest of this.guests) guest.tick(delta);
    for (const c of this.couple) c.tick(delta); // 신랑/신부는 개발자 모드에서 조종할 때만 움직임
    for (const n of this.npcs) n.tick(delta);

    // 화면 밖 캐릭터는 그리지 않고 말풍선·효과도 만들지 않음 (하객이 많아도 덜 버벅이게). 움직임은 계속
    const v = this.cameras.main.worldView;
    const m = 120; // 가장자리 여유: 이름표·말풍선이 걸쳐 보이는 캐릭터도 그리게
    const onScreen = (c) => c.x > v.x - m && c.x < v.right + m && c.y > v.y - m / 2 && c.y - 150 < v.bottom;
    for (const g of this.guests) g.setVisible(!this.hideGuests && onScreen(g));
    for (const c of [...this.couple, ...this.npcs]) c.setVisible(onScreen(c));
  }

  // ---------- 임시 맵 그리기 (맵 이미지 준비되면 CONFIG.mapImage로 대체) ----------

  drawFloorGuides() {
    const g = this.add.graphics().setDepth(10000);
    for (const [name, f] of Object.entries(CONFIG.floors)) {
      g.lineStyle(3, isStage(name) ? 0xffd700 : 0xff0000, 0.9);
      g.strokePoints(f.path.map(([x, y]) => ({ x, y })));
      g.fillStyle(0xff0000, 1);
      f.path.forEach(([x, y]) => g.fillCircle(x, y, 4));
      const [x, y] = f.path[0];
      this.add
        .text(x, y + 4, name, { fontSize: '12px', color: '#fff', backgroundColor: '#c00' })
        .setDepth(10000);
    }
    // 사다리(초록) / 로프(파랑)
    for (const c of CONFIG.climbs) {
      const { top, bottom } = climbEnds(c);
      g.lineStyle(4, c.type === 'ladder' ? 0x00c853 : 0x2979ff, 0.9).lineBetween(c.x, top.y, c.x, bottom.y);
    }
  }

  drawBackground() {
    const { width, height } = CONFIG;
    const sky = this.add.graphics();
    sky.fillGradientStyle(0x7ec8ff, 0x7ec8ff, 0xd6f0ff, 0xd6f0ff, 1);
    sky.fillRect(0, 0, width, height);

    // 먼 산
    const hills = this.add.graphics();
    hills.fillStyle(0xa8d8a0, 1);
    hills.fillCircle(150, 720, 320);
    hills.fillCircle(640, 780, 380);
    hills.fillCircle(1150, 720, 330);
    hills.fillStyle(0x8cc98a, 1);
    hills.fillCircle(400, 800, 300);
    hills.fillCircle(950, 820, 320);

    // 흘러가는 구름
    for (let i = 0; i < 6; i++) {
      const cloud = this.add.container(Phaser.Math.Between(0, width), Phaser.Math.Between(40, 220));
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 0.9);
      g.fillEllipse(0, 0, 90, 36);
      g.fillEllipse(-30, 6, 60, 28);
      g.fillEllipse(32, 6, 64, 28);
      g.fillEllipse(8, -12, 56, 34);
      cloud.add(g).setScale(Phaser.Math.FloatBetween(0.7, 1.3));

      const speed = Phaser.Math.Between(8, 20); // px/s
      const drift = () => {
        const distance = width + 200 - cloud.x;
        this.tweens.add({
          targets: cloud,
          x: width + 100,
          duration: (distance / speed) * 1000,
          onComplete: () => {
            cloud.x = -100;
            drift();
          },
        });
      };
      drift();
    }
  }

  drawPlatforms() {
    const g = this.add.graphics();
    // 발판 꺾은선을 따라 흙 + 잔디 띠를 그린다
    for (const f of Object.values(CONFIG.floors)) {
      const points = f.path.map(([x, y]) => ({ x, y }));
      g.lineStyle(22, 0x8b5a2b, 1).strokePoints(points.map((p) => ({ x: p.x, y: p.y + 11 })));
      g.lineStyle(8, 0x5cb85c, 1).strokePoints(points.map((p) => ({ x: p.x, y: p.y + 2 })));
    }
  }

  drawWeddingArch() {
    const stage = CONFIG.floors[mainStageName()];
    const { x1, x2 } = floorSpan(stage);
    const cx = (x1 + x2) / 2;
    const baseY = floorY(stage, cx);
    const r = 75;
    const g = this.add.graphics().setDepth(baseY - 1);

    g.lineStyle(8, 0xffffff, 1);
    g.beginPath();
    g.arc(cx, baseY - 40, r, Math.PI, 0);
    g.strokePath();
    g.lineBetween(cx - r, baseY - 40, cx - r, baseY);
    g.lineBetween(cx + r, baseY - 40, cx + r, baseY);

    const colors = [0xff7eb6, 0xffc0da, 0xffffff, 0xffd166];
    for (let a = Math.PI; a <= Math.PI * 2 + 0.01; a += Math.PI / 12) {
      g.fillStyle(Phaser.Utils.Array.GetRandom(colors), 1);
      g.fillCircle(cx + Math.cos(a) * r, baseY - 40 + Math.sin(a) * r, 7);
    }

    // 하트
    const heart = this.add
      .text(cx, baseY - 40 - r - 4, '❤', { fontSize: '26px', color: '#ff4d88', resolution: 2 })
      .setOrigin(0.5)
      .setDepth(baseY - 1);
    this.tweens.add({ targets: heart, scale: 1.2, duration: 500, yoyo: true, repeat: -1 });
  }
}

// 단체 사진: 하객 사이 간격(px, 맵 전체에 다 못 서면 max → min으로 좁힘), 저장 이미지 배율(맵 크기 × scale)
const PHOTO = { maxGap: 55, minGap: 20, scale: 2 };

/** 하객 층을 길이에 비례한 확률로 고른다 (긴 층에 더 많이, 짧은 층은 덜 붐비게) */
function pickGuestFloor() {
  const floors = Object.values(CONFIG.floors);
  const length = (f) => floorSpan(f).x2 - floorSpan(f).x1;
  let r = Math.random() * floors.reduce((sum, f) => sum + length(f), 0);
  for (const f of floors) {
    r -= length(f);
    if (r <= 0) return f;
  }
  return floors[floors.length - 1];
}
