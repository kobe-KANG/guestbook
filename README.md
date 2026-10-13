# 메이플스토리 컨셉 결혼식 방명록

QR로 접속한 하객이 사진 한 장으로 도트 캐릭터를 만들고 축하 한마디를 남기면, 그 캐릭터가 결혼식 맵 위를 돌아다니는 온라인 방명록입니다.
순수 HTML/JS + Phaser 3, GitHub Pages(사이트) + GitHub Discussions(방명록 저장) + Vercel(쓰기 API·AI 캐릭터 생성).

## 구성: 저장소 3개

| | 내용 | 공개 |
|---|---|---|
| **코드 저장소** (이 저장소를 fork) | 사이트·API·워크플로·기본 맵과 게임 NPC | 공개 |
| **데이터 저장소** ([guestbook-data-template](https://github.com/kobe-KANG/guestbook-data-template)으로 생성) | 방명록 글(Discussions), 하객 캐릭터, 신랑·신부 이름과 이미지, 반려동물 등 NPC, 웨딩 사진, 배경음악 | 비공개 가능 |
| **Vercel** (코드 저장소를 Import) | 방명록 쓰기, AI 캐릭터 생성, 개발자 모드 저장 → 데이터 저장소에 커밋 | – |

배포할 때 코드 저장소의 Actions가 데이터 저장소를 읽어 코드 위에 덮어씌운 뒤 GitHub Pages에 올립니다.
비공개로 숨겨지는 건 데이터 저장소(원본·히스토리)이고, 하객이 보는 사이트에는 내용이 공개됩니다.

## 설정 순서

1. **코드 저장소**: 이 저장소를 fork → Actions 탭에서 워크플로 켜기 → Settings → Pages → Source = **GitHub Actions**
2. **데이터 저장소**: [guestbook-data-template](https://github.com/kobe-KANG/guestbook-data-template)에서 **Use this template** → **Private** 선택 → 만든 저장소에서 Settings → Features → **Discussions** 켜기 → Discussions에서 카테고리 **`방명록`** 만들기 (Announcement 형식 권장)
3. **토큰**: GitHub → Settings → Developer settings → Fine-grained tokens → 두 저장소를 선택하고 권한
   - Contents: Read and write, Discussions: Read and write (데이터 저장소용)
   - Actions: Read and write (코드 저장소용)
4. **Vercel**: 코드 저장소 Import (Framework: Other) → 환경변수

   | 이름 | 값 |
   |---|---|
   | `GITHUB_TOKEN` | 3번 토큰 |
   | `DATA_REPO` | 데이터 저장소 `owner/repo` |
   | `OPENAI_API_KEY` | AI 캐릭터 생성 |
   | `DEV_PASSWORD` | 개발자 모드 저장·관리자 비밀번호 |
   | `GUEST_PASSWORD_SECRET` | 방명록 비밀번호 해시용 비밀키 (아무 긴 문자열, 바꾸면 기존 비밀번호 무효) |
   | `RPS_GIST_ID`, `GIST_TOKEN` | 이벤트 게임 기록용 비밀 gist id와 gist 권한 토큰 (classic PAT `gist`) |
   | `ALLOWED_ORIGINS` | (선택) 사이트 주소. 기본 `https://<DATA_REPO 주인>.github.io` |
5. **코드 저장소** Settings → Secrets and variables → Actions
   - Secrets `DATA_TOKEN` = 3번 토큰
   - Variables `DATA_REPO` = 데이터 저장소 `owner/repo`, `API_URL` = Vercel 주소 (`https://<프로젝트>.vercel.app`)
6. **데이터 저장소** Settings → Secrets and variables → Actions
   - Secrets `CODE_TOKEN` = 3번 토큰
   - Variables `CODE_REPO` = 코드 저장소 `owner/repo`
7. 코드 저장소 Actions에서 **Deploy guestbook** 실행 → `https://<owner>.github.io/<repo>/`
8. 사이트를 `?dev`로 열어 꾸미기 (저장하면 데이터 저장소로 커밋됨)
   - 신랑·신부 캐릭터 → "수정"에서 이름·멘트, "이미지 새로 만들기"로 사진에서 캐릭터 생성
   - 툴바 "NPC 추가"로 반려동물 등 NPC, 분류 "앨범"으로 웨딩 사진 앨범
   - 발판·사다리, 시작점, 신랑·신부 자리
   - 배경음악은 데이터 저장소에 `audio/bgm.mp3`로 push

## 로컬 개발

```sh
git clone <데이터 저장소> content      # content/는 .gitignore
API_URL=https://<프로젝트>.vercel.app node scripts/serve.mjs   # http://localhost:8765
```

자세한 구조와 동작은 `CLAUDE.md`, `docs/`를 보세요.
