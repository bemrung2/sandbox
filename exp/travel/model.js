/* 여행 계획 — the data, and the reading of it.
 *
 * Everything this experiment saves lives under one prefix, so it can be
 * dropped from the site without leaving anything behind:
 *
 *   travel/trips/<id>                      여행
 *   travel/trips/<id>/days/<YYYY-MM-DD>    그날 요약 + 동선
 *   travel/trips/<id>/items/<id>           일정 하나
 *   travel/trips/<id>/<목록>/<id>           가게 · 항공 · 숙소 · 예약 · 링크 · 준비물 · 메모
 *   travel/trips/<id>/attach/<id>          일정에 붙인 자료
 */
import { uid } from "../../core/dom.js";
import { Store } from "../../core/store.js";

export var ROOT = "travel/trips";
export var LISTS = ["items", "shops", "flights", "stays", "books", "links", "packList", "notes"];
var DOW = ["일", "월", "화", "수", "목", "금", "토"];

/* Emoji are deliberately rare: only where one carries meaning on its own
   (비행기 · 호텔 · 짐). Everything else is told by the category colour. */


export function newTrip(o){
  o = o || {};
  return {
    id: o.id || uid("tr"),
    emoji: o.emoji || "",
    city: o.city || "",
    country: o.country || "",
    start: o.start || todayISO(),
    end: o.end || o.start || todayISO(),
    dayThemes: o.dayThemes || {},
    dayRoutes: o.dayRoutes || {},
    items: o.items || [],
    shops: o.shops || [],
    flights: o.flights || [],
    stays: o.stays || [],
    books: o.books || [],
    links: o.links || [],
    packList: o.packList || [],
    notes: o.notes || [],
    attach: o.attach || {}
  };
}

