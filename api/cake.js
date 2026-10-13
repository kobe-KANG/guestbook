// 웨딩 케이크 쌓기 API (Vercel Serverless Function) — 이벤트 NPC "케이크 쌓기 파티시에" (js/cake.js)
// POST /api/cake { action: 'start', number, id, password } → 내 캐릭터 비밀번호 확인 → { token }
// POST /api/cake { action: 'end', token, score, floors } → 기록 { score, ended, rank, ranking, hasContact }
//   점수 = 쌓은 층 1점 + 완벽하게 맞춘 층은 1점 더 (한 층 최대 2점)
// contact·admin·reset·GET(랭킹)은 공통 (_lib/board.js). 기록은 gist의 cake.json { records: [{ id, name, score, at, end }] }
//
// ponytail: 점수는 브라우저가 계산해서 보냄 → 조작 가능. 한 층에 최소 MIN_DROP_MS가 걸린다는 것만 확인 (막으려면 서버가 탭 시각으로 게임을 다시 돌려야 함)

import { Board } from './_lib/board.js';
import { HttpError, handlePost, preflight } from './_lib/http.js';
import { findGuest } from './guestbook.js';

const MIN_DROP_MS = 250; // js/cake.js 떨어지는 시간 + 새 시트가 나오는 시간보다 짧게
const board = new Board({ file: 'cake.json', score: 'score', tokenKey: 'cake', ttl: 60 * 60 * 1000 });

export const OPTIONS = preflight;
export const GET = (request) => board.get(request);

export function POST(request) {
  return handlePost(request, async (body) => {
    const common = await board.common(body);
    if (common) return common;
    if (body.action === 'start') {
      const { data, id } = await findGuest(body);
      return { status: 200, body: { token: board.sign({ id, name: data.name, t: Date.now() }) } };
    }
    if (body.action === 'end') {
      const run = board.verify(body.token);
      const { score, floors } = body;
      const ok =
        Number.isInteger(score) && Number.isInteger(floors) && floors >= 0 && score >= floors && score <= floors * 2 &&
        floors * MIN_DROP_MS <= Date.now() - run.t;
      if (!ok) throw new HttpError(400, '기록이 올바르지 않아요.');
      return { status: 200, body: { score, ...(await board.finish(run, score)) } };
    }
    throw new HttpError(400, '알 수 없는 요청이에요.');
  });
}
