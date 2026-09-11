# 같이 쓰기 — bemlab.vercel.app 설정

링크를 아는 사람이면 누구나 같은 계획을 보고, 암호를 아는 사람이면 고칠 수 있게 하는 설정.
**10분이면 끝나고, 여기서 만든 값은 Vercel에만 넣는다. 저장소(GitHub)에는 아무 비밀도 커밋하지 않는다.**

## 1. 저장소 만들기 (둘 중 하나)

### A. Upstash Redis — 권장, Vercel 안에서 끝난다

1. Vercel → 프로젝트(`bemlab`) → **Storage** 탭 → **Create Database** → **Upstash for Redis**
2. 이름 아무거나, 지역은 가까운 곳(`Tokyo` 또는 `Seoul`)
3. 만들면 프로젝트에 자동으로 연결되고 환경변수가 들어간다:
   `KV_REST_API_URL`, `KV_REST_API_TOKEN`

무료 한도로 이 계획 정도는 충분하다.

### B. Supabase — 이미 쓰고 있다면

1. [supabase.com](https://supabase.com) → 새 프로젝트
2. SQL Editor에서:

   ```sql
   create table lab_docs (
     path text primary key,
     body jsonb,
     rev  bigint default 0
   );
   ```

3. Settings → API 에서 **Project URL** 과 **service_role** 키를 복사
4. Vercel → Settings → Environment Variables 에 넣는다:
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

> service_role 키는 절대 공개하면 안 된다. Vercel 환경변수에만 넣으면 서버에서만 쓰이고
> 브라우저로는 나가지 않는다.

## 2. 편집 암호 정하기

Vercel → Settings → **Environment Variables** → 추가:

| 이름 | 값 |
| --- | --- |
| `LAB_PASSCODE` | 아무 문장. 예: `fukuoka-2026` |

**이걸 넣지 않으면 아무도 편집할 수 없다** (읽기만 된다). 잘못 설정됐을 때 남의 계획이
지워지는 쪽보다 안전한 쪽으로 잠가둔 것이다.

## 3. 다시 배포

환경변수는 새 배포부터 적용된다. Vercel → Deployments → 최신 것 → **Redeploy**.

## 4. 계획 옮기기

지금 계획은 아티팩트 저장소에 있다. 아티팩트는 바깥 네트워크를 못 쓰기 때문에
두 사본이 자동으로 동기화될 수 없다. 한 번만 손으로 옮기면 된다.

1. **아티팩트**에서 여행 목록 화면 맨 아래 **내보내기** → 전체 복사
2. **bemlab.vercel.app**에서 여행 목록 화면 맨 아래 **가져오기** → 붙여넣기 → 확인
3. 편집 암호를 물어보면 2번에서 정한 값을 넣는다 (이 기기에 저장되고, 다시 묻지 않는다)

그 뒤로는 **한쪽만 쓰는 게 좋다.** 둘 다 고치면 서로 모르는 채로 갈라진다.
친구와 같이 쓸 거면 `bemlab.vercel.app` 쪽을 쓰면 된다.

## 친구에게 줄 것

- 주소: `https://bemlab.vercel.app`
- 편집 암호: `LAB_PASSCODE`에 넣은 값

친구는 암호를 처음 저장할 때 한 번만 입력하면 된다. 암호 없이도 보는 건 된다.

## 확인

- 계획이 안 보이고 화면 아래에 `이 기기에만 저장`이라고 쓰여 있으면 → 저장소 환경변수가 없거나 재배포를 안 한 것
- `함께 쓰는 저장소 (읽기 전용)` → `LAB_PASSCODE`가 없는 것
- `함께 쓰는 저장소` → 제대로 붙은 것

`https://bemlab.vercel.app/api/plan` 을 브라우저로 열면 상태를 바로 볼 수 있다.
`{"ok":false,"error":"setup", ...}` 이면 무엇이 빠졌는지 한국어로 알려준다.