var HOTEL = "더 로얄 파크 캔버스 후쿠오카 나카스";
var SEED_TRIP = { id:"fukuoka2026", emoji:"🇯🇵", city:"후쿠오카", country:"JAPAN", start:"2026-09-12", end:"2026-09-14" };
var SEED_THEMES = {
  "2026-09-12": "하카타 쇼핑 + 캐널시티 + 나카스",
  "2026-09-13": "텐진 · 다이묘 쇼핑 + 스시 + 야키니쿠 + 쿠시카츠",
  "2026-09-14": "돈키호테 + 이치란 + 귀국"
};
var SEED_ROUTES = {
  "2026-09-12": ["공항", "CARGO PASS", "하카타", "키와미야", "셀린느", "스탠다드 프로덕트",
                 "캐널시티", "호텔", "쿠로부타 돈까스", "나카스 / 텐진 한잔"],
  "2026-09-13": ["이치란", "텐진 / 다이묘", "스시 긴자 오노데라", "ONE FUKUOKA 살로몬",
                 "텐진 / 다이묘 쇼핑", "17:15 카쿠라", "자유시간", "쿠시카츠 센스"],
  "2026-09-14": ["돈키호테", "이치란", "체크아웃", "11:40 공항", "13:40 출국"]
};
var SEED_ITEMS = [
  { id:"a1", d:"2026-09-12", s:"11:10", cat:"air", emo:"✈️", t:"한국 출발", lines:["제주항공 7C1471"] },
  { id:"a2", d:"2026-09-12", s:"12:40", cat:"air", emo:"✈️", t:"후쿠오카 공항 도착", places:["후쿠오카공항 국제선"] },
  { id:"a3", d:"2026-09-12", s:"12:40", e:"13:25", cat:"todo", t:"입국심사 + 수하물 수령" },
  { id:"a4", d:"2026-09-12", s:"13:25", e:"13:40", cat:"todo", emo:"🧳", t:"CARGO PASS 접수",
    lines:["캐리어를 호텔로 바로 배송"] },
  { id:"a5", d:"2026-09-12", s:"13:40", e:"14:10", cat:"move", t:"공항 → 하카타 이동" },
  { id:"a6", d:"2026-09-12", s:"14:10", e:"15:10", cat:"food", t:"키와미야 함바그", meal:"lunch",
    places:["키와미야 함바그 하카타"], lines:["늦은 점심"] },
  { id:"a7", d:"2026-09-12", s:"15:10", e:"16:00", cat:"shop", t:"셀린느", places:["셀린느 하카타"] },
  { id:"a8", d:"2026-09-12", s:"16:00", e:"16:50", cat:"shop", t:"하카타 쇼핑",
    places:["스탠다드 프로덕트 하카타"], lines:["스탠다드 프로덕트 등"] },
  { id:"a9", d:"2026-09-12", s:"16:50", e:"17:10", cat:"move", t:"하카타 → 캐널시티 이동" },
  { id:"a15", d:"2026-09-12", s:"17:10", e:"18:00", cat:"shop", t:"캐널시티 하카타 구경",
    places:["캐널시티 하카타"] },
  { id:"a16", d:"2026-09-12", s:"18:00", e:"18:20", cat:"move", t:"캐널시티 → 호텔 이동" },
  { id:"a10", d:"2026-09-12", s:"18:20", e:"18:50", cat:"stay", emo:"🏨", t:"호텔 체크인",
    places:[HOTEL], lines:["CARGO PASS 짐 확인", "잠깐 휴식"] },
  { id:"a17", d:"2026-09-12", s:"19:00", e:"20:30", cat:"food", t:"쿠로부타 돈까스", meal:"dinner",
    places:["쿠로부타 돈까스 후쿠오카"], lines:["19:00 전후"] },
  { id:"a14", d:"2026-09-12", s:"20:30", cat:"free", t:"나카스 / 텐진 자유시간", meal:"drink", tag:"후보 중 선택",
    places:["츠치야 후쿠오카", "토리사카바 후쿠오카"],
    lines:["츠치야 · 야키토리", "토리사카바 · 야키토리 / 이자카야", "또는 현장에서 다른 곳",
           "토요일 밤은 컨디션 따라 유동적으로"] },

  { id:"b1", d:"2026-09-13", s:"08:30", cat:"todo", t:"기상" },
  { id:"b2", d:"2026-09-13", s:"09:00", e:"10:00", cat:"food", t:"이치란 본사총본점", meal:"breakfast",
    places:["이치란 본사총본점"] },
  { id:"b3", d:"2026-09-13", s:"10:00", e:"10:50", cat:"shop", t:"텐진 / 다이묘 쇼핑 시작",
    places:["텐진 다이묘"] },
  { id:"b12", d:"2026-09-13", s:"11:00", e:"12:15", cat:"food", t:"스시 긴자 오노데라 하카타점", meal:"lunch",
    places:["스시 긴자 오노데라 하카타점"] },
  { id:"b13", d:"2026-09-13", s:"12:15", e:"12:30", cat:"move", t:"ONE FUKUOKA BLDG. 이동",
    places:["ONE FUKUOKA BLDG."] },
  { id:"b14", d:"2026-09-13", s:"12:30", e:"13:15", cat:"shop", t:"Salomon",
    places:["Salomon ONE FUKUOKA"], lines:["ONE FUKUOKA BLDG. 내"] },
  { id:"b6", d:"2026-09-13", s:"13:15", e:"15:45", cat:"shop", t:"텐진 / 다이묘 쇼핑",
    places:["꼼데가르송 후쿠오카", "HUMAN MADE 후쿠오카", "이와타야 텐진", "파르코 텐진"],
    lines:["다이묘 주변 편집숍 등"] },
  { id:"b7", d:"2026-09-13", s:"15:45", e:"16:30", cat:"food", t:"카페 + 휴식", meal:"cafe", tag:"가게 미정" },
  { id:"b8", d:"2026-09-13", s:"16:30", e:"17:00", cat:"move", t:"니시나카스 이동" },
  { id:"b9", d:"2026-09-13", s:"17:15", e:"19:00", cat:"food", t:"야키니쿠 카쿠라 니시나카스점", meal:"dinner",
    tag:"예약 확정 17:15 · 2명", places:["야키니쿠 카쿠라 니시나카스점"] },
  { id:"b10", d:"2026-09-13", s:"19:00", e:"21:00", cat:"free", t:"텐진 / 니시나카스 / 나카스 자유시간",
    lines:["산책 · 쇼핑 · 카페 또는 가볍게 한잔", "야키니쿠 소화시키기"] },
  { id:"b15", d:"2026-09-13", s:"21:00", e:"22:30", cat:"food", t:"쿠시카츠 센스", meal:"drink",
    places:["쿠시카츠 센스 후쿠오카"], lines:["야식 · 하이볼 / 맥주", "21:00 전후"] },
  { id:"b11", d:"2026-09-13", s:"22:30", e:"23:00", cat:"stay", emo:"🏨", t:"호텔 복귀",
    places:[HOTEL], lines:["22:30~23:00 전후"] },

  { id:"c1", d:"2026-09-14", s:"08:00", cat:"todo", t:"기상" },
  { id:"c2", d:"2026-09-14", s:"08:30", e:"09:30", cat:"shop", t:"돈키호테 나카스점",
    places:["돈키호테 나카스점"], lines:["과자 / 약 / 기념품"] },
  { id:"c3", d:"2026-09-14", s:"09:30", e:"10:00", cat:"stay", emo:"🏨", t:"호텔 복귀",
    places:[HOTEL], lines:["쇼핑한 물건 정리", "캐리어 최종 정리"] },
  { id:"c4", d:"2026-09-14", s:"10:00", e:"10:40", cat:"food", t:"이치란 본사총본점", meal:"breakfast",
    places:["이치란 본사총본점"], lines:["마지막 아점"] },
  { id:"c5", d:"2026-09-14", s:"10:40", e:"10:55", cat:"stay", emo:"🏨", t:"호텔 복귀",
    places:[HOTEL], lines:["캐리어 픽업 + 체크아웃"] },
  { id:"c6", d:"2026-09-14", s:"10:55", e:"11:40", cat:"move", t:"호텔 → 후쿠오카공항 국제선",
    places:["후쿠오카공항 국제선"] },
  { id:"c7", d:"2026-09-14", s:"11:40", cat:"air", emo:"✈️", t:"후쿠오카공항 국제선 도착",
    lines:["비행기 출발 2시간 전"] },
  { id:"c8", d:"2026-09-14", s:"11:40", e:"13:10", cat:"todo", t:"체크인 / 수하물 위탁",
    lines:["출국심사", "면세점"] },
  { id:"c9", d:"2026-09-14", s:"13:40", cat:"air", emo:"✈️", t:"한국행 출발", lines:["제주항공 7C1472"] }
];
var SEED_SHOPS = [
  { id:"s1", d:"2026-09-12", time:"15:10", area:"하카타", name:"셀린느", map:"셀린느 하카타", items:[] },
  { id:"s2", d:"2026-09-12", time:"16:00", area:"하카타", name:"하카타 쇼핑", map:"스탠다드 프로덕트 하카타", items:["스탠다드 프로덕트"] },
  { id:"s10", d:"2026-09-12", time:"17:10", area:"캐널시티", name:"캐널시티 하카타", map:"캐널시티 하카타", items:[] },
  { id:"s3", d:"2026-09-13", time:"12:30", area:"ONE FUKUOKA BLDG.", name:"Salomon", map:"Salomon ONE FUKUOKA", items:[] },
  { id:"s4", d:"2026-09-13", time:"13:15", area:"다이묘", name:"꼼데가르송", map:"꼼데가르송 후쿠오카", items:[] },
  { id:"s5", d:"2026-09-13", time:"13:15", area:"다이묘", name:"HUMAN MADE", map:"HUMAN MADE 후쿠오카", items:[] },
  { id:"s6", d:"2026-09-13", time:"13:15", area:"다이묘", name:"다이묘 주변 편집숍", map:"다이묘 편집숍", items:[] },
  { id:"s7", d:"2026-09-13", time:"13:15", area:"텐진", name:"이와타야", map:"이와타야 텐진", items:[] },
  { id:"s8", d:"2026-09-13", time:"13:15", area:"텐진", name:"파르코", map:"파르코 텐진", items:[] },
  { id:"s9", d:"2026-09-14", time:"08:30", area:"나카스", name:"돈키호테 나카스점", map:"돈키호테 나카스점", items:["과자","약","기념품"] }
];
var SEED_FLIGHTS = [
  { id:"f1", label:"가는 편 · 9.12 (토)", airline:"제주항공", no:"7C1471", detail:"11:10 한국 출발 — 12:40 후쿠오카 도착" },
  { id:"f2", label:"오는 편 · 9.14 (월)", airline:"제주항공", no:"7C1472", detail:"11:40 공항 도착 — 13:40 한국행 출발" }
];
var SEED_STAYS = [
  { id:"h1", name:HOTEL, area:"나카스", detail:"체크인 15:00 · 체크아웃 11:00" }
];
var SEED_BOOKS = [
  { id:"k1", name:"야키니쿠 카쿠라 니시나카스점", when:"9.13 (일) 17:15 · 2명", detail:"예약 확정" }
];
var SEED_PACK = [
  "여권", "항공권 (모바일)", "엔화 현금", "신용카드",
  "보조배터리", "충전기 · 케이블", "우산", "상비약",
  "쇼핑용 여분 가방", "캐리어 여유 공간"
];

