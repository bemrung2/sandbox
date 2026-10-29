-- 여행 계획. Supabase SQL Editor에 통째로 붙여넣고 실행.
-- 다시 실행해도 안전하다 (if not exists).
--
-- 모든 테이블은 RLS를 켜되 정책을 두지 않는다. 서버(service_role)만 읽고 쓰고,
-- 브라우저에 나가는 anon 키로는 아무것도 보이지 않는다.

-- 로그인한 사람. 처음 로그인한 사람이 주인이 되고, 그 뒤 로그인한 사람은
-- 기본적으로 보기만 된다 (주인이 앱에서 편집을 허용해줄 때까지).
create table if not exists members (
  kakao_id   text primary key,
  name       text        not null default '',
  avatar     text        not null default '',
  can_edit   boolean     not null default false,
  is_owner   boolean     not null default false,
  joined_at  timestamptz not null default now(),
  seen_at    timestamptz not null default now()
);

-- 바뀔 때마다 오르는 번호. 각 화면은 이것만 보고 "새로 받을 게 있나"를 안다.
create table if not exists meta (
  key  text primary key,
  body jsonb not null default '{}'::jsonb
);

-- 여행 하나. ord는 핀이다: 0이면 핀 없음, 1부터는 핀을 꽂은 순서 =
-- 목록 맨 위에서의 순서 (앱에서 끌어다 바꾼다).
create table if not exists trips (
  id         text primary key,
  title      text not null default '',
  emoji      text not null default '',
  city       text not null default '',
  country    text not null default '',
  start_date date,
  end_date   date,
  ord        bigint not null default 0
);

-- 먼저 만든 표에도 더해준다 (이 파일은 다시 실행해도 안전하다)
alter table trips add column if not exists title text not null default '';

-- 하루의 한 줄 요약과 동선
create table if not exists days (
  trip_id  text not null references trips(id) on delete cascade,
  day_date date not null,
  theme    text   not null default '',
  route    text[] not null default '{}',
  primary key (trip_id, day_date)
);

-- 일정 하나. start_time이 비어 있으면 '시간 미정' (음식 탭에만 보인다)
create table if not exists items (
  id         text primary key,
  trip_id    text not null references trips(id) on delete cascade,
  day_date   date not null,
  start_time text,
  end_time   text,
  category   text not null default 'todo',
  meal       text,
  title      text not null default '',
  emoji      text not null default '',
  tag        text,
  places     text[] not null default '{}',
  lines      text[] not null default '{}',
  ord        bigint not null default 0
);

-- 가게 하나. buy_list는 [{id, text, got}]
create table if not exists shops (
  id        text primary key,
  trip_id   text not null references trips(id) on delete cascade,
  day_date  date,
  at_time   text,
  area      text not null default '',
  name      text not null default '',
  map_query text not null default '',
  buy_list  jsonb not null default '[]'::jsonb,
  ord       bigint not null default 0
);

-- 정보 탭의 여섯 목록이 kind로 구분되어 함께 산다.
--   flights  tag=구분  label=항공사  sub=편명   detail=시간
--   stays    label=이름 sub=지역     detail=메모
--   books    label=이름 sub=일시     detail=메모
--   links    label=제목 url=주소
--   packList label=준비물            done=챙김
--   notes    detail=메모
create table if not exists entries (
  id      text primary key,
  trip_id text not null references trips(id) on delete cascade,
  kind    text not null,
  tag     text,
  label   text not null default '',
  sub     text,
  detail  text,
  url     text,
  done    boolean not null default false,
  ord     bigint  not null default 0
);

-- 일정에 붙인 메모 · 링크 · 사진
create table if not exists attachments (
  id       text primary key,
  trip_id  text not null references trips(id) on delete cascade,
  item_id  text not null,
  kind     text not null,
  title    text,
  text     text,
  url      text,
  photo_id text,
  ord      bigint not null default 0
);

-- 사진은 무거우니 따로. 목록을 받을 때 같이 오지 않고 id로 한 장씩 가져간다.
create table if not exists photos (
  id   text primary key,
  data text not null
);

create index if not exists items_trip_idx       on items(trip_id, day_date);
create index if not exists shops_trip_idx       on shops(trip_id, day_date);
create index if not exists entries_trip_idx     on entries(trip_id, kind);
create index if not exists attachments_trip_idx on attachments(trip_id, item_id);

alter table members     enable row level security;
alter table meta        enable row level security;
alter table trips       enable row level security;
alter table days        enable row level security;
alter table items       enable row level security;
alter table shops       enable row level security;
alter table entries     enable row level security;
alter table attachments enable row level security;
alter table photos      enable row level security;
