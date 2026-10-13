# 메이플스토리 컨셉 결혼식 방명록

QR로 접속한 하객이 사진 한 장으로 도트 캐릭터를 만들고 축하 한마디를 남기면, 그 캐릭터가 결혼식 맵 위를 돌아다니는 온라인 방명록입니다.
순수 HTML/JS + Phaser 3, GitHub Pages(사이트) + GitHub Discussions(방명록 저장) + Vercel(쓰기 API·AI 캐릭터 생성).

## 구성: 저장소 2개 + Vercel

```
 [코드 저장소] guestbook (공개, 이 저장소를 fork)
   사이트·API·워크플로·기본 맵·게임 NPC
   Actions: deploy.yml ─┬─ 데이터 저장소 checkout ──┐
                        └─ 코드 위에 덮어써서 GitHub Pages 배포 → https://<owner>.github.io/<repo>/
                                                    │
 [데이터 저장소] guestbook-data (비공개 가능, 템플릿으로 생성)  │
   방명록 Discussions, 하객 캐릭터, 신랑·신부, 반려동물 NPC, 사진, 배경음악
   Actions: notify.yml ── 바뀌면 코드 저장소 deploy.yml 실행
                                                    ▲
 [Vercel] 코드 저장소의 api/ ── 하객 등록·개발자 모드 저장 → 데이터 저장소에 커밋
```