export function seedTrip(){
  return newTrip({
    id: SEED_TRIP.id, emoji: SEED_TRIP.emoji, city: SEED_TRIP.city, country: SEED_TRIP.country,
    start: SEED_TRIP.start, end: SEED_TRIP.end,
    dayThemes: Object.assign({}, SEED_THEMES),
    dayRoutes: JSON.parse(JSON.stringify(SEED_ROUTES)),
    items: SEED_ITEMS.map(function(s){
      return {
        id: s.id, dayDate: s.d, s: s.s, e: s.e || null, cat: s.cat, meal: s.meal || null,
        title: s.t, emo: s.emo || "", tag: s.tag || null,
        places: (s.places || []).slice(), lines: (s.lines || []).slice()
      };
    }),
    shops: SEED_SHOPS.map(function(s){
      return {
        id: s.id, dayDate: s.d, time: s.time, area: s.area, name: s.name, map: s.map,
        items: s.items.map(function(t){ return { id: uid("i"), text: t, got: false }; })
      };
    }),
    flights: SEED_FLIGHTS.map(function(x){ return Object.assign({}, x); }),
    stays: SEED_STAYS.map(function(x){ return Object.assign({}, x); }),
    books: SEED_BOOKS.map(function(x){ return Object.assign({}, x); }),
    packList: SEED_PACK.map(function(t, i){ return { id: uid("k"), text: t, on: false, ord: i }; })
  });
}

