// 기본(게임) NPC 스프라이트 생성 (OpenAI 이미지 API). 로컬에서 한 번씩 돌리는 도구 — 키는 환경변수로만 받는다.
// 결혼식마다 다른 NPC(반려동물 등)는 개발자 모드 "NPC 추가"로 만든다 (데이터 저장소에 저장).
// 아래 NPCS에 항목을 넣으면 동작 스트립(motions)도 같은 방식으로 만들 수 있다 (strip 참고).
//   OPENAI_API_KEY=... node scripts/gen-npc.mjs                 전부 생성
//   OPENAI_API_KEY=... node scripts/gen-npc.mjs rps-machine     일부만 다시 생성 (id 또는 id:motion)
// 1) NPC마다 기준 이미지(front)를 글로 생성 — img/npc/<id>/origin.jpg(실제 사진)가 있으면 그 사진을, ref가 있으면 그 이미지를 바탕으로 생성
// 2) 그 기준 이미지를 참고로 동작 스트립(idle/walk/sleep/scratch) 생성
// 결과: img/npc/<id>/<motion>.webp (sharp로 가로 768px로 줄여 저장, 원본은 .cache/npc-raw/)
// 옵션: OPENAI_IMAGE_MODEL(쉼표 구분, 기본 gpt-image-2,gpt-image-1.5,gpt-image-1), OPENAI_IMAGE_QUALITY(기본 medium)

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const KEY = process.env.OPENAI_API_KEY;
if (!KEY) {
  console.error('OPENAI_API_KEY 환경변수가 필요합니다.');
  process.exit(1);
}
const MODELS = (process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2,gpt-image-1.5,gpt-image-1').split(',').map((s) => s.trim());
const QUALITY = process.env.OPENAI_IMAGE_QUALITY || 'medium';
const sharp = (await import('sharp')).default;

const STYLE = `Authentic classic MapleStory-style 2D pixel art sprite: chibi proportions, chunky visible pixels, clean 1px dark outline,
flat color shading, limited palette, no anti-aliasing, no smooth gradients, no painterly rendering.
Transparent background (no background at all). No text, no logo, no watermark, no UI, no ground, no shadow, no environment.`;

const spacing = (n) => `FRAME LAYOUT (VERY IMPORTANT — the game slices frames automatically):
- Exactly ${n} frames in ONE horizontal row, ${n} equal-width cells, identical scale in every frame.
- One character centered in each cell, all at the same baseline (feet/bottom on the same line).
- Keep a clear EMPTY white gap between neighboring characters of at least 15% of a cell width,
  and at least 10% margin on the left and right of each character inside its own cell.
- No part of a character (ears, tail, paws, props, effects) may touch or cross into a neighboring cell.
- Do not draw borders, separators, or grid lines. The gaps are fully transparent.`;

const facingLeft = 'The character faces LEFT (left-facing side / three-quarter view) in every frame.';

// 공통 동작 프롬프트
const strip = (n, action, extra = '') => `Using the character from the reference image, create a ${n}-frame horizontal sprite sheet animation.
Keep the exact same character design, colors, proportions and pixel-art style as the reference.
${facingLeft}
Action: ${action}
${extra}
${spacing(n)}
${STYLE}`;

const NPCS = {
  'rps-machine': {
    // 이벤트 NPC: 웨딩 파스텔 가위바위보 게임기(얼굴·장갑 손). 가만히 서 있음
    // 수평 발판 위에 서 있으므로 위에서 내려다보는 3/4 각도가 아니라 정면 수평 시점으로. ref = 디자인 참고(지금 이미지를 .cache/npc-ref/에 복사해 둠)
    ref: '.cache/npc-ref/rps-machine.webp',
    front: `Redraw the EXACT same character from the reference image — a cute MapleStory-style wedding "rock-paper-scissors" arcade machine NPC —
keeping its design, colors, face, heart-shaped sign with the three hand-sign buttons, white glove hands (fist and V-sign), bows, roses and ribbons.
CHANGE ONLY THE CAMERA ANGLE: a straight FRONT view at eye level (orthographic, like a classic 2D side-scrolling game sprite).
NO top-down view, NO three-quarter view, NO isometric angle, NO perspective: we must NOT see the top surface of the cabinet or its side panels in depth.
The machine stands perfectly UPRIGHT and VERTICAL on flat level ground; its bottom edge / feet are on one straight horizontal line.
Symmetric front-facing cabinet, full object visible, tall upright proportions.`,
    motions: {},
  },
  'chase-police': {
    // 이벤트 NPC "도둑 잡기": 남자 경찰관. 단순하지만 눈에 띄게, 수평 발판에 맞춰 정면 시점. 가만히 서 있음
    front: `A MapleStory-style event NPC: a male police officer for a wedding-party "catch the thief" tag game.
SIMPLE but HIGH-IMPACT design: bold clean silhouette, few big shapes, strong color contrast, instantly readable at small size.
Chibi proportions, standing upright and confident, feet planted apart, one arm stretched straight forward with an open palm in a big "STOP!" gesture,
the other hand on his hip. Sharp determined eyes, thick eyebrows, a confident grin.
Classic deep navy police uniform and peaked cap with one big shiny gold star badge on the cap and one on the chest, white gloves,
a silver whistle on a red cord, black boots. One small wedding touch only: a pink rose boutonniere on the chest.
Straight FRONT view at eye level (orthographic, like a classic 2D side-scrolling game sprite): NO top-down, NO three-quarter, NO isometric angle, NO perspective.
He stands perfectly upright on flat level ground; both feet on one straight horizontal line. Full body visible. No readable text or letters anywhere.`,
    motions: {},
  },
  'cake-chef': {
    // 이벤트 NPC "웨딩 케이크 쌓기": 파티시에가 높은 웨딩 케이크를 받쳐 듦. 작게 보여도 알아보게 단순·선명하게, 정면 시점. 가만히 서 있음
    front: `A MapleStory-style event NPC for a wedding-party "stack the wedding cake" arcade game: a cheerful pastry chef (patissier).
SIMPLE but HIGH-IMPACT design: bold clean silhouette, few big shapes, strong color contrast, instantly readable at small size.
Chibi proportions, standing upright, big happy smile, rosy cheeks. Tall white puffy chef hat, white double-breasted chef jacket with a pink neckerchief,
pastel pink apron, brown shoes. Proudly holding up with both hands, above chest height, a TALL wedding cake of 4 stacked tiers in pastel colors
(cream, pink, mint, lavender from bottom to top), each tier slightly narrower, white frosting drips and tiny pearl dots, a small red heart topper on the very top.
The cake is clearly the main eye-catching element but stays within the character's width (not wider than the shoulders plus a little).
Straight FRONT view at eye level (orthographic, like a classic 2D side-scrolling game sprite): NO top-down, NO three-quarter, NO isometric angle, NO perspective.
Stands perfectly upright on flat level ground; both feet on one straight horizontal line. Full body visible. No readable text or letters anywhere.`,
    motions: {},
  },
};

// ---------- OpenAI ----------

async function callOpenAI(path, makeBody) {
  let lastErr;
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(`https://api.openai.com/v1/images/${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, ...(path === 'generations' ? { 'Content-Type': 'application/json' } : {}) },
        body: makeBody(model),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.data?.[0]?.b64_json) return Buffer.from(data.data[0].b64_json, 'base64');
      const err = data.error || {};
      lastErr = `${model}: ${res.status} ${err.code || ''} ${err.message || ''}`;
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 8000 * (attempt + 1)));
        continue;
      }
      if (/model/i.test(err.param || '') || /model/i.test(err.message || '') || err.code === 'model_not_found') break; // 다음 모델
      throw new Error(lastErr);
    }
  }
  throw new Error(lastErr);
}

const generate = (prompt, size) =>
  callOpenAI('generations', (model) => JSON.stringify({ model, prompt, size, quality: QUALITY, output_format: 'webp', output_compression: 92, background: 'transparent' }));

const edit = (prompt, size, ref) =>
  callOpenAI('edits', (model) => {
    const form = new FormData();
    form.append('model', model);
    form.append('prompt', prompt);
    form.append('image', new Blob([ref], { type: 'image/webp' }), 'ref.webp');
    form.append('size', size);
    form.append('quality', QUALITY);
    form.append('output_format', 'webp');
    form.append('output_compression', '92');
    form.append('background', 'transparent'); // 흰 털 캐릭터가 배경 제거 때 뚫리지 않게 투명 배경으로
    return form;
  });

async function save(id, motion, buf) {
  await mkdir(`.cache/npc-raw/${id}`, { recursive: true });
  await mkdir(`img/npc/${id}`, { recursive: true });
  await writeFile(`.cache/npc-raw/${id}/${motion}.webp`, buf);
  // 게임에서는 표시 높이 70px 안팎 × 2배면 충분 → 가로 768px로 줄여 용량 절약
  await sharp(buf).resize({ width: 768, withoutEnlargement: true }).webp({ quality: 90 }).toFile(`img/npc/${id}/${motion}.webp`);
}

// ---------- 실행 ----------

const only = process.argv.slice(2); // "id" 또는 "id:motion"
const want = (id, motion) => !only.length || only.includes(id) || only.includes(`${id}:${motion}`);

async function pool(tasks, n) {
  const queue = [...tasks];
  const run = async () => {
    while (queue.length) await queue.shift()();
  };
  await Promise.all(Array.from({ length: n }, run));
}

const t0 = Date.now();
const log = (msg) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${msg}`);

// 1) 기준 이미지
await pool(
  Object.entries(NPCS)
    .filter(([id]) => want(id, 'front'))
    .map(([id, npc]) => async () => {
      const size = '1024x1024';
      try {
        const prompt = `${npc.front}\n${STYLE}`;
        const origin = `img/npc/${id}/origin.jpg`;
        const buf = npc.ref
          ? await edit(prompt, size, await readFile(npc.ref)) // 디자인 참고 이미지 (webp, 투명 배경 유지)
          : npc.origin && existsSync(origin)
            ? // 실제 사진 기반: EXIF 회전 반영 + 1024px로 줄여 참고 이미지로
              await edit(prompt, size, await sharp(origin).rotate().resize(1024, 1024, { fit: 'inside' }).webp().toBuffer())
            : await generate(prompt, size);
        await save(id, 'front', buf);
        log(`${id}/front ok`);
      } catch (e) {
        log(`${id}/front FAIL ${e.message}`);
      }
    }),
  4
);

// 2) 동작 스트립 (기준 이미지를 참고)
const jobs = [];
for (const [id, npc] of Object.entries(NPCS)) {
  for (const [motion, prompt] of Object.entries(npc.motions)) {
    if (!want(id, motion)) continue;
    jobs.push(async () => {
      const refPath = `.cache/npc-raw/${id}/front.webp`;
      if (!existsSync(refPath)) return log(`${id}/${motion} SKIP (기준 이미지 없음)`);
      try {
        await save(id, motion, await edit(prompt, '1536x1024', await readFile(refPath)));
        log(`${id}/${motion} ok`);
      } catch (e) {
        log(`${id}/${motion} FAIL ${e.message}`);
      }
    });
  }
}
await pool(jobs, 4);
log('done');