| | 내용 | 공개 |
|---|---|---|
| **코드 저장소** | 결혼식과 무관한 것: 코드, 배경 맵, 기본 캐릭터, 게임 NPC 3개 | 공개 |
| **데이터 저장소** ([guestbook-data-template](https://github.com/kobe-KANG/guestbook-data-template)) | 결혼식마다 다른 것: 방명록 글, 하객 캐릭터, 신랑·신부 이름과 이미지, 반려동물 등 NPC, 웨딩 사진, 배경음악 | 비공개 가능 |
| **Vercel** | 방명록 쓰기·수정, AI 캐릭터 생성, 개발자 모드 저장, 이벤트 게임 기록 | – |

> 비공개로 숨겨지는 건 데이터 저장소의 원본과 히스토리입니다. 하객이 보는 사이트에는 신랑·신부, 하객 캐릭터, 사진이 공개됩니다.

---

## 설정 순서 한눈에 보기

1. [토큰 2개 만들기](#1-토큰-만들기) — fine-grained PAT(저장소용), classic PAT(게임 기록 gist용)
2. [게임 기록용 gist 만들기](#2-게임-기록용-gist-만들기)
3. [코드 저장소 fork + 설정](#3-코드-저장소-설정)
4. [데이터 저장소 만들기 + 설정](#4-데이터-저장소-설정)
5. [Vercel 프로젝트 만들기 + 환경변수](#5-vercel-설정)
6. [코드 저장소에 API 주소 넣고 첫 배포](#6-첫-배포)
7. [개발자 모드로 꾸미기](#7-개발자-모드로-꾸미기)

아래에서 `<owner>` = GitHub 계정 이름, `<code>` = 코드 저장소 이름(예: `guestbook`), `<data>` = 데이터 저장소 이름(예: `guestbook-data`)입니다.
3·4번을 먼저 해야 1번 토큰에서 저장소를 고를 수 있으니, 실제로는 **3 → 4 → 1 → 2 → 3·4의 비밀값 입력 → 5 → 6** 순서가 편합니다.

---

## 1. 토큰 만들기

### 1-1. 저장소용 fine-grained PAT (하나로 세 곳에 씀)

GitHub 오른쪽 위 프로필 → **Settings** → 왼쪽 맨 아래 **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**

| 항목 | 값 |
|---|---|
| Token name | 아무거나 (예: `guestbook`) |
| Expiration | 결혼식이 끝날 때까지 넉넉히 (만료되면 아래 세 곳 값을 모두 새로 바꿔야 함) |
| Resource owner | 내 계정 |
| Repository access | **Only select repositories** → 코드 저장소, 데이터 저장소 둘 다 선택 |

**Permissions → Repository permissions**

| 권한 | 값 | 쓰는 곳 |
|---|---|---|
| Contents | **Read and write** | 데이터 저장소 커밋 (하객 이미지, map-data.js, 사진) |
| Discussions | **Read and write** | 데이터 저장소 방명록 글 |
| Actions | **Read and write** | 데이터 저장소 → 코드 저장소 배포 실행 |
| Metadata | Read-only (자동) | |

만든 토큰(`github_pat_…`)은 한 번만 보이니 복사해 두세요. 이 토큰을 아래 세 곳에 같은 값으로 넣습니다.

| 넣는 곳 | 이름 |
|---|---|
| 코드 저장소 Actions Secret | `DATA_TOKEN` |
| 데이터 저장소 Actions Secret | `CODE_TOKEN` |
| Vercel 환경변수 | `GITHUB_TOKEN` |

### 1-2. gist용 classic PAT

fine-grained PAT는 gist를 지원하지 않아서 게임 기록용 토큰이 따로 필요합니다.
**Developer settings** → **Personal access tokens** → **Tokens (classic)** → **Generate new token (classic)** → scope는 **`gist`만** 체크.
→ Vercel 환경변수 `GIST_TOKEN`에 넣습니다. gist를 만든 계정의 토큰이어야 씁니다.

---

## 2. 게임 기록용 gist 만들기

이벤트 NPC(가위바위보·도둑 잡기·케이크 쌓기)의 랭킹이 저장되는 곳입니다.

1. https://gist.github.com 접속 → 파일 이름 `readme.md`, 내용 아무거나 → **Create secret gist**
2. 주소 `https://gist.github.com/<owner>/<gist id>`의 마지막 부분이 gist id → Vercel `RPS_GIST_ID`에 넣음
3. 기록 파일(`rps.json`, `chase.json`, `cake.json`, `event.json`)은 첫 기록 때 자동으로 생깁니다.

---

## 3. 코드 저장소 설정

1. 이 저장소 오른쪽 위 **Fork** → 저장소 이름이 사이트 주소가 됨 (`https://<owner>.github.io/<code>/`)
2. fork한 저장소의 **Actions** 탭 → **I understand my workflows, go ahead and enable them**
   - fork는 예약(cron) 워크플로가 꺼져 있습니다. 왼쪽 목록에서 **Fill missing guest motions**, **Cleanup guest images**를 각각 눌러 **Enable workflow**
3. **Settings → Pages → Build and deployment → Source** = **GitHub Actions**
   - 배포 워크플로가 코드와 데이터를 합쳐서 올리므로 "Deploy from a branch"가 아니라 Actions여야 합니다. 아래 추천 워크플로 카드는 누르지 않아도 됩니다.
4. **Settings → Secrets and variables → Actions**

   **Secrets** 탭 → New repository secret

   | 이름 | 값 |
   |---|---|
   | `DATA_TOKEN` | 1-1의 fine-grained PAT |

   **Variables** 탭 → New repository variable

   | 이름 | 값 | 설명 |
   |---|---|---|
   | `DATA_REPO` | `<owner>/<data>` | 데이터 저장소 |
   | `API_URL` | `https://<프로젝트>.vercel.app` | 5번에서 나온 Vercel 주소 (끝에 `/` 없이). 넣기 전엔 방명록 작성이 "곧 오픈" 안내로 막힘 |
   | `SITE_URL` | (선택) `https://내도메인/` | 직접 도메인을 쓸 때만. 빠진 동작 이미지 채우기가 열 사이트 주소 (기본 `https://<owner>.github.io/<code>/`) |

### 코드 저장소의 워크플로

| 워크플로 | 언제 | 하는 일 |
|---|---|---|
| `deploy.yml` (Deploy guestbook) | 이 저장소 push, 데이터 저장소 변경(notify), 수동 | 데이터 저장소 checkout → `img/`·`audio/`·`js/map-data.js`를 코드 위에 덮어씀 → 갤러리 변환·`guests.json` 생성 → Pages |
| `fill-motions.yml` | 방명록 작성·수정(notify), 30분마다 | AI 오류로 빠진 하객 동작 이미지를 다시 만들어 데이터 저장소에 push |
| `cleanup-images.yml` | 매일 03:00 KST | 방명록 글이 없는 하객 이미지 폴더를 데이터 저장소에서 삭제 (수동 실행은 기본 dry run) |

모두 이 저장소(공개)에서 돌기 때문에 Actions 사용 시간이 무료입니다. 데이터 저장소에서는 짧은 `notify.yml`만 돕니다.

---

## 4. 데이터 저장소 설정

1. [guestbook-data-template](https://github.com/kobe-KANG/guestbook-data-template) → **Use this template** → **Create a new repository**
   - 이름 `<data>`, **Private** 선택 (fork가 아니라 템플릿이라 비공개로 만들 수 있고 히스토리도 따라오지 않음)
2. **Settings → General → Features → Discussions** 체크
3. **Discussions** 탭 → 왼쪽 Categories 옆 연필 → **New category**
   - Category name **`방명록`** (정확히 이 이름), Discussion Format **Announcement** (관리자만 새 글 작성 — 하객은 API로만 씀)
4. **Settings → Secrets and variables → Actions**

   | 탭 | 이름 | 값 |
   |---|---|---|
   | Secrets | `CODE_TOKEN` | 1-1의 fine-grained PAT |
   | Variables | `CODE_REPO` | `<owner>/<code>` |

자세한 내용은 데이터 저장소의 README를 보세요.

---

## 5. Vercel 설정

1. https://vercel.com → **Add New… → Project** → **Import Git Repository**에서 GitHub 연결 후 **코드 저장소** 선택
   - 목록에 없으면 "Adjust GitHub App Permissions"에서 그 저장소 접근 허용
2. **Configure Project**
   - Framework Preset: **Other**
   - Build Command·Output Directory: 비워 둠 (Vercel은 `api/` 함수만 씀)
3. **Environment Variables** (지금 넣거나, 나중에 Settings → Environment Variables. 바꾸면 **Deployments → Redeploy** 해야 반영)

   | 이름 | 필수 | 값 / 설명 |
   |---|---|---|
   | `GITHUB_TOKEN` | ✅ | 1-1의 fine-grained PAT (데이터 저장소 커밋·방명록) |
   | `DATA_REPO` | ✅ | `<owner>/<data>` |
   | `OPENAI_API_KEY` | ✅ | AI 캐릭터 생성 (OpenAI 이미지 API) |
   | `DEV_PASSWORD` | ✅ | 개발자 모드(`?dev`) 저장 비밀번호 = 모든 방명록을 수정·삭제할 수 있는 관리자 비밀번호 |
   | `GUEST_PASSWORD_SECRET` | 권장 | 하객 비밀번호 해시용 비밀키 (아무 긴 무작위 문자열). 없으면 `DEV_PASSWORD`를 씀. **바꾸면 기존 하객 비밀번호가 전부 무효** |
   | `GIST_TOKEN` | 게임 쓰면 ✅ | 1-2의 classic PAT (`gist` 권한) |
   | `RPS_GIST_ID` | 게임 쓰면 ✅ | 2번의 gist id (주소를 통째로 넣어도 됨). 없으면 게임 API가 503 |
   | `ALLOWED_ORIGINS` | 선택 | 사이트 주소(쉼표로 여러 개). 기본 `https://<DATA_REPO 주인>.github.io,http://localhost:8765,http://127.0.0.1:8765`. 직접 도메인을 쓰면 넣기 |
   | `OPENAI_IMAGE_MODEL` | 선택 | 쉼표 구분, 앞에서부터 시도. 기본 `gpt-image-2,gpt-image-1.5,gpt-image-1` |
   | `OPENAI_IMAGE_QUALITY` | 선택 | 기본 `medium` |
   | `DISCUSSION_CATEGORY` | 선택 | 방명록 카테고리 이름. 기본 `방명록` |
   | `GITHUB_BRANCH` | 선택 | 데이터 저장소 브랜치. 기본 `main` |

4. **Deploy** → 나온 주소(`https://<프로젝트>.vercel.app`)를 코드 저장소 변수 `API_URL`에 넣기
5. 확인: 브라우저에서 아래 주소가 `{"ok":true,"configured":true}`면 설정 완료
   - `https://<프로젝트>.vercel.app/api/guestbook` — `GITHUB_TOKEN`·`DATA_REPO`
   - `https://<프로젝트>.vercel.app/api/character` — `OPENAI_API_KEY`
   - `https://<프로젝트>.vercel.app/api/map` — `DEV_PASSWORD`·`GITHUB_TOKEN`·`DATA_REPO`

> `api/character.js`는 AI 이미지 생성 때문에 최대 300초 실행(`vercel.json`). Hobby 플랜에서도 동작합니다.

---

## 6. 첫 배포

코드 저장소 **Actions → Deploy guestbook → Run workflow**. 1~2분 뒤 `https://<owner>.github.io/<code>/`에서 사이트가 열립니다.
이후에는 하객 등록, 방명록 수정, 개발자 모드 저장마다 자동으로 다시 배포됩니다 (데이터 저장소 notify → 코드 저장소 deploy).

---

## 7. 개발자 모드로 꾸미기

사이트를 `https://<owner>.github.io/<code>/?dev`로 열고, 저장할 때 `DEV_PASSWORD`를 입력합니다. 저장하면 데이터 저장소에 커밋되고 1~2분 뒤 사이트에 반영됩니다.

- **신랑·신부**: 캐릭터를 눌러 "수정" → 이름·한줄 멘트·소개 글. "이미지 새로 만들기"로 사진에서 캐릭터 생성 (이미지가 없으면 코드로 그린 임시 캐릭터)
- **NPC 추가**(툴바): 반려동물 등. 사진·설명 → AI 생성 → 이름·디렉토리 입력. 분류를 "앨범"으로 하면 누를 때 웨딩 사진 앨범이 열림
- **앨범 사진**: 앨범 NPC 설정 창의 "사진 올리기" / "사진 관리"
- **맵**: 발판·사다리·로프·무대, 시작점, 신랑·신부 자리
- **만들기·수정 켜고 끄기**: 툴바 체크박스 (결혼식 전후로 하객 등록을 막을 때)
- **배경음악**: 데이터 저장소에 `audio/bgm.mp3`로 직접 push

---

## 로컬 개발

```sh
git clone https://github.com/<owner>/<code>.git
cd <code>
git clone https://github.com/<owner>/<data>.git content      # content/는 .gitignore
API_URL=https://<프로젝트>.vercel.app node scripts/serve.mjs   # http://localhost:8765
```

`serve.mjs`는 배포와 같은 규칙으로 `content/`를 코드 위에 덮어서 보여 줍니다. `content/`가 없으면 기본 맵과 더미 하객으로 열립니다.

---

## 문제 해결

| 증상 | 확인할 것 |
|---|---|
| Deploy 워크플로가 `Checkout data repository`에서 실패 | 코드 저장소 `DATA_TOKEN`·`DATA_REPO`, 토큰에 데이터 저장소가 선택돼 있는지 |
| `Fetch guestbook`에서 "카테고리를 찾을 수 없습니다" | 데이터 저장소 Discussions 카테고리 이름이 정확히 `방명록`인지 |
| 하객 등록·개발자 모드 저장 후 사이트가 안 바뀜 | 데이터 저장소 Actions의 `Notify code repository` 실행 기록, `CODE_TOKEN`(Actions 쓰기 권한)·`CODE_REPO` |
| 방명록 작성 버튼이 "곧 오픈" | 코드 저장소 변수 `API_URL` 넣고 다시 배포 |
| 브라우저 콘솔에 CORS 오류 | Vercel `ALLOWED_ORIGINS` (직접 도메인일 때) |
| 게임 랭킹이 "기록 저장소(gist)에 접근하지 못했어요" | Vercel `GIST_TOKEN`(classic, gist 권한, gist 주인 계정)·`RPS_GIST_ID` |
| 토큰 만료 | 1-1 토큰을 새로 만들어 세 곳(`DATA_TOKEN`, `CODE_TOKEN`, Vercel `GITHUB_TOKEN`) 모두 교체 + Vercel Redeploy |

자세한 구조와 동작은 `CLAUDE.md`, `docs/`를 보세요.