export var CAT = {
  air:  { label:"항공", color:"var(--c-air)" },
  move: { label:"이동", color:"var(--c-move)" },
  food: { label:"식사", color:"var(--c-food)" },
  shop: { label:"쇼핑", color:"var(--c-shop)" },
  stay: { label:"숙소", color:"var(--c-stay)" },
  free: { label:"자유", color:"var(--c-free)" },
  todo: { label:"준비", color:"var(--c-todo)" }
};
export var CAT_ORDER = ["food","shop","move","free","stay","todo","air"];
export var MEALS = [
  { key:"all", label:"전체" }, { key:"breakfast", label:"아침" }, { key:"lunch", label:"점심" },
  { key:"dinner", label:"저녁" }, { key:"drink", label:"술" }, { key:"cafe", label:"카페" }
];
export var MEAL_LABEL = { breakfast:"아침", lunch:"점심", dinner:"저녁", drink:"술", cafe:"카페" };
var DOW = ["일","월","화","수","목","금","토"];

/* ---------- time ---------- */
/* Korea and Japan share UTC+9, so the device clock needs no conversion. */
/* Korea and Japan share UTC+9, so the device clock needs no conversion. */
export function mins(hhmm){
  if (!hhmm) return null;
  var p = String(hhmm).split(":");
  return (+p[0]) * 60 + (+p[1]);
}
export function isoOf(d){
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}
export function fmtMD(iso){ var p = iso.split("-"); return (+p[1]) + "." + (+p[2]); }
export function dowOf(iso){ return DOW[new Date(iso + "T00:00:00").getDay()]; }
export function todayISO(){ return isoOf(new Date()); }
export function dayDiff(a, b){ return Math.round((new Date(a + "T00:00:00") - new Date(b + "T00:00:00")) / 86400000); }
export function nowMins(){ var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }

