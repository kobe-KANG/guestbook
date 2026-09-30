// 정면(front.png)은 있는데 동작 이미지(walk/jump/ladder/rope/prone)가 빠진 하객을 찾아 마저 만든다.
// 생성은 등록 때와 같은 /api/character, 후처리(배경 제거·프레임 분할·머리 폭 맞춤)는 브라우저 코드 그대로 쓰려고
// 헤드리스 Chrome으로 배포된 사이트(허용 출처)를 열어 그 안에서 generateCharacter → prepareSpriteImages 실행.
// 결과 PNG는 img/guests/<id>/<동작>.png로 저장, 커밋·재배포는 워크플로가 한다. (fill-motions.yml)
//   GITHUB_TOKEN, GITHUB_REPOSITORY 필요. 선택: SITE_URL, MAX_GUESTS(한 번에 처리할 하객 수, 기본 5)
//   puppeteer-core 필요 (npm i --no-save puppeteer-core), CHROME_PATH(기본 /usr/bin/google-chrome)

import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fetchGuestbookDiscussions, parseBody } from './lib/discussions.mjs';

const MOTIONS = ['walk', 'jump', 'ladder', 'rope', 'prone']; // CONFIG.sprite.motions와 같게
const GUESTS_DIR = 'img/guests';
const SITE_URL = process.env.SITE_URL || 'https://kobe-kang.github.io/guestbook/';
const MAX_GUESTS = Number(process.env.MAX_GUESTS || 5);

// 방명록 글이 있는 하객만 (글 없는 폴더는 정리 작업이 지울 것이라 돈 들여 만들지 않음)
const ids = new Set(
  (await fetchGuestbookDiscussions()).map((d) => String(parseBody(d.body)?.id || '').toLowerCase())
);
const targets = [];
for (const id of await readdir(GUESTS_DIR)) {
  const dir = `${GUESTS_DIR}/${id}`;
  if (!ids.has(id.toLowerCase()) || !existsSync(`${dir}/front.png`)) continue;
  const missing = MOTIONS.filter((m) => !existsSync(`${dir}/${m}.png`));
  if (missing.length) targets.push({ id, dir, missing });
}
console.log(`동작 누락 하객 ${targets.length}명${targets.length > MAX_GUESTS ? ` (이번엔 ${MAX_GUESTS}명)` : ''}`);
if (!targets.length) process.exit(0);

const { default: puppeteer } = await import('puppeteer-core');
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});
let failed = 0;
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(0); // 생성 한 번에 최대 ~2분
  await page.goto(SITE_URL, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof prepareSpriteImages === 'function' && typeof CONFIG === 'object');

  for (const { id, dir, missing } of targets.slice(0, MAX_GUESTS)) {
    const front = `data:image/png;base64,${(await readFile(`${dir}/front.png`)).toString('base64')}`;
    const result = await page.evaluate(
      async (front, missing) => {
        // 저장된 정면은 높이 128 투명 PNG → 등록 때 보내던 정면처럼 흰 배경 1024 정사각형으로 키워서 참고 이미지로
        const img = await loadImage(front);
        const c = document.createElement('canvas');
        c.width = c.height = 1024;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, 1024, 1024);
        const s = 900 / Math.max(img.width, img.height);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, (1024 - img.width * s) / 2, (1024 - img.height * s) / 2, img.width * s, img.height * s);
        const ref = c.toDataURL('image/png');

        const sources = { front };
        const errors = {};
        await Promise.all(
          missing.map((m) =>
            generateCharacter(m, ref).then(
              (image) => (sources[m] = image),
              (e) => (errors[m] = e.message)
            )
          )
        );
        const out = await prepareSpriteImages(sources);
        return { images: Object.fromEntries(missing.filter((m) => out[m]).map((m) => [m, out[m]])), errors };
      },
      front,
      missing
    );
    for (const [m, url] of Object.entries(result.images)) {
      await writeFile(`${dir}/${m}.png`, Buffer.from(url.split(',')[1], 'base64'));
    }
    for (const [m, err] of Object.entries(result.errors)) console.log(`실패  ${id} ${m}: ${err}`);
    failed += Object.keys(result.errors).length;
    console.log(`완료  ${id}: ${Object.keys(result.images).join(', ') || '없음'}`);
  }
} finally {
  await browser.close();
}
if (failed) console.log(`${failed}개 실패 → 다음 실행 때 다시 시도`);
