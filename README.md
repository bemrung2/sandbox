# BEMLAB

실험을 하나씩 만들어 모아두는 사이트. 홈에 실험 목록이 있고, 하나를 고르면 그 실험으로 들어간다.

- EXP 01 — 여행 계획

## 파일 구조

```
src/core/          사이트. 어떤 실험에도 쓰이고, 실험 이름은 모른다
src/exp/travel/    실험 하나 — 화면 · CSS · 저장 경로를 스스로 가진다
src/app.js         둘을 아는 유일한 곳
src/app.html       문서 껍데기
api/_core.js       로그인 · 저장소 · 멤버
api/_travel.js     travel의 문서 ↔ 표 변환
db/schema.sql      Supabase에 한 번 붙여넣는 스키마
build.js           src/ → index.html + 모듈 복사
```

실험을 더하는 건 `src/exp/<이름>/`을 만들고 `src/app.js`에 한 줄 더하는 것이다.
지우는 것도 그 반대로, 폴더와 한 줄. 자세한 규칙은 [CLAUDE.md](CLAUDE.md).

## 수정하는 법

```bash
node build.js
```

`index.html`과 그 옆의 모듈들은 생성물이다. `src/`만 고친다.

## 왜 빌드가 필요한가

같은 페이지를 두 곳에 올린다.

1. **Claude 아티팩트** — `src/app.html`과 모듈을 함께 게시한다. 플랫폼이 `<head>`를 씌워준다.
2. **정적 호스팅** — 씌워주는 게 없다. 그래서 `build.js`가 문서 껍데기를 만들고 모듈을 옆에 둔다.

뷰포트 메타가 없으면 휴대폰이 980px로 그린 뒤 축소한다. `build.js`는 출력물에 그게 없으면 실패한다.

## 저장 방식

계획은 **Supabase(Postgres) 한 곳**에 있고, `bemlab.vercel.app`이 그 앞이다.
문(카카오 로그인)은 지금 **꺼져 있다** — 주소를 아는 사람은 누구나 보고 고친다.
`LOGIN_REQUIRED=1`이면 로그인해야 보이고, 편집은 주인이 사람별로 열어준다.
스위치는 `api/_core.js`의 `loginRequired()` 한 곳뿐이고, 로그인 코드는 그대로 남아 있다.

| 어디서 열었나 | 저장소 |
| --- | --- |
| `bemlab.vercel.app` | Supabase Postgres |
| 그 외 (아티팩트 등) | 그 브라우저의 localStorage — 혼자 보는 사본 |

지금 어느 쪽인지는 홈 맨 아래에 적힌다. 설정은 [SETUP.md](SETUP.md).

### 안에서는 한 가지 모양

저장소가 어디든 앱은 한 가지만 안다 — **경로 하나에 문서 하나**. 실험마다 자기 접두사를 쓴다.

```
travel/trips/<여행id>                     여행
travel/trips/<여행id>/days/<YYYY-MM-DD>   그날 요약 + 동선
travel/trips/<여행id>/items/<id>          일정 하나
travel/trips/<여행id>/<목록>/<id>          가게 · 항공 · 숙소 · 예약 · 링크 · 준비물 · 메모
travel/trips/<여행id>/attach/<id>         일정에 붙인 자료
blobs/<id>                               사진 한 장 (목록 동기화에서 제외)
```

레코드 하나가 문서 하나라서, 두 사람이 서로 다른 걸 고쳐도 덮어쓰지 않는다.
`api/_travel.js`가 이 경로를 진짜 표의 행으로 옮긴다 — Supabase 화면에서는 `items`, `shops`,
`entries` 같은 **읽을 수 있는 표**로 보이고, 앱은 그 사실을 몰라도 된다.

열어둔 화면은 4초마다 "바뀐 게 있나(rev)"만 묻고, 없으면 서버가 아무것도 보내지 않는다.
**내가 어느 여행을 열어뒀는지는 공유하지 않는다** — 브라우저에만 남는다.

### 들어오는 문

```
GET  /api/auth/login      카카오로 보냄 (state에 서명)
GET  /api/auth/callback   코드 → 토큰 → 프로필 → 서명된 세션 쿠키
GET  /api/auth/me         지금 누구인지, 고칠 수 있는지
GET  /api/auth/logout     쿠키 삭제
GET  /api/plan            로그인 필요. { rev, docs, me }
POST /api/plan            편집 권한 필요. { writes: { 경로: 본문|null } }
GET  /api/members         로그인한 사람들
POST /api/members         주인만. 편집 허용/해제
```

세션은 `SESSION_SECRET`으로 HMAC 서명한 httpOnly 쿠키다. 토큰은 브라우저에 남지 않는다.
**가장 먼저 로그인한 사람이 주인**이 되고, 그 뒤 로그인한 사람은 주인이 열어줄 때까지 보기만 된다.