/* ---------- reading the plan ---------- */
export function trip(){ return Plan.cur(); }
export function tripsSorted(){
  return Plan.trips.slice().sort(function(a, b){ return a.start.localeCompare(b.start); });
}
export function tripDaysOf(t){
  var out = [], guard = 0;
  var d = new Date(t.start + "T00:00:00"), end = new Date(t.end + "T00:00:00");
  while (d <= end && guard++ < 60){
    var iso = isoOf(d);
    out.push({ date: iso, dow: dowOf(iso), theme: t.dayThemes[iso] || "", route: t.dayRoutes[iso] || [] });
    d.setDate(d.getDate() + 1);
  }
  if (!out.length){
    out.push({ date: t.start, dow: dowOf(t.start), theme: t.dayThemes[t.start] || "", route: t.dayRoutes[t.start] || [] });
  }
  return out;
}
export function tripDays(){ var t = trip(); return t ? tripDaysOf(t) : []; }
export function nightsOf(t){
  var n = dayDiff(t.end, t.start);
  return n > 0 ? n + "박 " + (n + 1) + "일" : "당일";
}
export function nightsLabel(){ var t = trip(); return t ? nightsOf(t) : ""; }
/* D-7 / 여행 중 / 다녀옴 — one label, used by both the list and the header. */
export function tripStatus(t){
  var d = dayDiff(t.start, todayISO()), back = dayDiff(t.end, todayISO());
  if (d > 0) return { kind:"soon", label:"D-" + d };
  if (d === 0) return { kind:"live", label:"오늘 출발" };
  if (back >= 0) return { kind:"live", label:"여행 중 " + (1 - d) + "일차" };
  return { kind:"past", label:"다녀옴" };
}
export function spanLabel(m){
  if (m <= 1) return "곧";
  if (m < 60) return m + "분";
  var h = Math.floor(m / 60), r = m % 60;
  return r ? h + "시간 " + r + "분" : h + "시간";
}
/* An item shows an emoji only if one was actually set on it. */
export function emoPrefix(it){ return it.emo ? it.emo + " " : ""; }
/* 시간 미정이 맨 위, 그 다음이 시계 순. */
export function byStart(a, b){
  var x = mins(a.s), y = mins(b.s);
  if (x === null || y === null) return x === y ? 0 : (x === null ? -1 : 1);
  return x - y;
}
export function itemsOn(date){
  return trip().items.filter(function(i){ return i.dayDate === date; }).sort(byStart);
}
/* The timeline is a clock, so only items with a time belong on it. An item
   without one is a candidate — it lives in 음식, at the top of its day. */
