# 설정 — 데이터베이스와 (잠가둔) 카카오 로그인

계획은 **Supabase(Postgres) 한 곳**에 있다. 비밀값은 전부 Vercel 환경변수에 들어가고,
저장소에는 아무것도 커밋하지 않는다.

> **보는 것은 열려 있고, 고치는 것은 잠겨 있다.** 주소를 아는 사람은 누구나 볼 수 있지만,
> 고치려면 카카오로 로그인한 **편집자**여야 한다. 보는 것까지 잠그려면 `LOGIN_REQUIRED=1`,
> 반대로 아무나 고치게 하려면 `EDIT_OPEN=1`을 환경변수에 넣고 다시 배포하면 된다.

## 1. 데이터베이스 (약 5분)

1. [supabase.com](https://supabase.com) → 새 프로젝트. 지역은 `Northeast Asia (Seoul)`이 가깝다.
2. 왼쪽 **SQL Editor** → **New query** → 이 저장소의 [`db/schema.sql`](db/schema.sql)을 통째로 붙여넣고 **Run**.
   표 9개가 생긴다. 다시 실행해도 안전하다.
3. **Settings → API** 에서 두 가지를 복사한다.
   - **Project URL**
   - **service_role** 키 (`anon` 말고 **service_role**)

> `service_role` 키는 서버에서만 쓰인다. 브라우저로는 나가지 않는다. 모든 표는 RLS가 켜져 있고
> 정책이 없어서, 혹시 `anon` 키가 새어도 아무것도 읽히지 않는다.

## 2. 카카오 로그인 (약 5분)

1. [developers.kakao.com](https://developers.kakao.com) → **내 애플리케이션** → **애플리케이션 추가하기**
2. **앱 설정 → 플랫폼 → Web** 에 사이트 도메인 등록: `https://bemlab.vercel.app`
3. **제품 설정 → 카카오 로그인** → 활성화 **ON**
4. 같은 화면의 **Redirect URI** 에 정확히 이 주소를 등록:

   ```
   https://bemlab.vercel.app/api/auth/callback
   ```

5. **제품 설정 → 카카오 로그인 → 동의항목** → **닉네임**을 필수 또는 선택으로 켠다.
   (이름을 멤버 목록에 보여주는 데만 쓴다. 이메일은 받지 않는다.)
6. **앱 설정 → 앱 키** 에서 **REST API 키**를 복사.
7. (권장) **제품 설정 → 카카오 로그인 → 보안** → **Client Secret** 코드 생성 후 활성화 **ON**, 복사.

> 메뉴 이름은 가끔 바뀐다. 못 찾겠으면 "Redirect URI", "REST API 키", "동의항목" 세 단어로 찾으면 된다.

## 3. Vercel 환경변수

Vercel → 프로젝트 → **Settings → Environment Variables**:

| 이름 | 값 |
| --- | --- |
| `SUPABASE_URL` | 1번의 Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 1번의 service_role 키 |
| `KAKAO_REST_API_KEY` | 2번의 REST API 키 |
| `KAKAO_CLIENT_SECRET` | 2번의 Client Secret (안 켰으면 비워둬도 된다) |
| `SESSION_SECRET` | 아무 긴 임의 문자열. `openssl rand -base64 32` 결과를 쓰면 된다 |
| `EDITOR_IDS` | (선택) 고칠 수 있는 사람의 카카오 id. 쉼표로 여럿 — 예: `1234567890,1234567891` |

`SESSION_SECRET`은 로그인 쿠키에 서명하는 데 쓴다. 바꾸면 모두 로그아웃된다.

## 3-1. 누가 고칠 수 있나

**`EDITOR_IDS`에 적힌 사람만** 고칠 수 있다. 적힌 사람은 주인이고, 나머지는 로그인해도
보기만 된다. 멤버 화면의 스위치는 이때 사라진다 — 명단이 답이기 때문이다.

카카오 id는 한 번 로그인하면 Supabase의 `members` 표 `kakao_id` 칸에 남는다.
거기서 복사해 넣으면 된다.

`EDITOR_IDS`를 비워두면 예전 방식이다: **처음 로그인한 사람이 주인**이 되고, 주인이
멤버 화면에서 사람마다 편집을 열어준다. 표를 직접 고쳐도 된다.

```sql
-- 이 두 사람만 편집 · 주인, 나머지는 보기만
update members set can_edit = true,  is_owner = true  where kakao_id in ('<id1>', '<id2>');
update members set can_edit = false, is_owner = false where kakao_id not in ('<id1>', '<id2>');
```

## 4. 다시 배포

환경변수는 새 배포부터 적용된다. **Deployments → 최신 → Redeploy**.

## 5. 들어가기

`bemlab.vercel.app`에 들어가면 바로 여행 목록이 뜬다. 로그인은 없다.

`LOGIN_REQUIRED=1`로 켜둔 경우에만 카카오 로그인 화면이 나오고, 그때는
**가장 먼저 로그인한 사람이 계획의 주인이 되어** 처음부터 편집할 수 있다.
그 뒤에 로그인하는 사람은 보기만 되고, 주인이 **멤버** 화면에서 열어줘야 고칠 수 있다.

## 6. 계획 만들기

여행 목록에서 **여행 만들기** — 도시와 날짜만 넣으면 일정 · 음식 · 쇼핑 · 정보가 빈 채로 따라온다.
어떤 모양인지 먼저 보고 싶으면 **예시로 시작하기**를 누르면 후쿠오카 2박 3일이 통째로 들어온다
(마음에 안 들면 여행 정보에서 삭제하면 된다).

## 7. 친구 들이기

친구에게 `https://bemlab.vercel.app` 를 주면 끝이다. 로그인도 암호도 없다.
**주소를 아는 사람은 누구나 고칠 수 있다**는 뜻이기도 하다.

로그인을 다시 켜면(`LOGIN_REQUIRED=1`) 친구는 카카오로 로그인한 뒤 보기만 되고,
홈 맨 아래 **멤버**에서 네가 편집을 열어줘야 고칠 수 있다.

---

## 확인

여행 목록 화면 맨 아래 글씨로 지금 상태를 알 수 있다.

| 보이는 글자 | 뜻 |
| --- | --- |
| `함께 쓰는 저장소 · 로그인 없이 열림` | 데이터베이스에 붙었고, 문은 열려 있다 |
| `함께 쓰는 저장소` | 붙었고, 로그인이 켜져 있다 |
| `이 기기에만 저장` | 백엔드를 못 찾았다 — 환경변수 또는 재배포 확인 |
| `이 아티팩트에만 저장` | 아티팩트 사본이다 (정상) |

`https://bemlab.vercel.app/api/auth/me` 를 브라우저로 열면 지금 로그인 상태가 보이고,
설정이 덜 됐으면 **무엇이 빠졌는지 한국어로** 알려준다.

## 문제가 생기면

- **로그인 후 `?login=failed`로 돌아온다** → Redirect URI가 정확히
  `https://bemlab.vercel.app/api/auth/callback` 인지, Client Secret을 켰다면 값이 맞는지 확인.
- **로그인은 되는데 계획이 안 보인다** → `db/schema.sql`을 실행했는지, `SUPABASE_URL`에 오타가 없는지.
- **편집이 안 된다** → 주인이 멤버 화면에서 열어줘야 한다. 주인 본인인데도 안 되면,
  `members` 표에서 본인 행의 `can_edit`을 `true`로 바꾸면 된다.
- **주인을 잘못 잡았다** → Supabase의 `members` 표에서 `is_owner`/`can_edit`을 직접 고치면 된다.
