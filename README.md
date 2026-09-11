# 나의 실험실

실험을 하나씩 만들어 모아두는 개인 프로젝트. 홈에서 실험 목록을 보고, 각 실험으로 들어가는 구조.

- EXP 01 — 여행 계획 (여행 목록 → 한 여행의 일정 · 음식 · 쇼핑 · 정보)

## 파일 구조

| 파일 | 역할 |
| --- | --- |
| `src/app.html` | **소스.** 여기만 수정한다. |
| `build.js` | `src/app.html`을 완전한 HTML 문서로 감싸 `index.html` 생성 |
| `index.html` | **생성물.** 직접 수정 금지. 정적 호스팅(Vercel)이 서빙하는 파일 |
| `vercel.json` | HTML 캐시 방지 헤더 |

## 수정하는 법

```bash
# src/app.html 수정 후
node build.js
```

## 왜 빌드가 필요한가

같은 페이지를 두 곳에 올린다.

1. **Claude 아티팩트** — `src/app.html`을 그대로 게시한다. 플랫폼이 `<head>`(뷰포트 메타 포함)를 알아서 씌워준다.
2. **정적 호스팅** — 씌워주는 게 없다. 그래서 `build.js`가 문서 껍데기를 만들어준다.

`src/app.html`을 그대로 정적 호스팅에 올리면 뷰포트 메타가 없어서, 휴대폰이 페이지를 980px 폭으로 그린 뒤 화면에 맞게 축소한다. 화면이 "멀리서 보이는" 증상이 정확히 이것이었다. `build.js`는 출력물에 뷰포트 메타가 없으면 실패하도록 되어 있다.

## 데이터

화면에 보이는 것은 전부 앱 안에서 고치고 지울 수 있다. 하드코딩된 문구는 첫 방문 때 한 번 깔리는
씨앗(`SEED_*`)뿐이고, 그 뒤로는 저장소의 내용이 곧 화면이다.

```
{ v, active, trips: [ { id, emoji, city, country, start, end,
                        dayThemes, dayRoutes, items, shops,
                        flights, stays, books, links, packList, notes } ],
  attach: { 일정id: [...] } }
```

`v`가 올라가면 `Saved.migrate`가 옛 저장본을 지금 모양으로 접어 넣는다.

## 저장 방식

- 아티팩트에서 열면 아티팩트 저장소에 저장된다 (기기 간 유지).
- 그 외 환경에서는 그 브라우저의 localStorage에만 저장된다. 화면 상단에 그렇다고 표시된다.