export function timedOn(date){
  return itemsOn(date).filter(function(i){ return !!i.s; });
}
export function currentPair(){
  var days = tripDays(), today = todayISO(), di = -1;
  if (!days.length) return null;
  days.forEach(function(d, i){ if (d.date === today) di = i; });
  if (di < 0) return null;
  var list = timedOn(days[di].date), n = nowMins(), cur = null, next = null, from = null, to = null;
  for (var i = 0; i < list.length; i++){
    var s = mins(list[i].s), e = list[i].e ? mins(list[i].e) : null;
    if (e === null){
      for (var j = i + 1; j < list.length; j++){
        var ns = mins(list[j].s);
        if (ns > s){ e = ns; break; }
      }
      if (e === null) e = s + 90;
    }
    if (!cur && n >= s && n < e){ cur = list[i]; from = s; to = e; }
    if (!next && s > n) next = list[i];
  }
  return { dayIndex: di, current: cur, next: next, from: from, to: to, now: n };
}

/* ---------- the plan itself ---------- */
export function metaOf(t){
  return { emoji: t.emoji || "", city: t.city, country: t.country || "", start: t.start, end: t.end };
}
export function bodyOf(rec){
  var body = Object.assign({}, rec);
  delete body.id;
  return body;
}
export function byOrd(a, b){
  return (a.ord || 0) - (b.ord || 0) || String(a.id).localeCompare(String(b.id));
}
export function ordered(list){ return (list || []).slice().sort(byOrd); }

/* The stored documents are the truth; trips are a reading of them. */
function modelFrom(map){
  var trips = {};
  function slot(id){ return trips[id] || (trips[id] = { t: newTrip({ id: id }), meta: false }); }
  Object.keys(map).forEach(function(path){
    var body = map[path];
    if (!body || path.indexOf(ROOT + "/") !== 0) return;
    var p = path.slice(ROOT.length + 1).split("/");
    var here = slot(p[0]), t = here.t;
    if (p.length === 1){
      if (!body.city) return;
      Object.assign(t, metaOf(body));
      here.meta = true;
    } else if (p[1] === "days" && p[2]){
      if (body.theme) t.dayThemes[p[2]] = body.theme;
      if (body.route && body.route.length) t.dayRoutes[p[2]] = body.route;
    } else if (p[1] === "attach" && p[2]){
      var a = Object.assign({ id: p[2] }, body);
      (t.attach[a.itemId] = t.attach[a.itemId] || []).push(a);
    } else if (LISTS.indexOf(p[1]) >= 0 && p[2]){
      t[p[1]].push(Object.assign({ id: p[2] }, body));
    }
  });
  return Object.keys(trips)
    .filter(function(id){ return trips[id].meta; })
    .map(function(id){ return trips[id].t; });
}

export var Plan = {
  trips: [],
  active: null,

  reread(){ this.trips = modelFrom(Store.map); },

  tripById(id){
    var found = null;
    this.trips.forEach(function(t){ if (t.id === id) found = t; });
    return found;
  },
  cur(){ return this.tripById(this.active) || null; },

  /* which trip YOU have open is yours: sharing it would drag everyone else's
     screen along when one person taps a trip */
  open(id){
    this.active = id;
    try{ localStorage.setItem("travel.trip", id); }catch(e){ /* private mode */ }
  },
  lastOpened(){ try{ return localStorage.getItem("travel.trip"); }catch(e){ return null; } },

  path(key){ return ROOT + "/" + this.active + "/" + key; },
  write(path, body){ return Store.write(path, body); },

  listAdd(key, rec){
    var full = Object.assign({ id: uid("x"), ord: Date.now() }, rec);
    this.cur()[key].push(full);
    this.write(this.path(key) + "/" + full.id, bodyOf(full));
    return full;
  },
  listEdit(key, id, patch){
    var c = this.cur(), next = null;
    c[key] = c[key].map(function(x){
      if (x.id !== id) return x;
      next = Object.assign({}, x, patch);
      return next;
    });
    if (next) this.write(this.path(key) + "/" + id, bodyOf(next));
  },
  listRemove(key, id){
    var self = this, c = this.cur();
    c[key] = c[key].filter(function(x){ return x.id !== id; });
    this.write(this.path(key) + "/" + id, null);
    if (key === "items"){
      (c.attach[id] || []).forEach(function(a){ self.write(self.path("attach") + "/" + a.id, null); });
      delete c.attach[id];
    }
  },

  setDay(date, patch){
    var t = this.cur();
    if (patch.theme !== undefined){
      if (patch.theme) t.dayThemes[date] = patch.theme; else delete t.dayThemes[date];
    }
    if (patch.route !== undefined){
      if (patch.route && patch.route.length) t.dayRoutes[date] = patch.route;
      else delete t.dayRoutes[date];
    }
    var theme = t.dayThemes[date] || "", route = t.dayRoutes[date] || [];
    if (!theme && !route.length) this.write(this.path("days") + "/" + date, null);
    else this.write(this.path("days") + "/" + date, { theme: theme, route: route });
  },

  attachOf(id){
    var t = this.cur();
    return (t && t.attach[id]) || [];
  },
  addAttach(itemId, att){
    var t = this.cur();
    var full = Object.assign({ id: uid("t"), itemId: itemId }, att);
    (t.attach[itemId] = t.attach[itemId] || []).push(full);
    this.write(this.path("attach") + "/" + full.id, bodyOf(full));
  },
  removeAttach(itemId, attId){
    var t = this.cur();
    t.attach[itemId] = this.attachOf(itemId).filter(function(a){ return a.id !== attId; });
    this.write(this.path("attach") + "/" + attId, null);
  },

  addTrip(rec){
    var t = newTrip(rec);
    this.trips.push(t);
    this.write(ROOT + "/" + t.id, metaOf(t));
    return t;
  },
  editTrip(id, rec){
    var t = this.tripById(id);
    if (!t) return;
    Object.assign(t, rec);
    this.write(ROOT + "/" + id, metaOf(t));
  },
  removeTrip(id){
    var self = this, t = this.tripById(id);
    if (!t) return;
    this.trips = this.trips.filter(function(x){ return x.id !== id; });
    if (this.active === id) this.active = this.trips.length ? this.trips[0].id : null;
    var base = ROOT + "/" + id + "/";
    Object.keys(t.dayThemes).concat(Object.keys(t.dayRoutes)).forEach(function(d){
      self.write(base + "days/" + d, null);
    });
    LISTS.forEach(function(key){
      (t[key] || []).forEach(function(rec){ self.write(base + key + "/" + rec.id, null); });
    });
    Object.keys(t.attach || {}).forEach(function(itemId){
      (t.attach[itemId] || []).forEach(function(a){ self.write(base + "attach/" + a.id, null); });
    });
    this.write(ROOT + "/" + id, null);
  },

  /* A brand new trip, laid out the way the seed is, so "처음부터 만들기" and
     "예시로 시작" are the same code path. */
  create(rec, withSeed){
    var t = withSeed ? seedTrip() : newTrip(rec);
    if (!withSeed) { /* keep the given dates */ }
    else Object.assign(t, metaOf(Object.assign({}, t, rec)), { id: t.id });
    this.trips.push(t);
    var map = {};
    tripToMap(t, map);
    var self = this;
    Object.keys(map).forEach(function(path){ self.write(path, map[path]); });
    return t;
  }
};

export function tripToMap(t, into){
  var base = ROOT + "/" + t.id + "/";
  into[ROOT + "/" + t.id] = metaOf(t);
  var days = {};
  Object.keys(t.dayThemes || {}).concat(Object.keys(t.dayRoutes || {})).forEach(function(d){ days[d] = true; });
  Object.keys(days).forEach(function(d){
    into[base + "days/" + d] = { theme: t.dayThemes[d] || "", route: t.dayRoutes[d] || [] };
  });
  LISTS.forEach(function(key){
    (t[key] || []).forEach(function(rec, i){
      into[base + key + "/" + rec.id] = bodyOf(Object.assign({ ord: i }, rec));
    });
  });
  Object.keys(t.attach || {}).forEach(function(itemId){
    (t.attach[itemId] || []).forEach(function(a){
      into[base + "attach/" + a.id] = Object.assign(bodyOf(a), { itemId: itemId });
    });
  });
  return into;
}
