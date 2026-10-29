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

/* 예약된 유럽 여정. 대한항공 예약 조회 화면에 적힌 것만 들어 있다 —
   호텔과 현지 일정은 앱 안에서 채운다. */
var SEED_TRIP = { id:"europe2026", emoji:"🇪🇺", city:"유럽", country:"ROMA · PARIS",
                  start:"2026-11-23", end:"2026-12-06" };
var SEED_THEMES = {
  "2026-11-23": "인천 → 로마",
  "2026-12-05": "파리 → 인천"
};
var SEED_ROUTES = {};
var SEED_ITEMS = [
  { id:"g1", d:"2026-11-23", s:"14:05", cat:"air", emo:"✈️", t:"인천 출발",
    places:["인천국제공항 제2여객터미널"],
    lines:["KE931 · A350-900", "일반석(K) · 스탠다드"] },
  { id:"g2", d:"2026-11-23", s:"19:35", cat:"air", emo:"✈️", t:"로마 도착",
    places:["로마 피우미치노 공항 제3터미널"],
    lines:["13시간 30분 비행", "현지 시간"] },

  { id:"h1", d:"2026-12-05", s:"15:05", cat:"air", emo:"✈️", t:"파리 출발",
    places:["파리 샤를 드 골 공항 제2E터미널"],
    lines:["KE5902 · A350-900", "일반석(U) · 스탠다드", "에어프랑스 운항"] },
  { id:"h2", d:"2026-12-06", s:"11:15", cat:"air", emo:"✈️", t:"인천 도착",
    places:["인천국제공항 제2여객터미널"],
    lines:["12시간 10분 비행"] }
];
var SEED_SHOPS = [];
var SEED_FLIGHTS = [
  { id:"f1", label:"가는 편 · 11.23 (월)", airline:"대한항공", no:"KE931",
    detail:"14:05 인천 T2 — 19:35 로마 T3 · 13시간 30분" },
  { id:"f2", label:"오는 편 · 12.05 (토)", airline:"대한항공", no:"KE5902",
    detail:"15:05 파리 T2E — 12.06 11:15 인천 T2 · 12시간 10분 · 에어프랑스 운항" }
];
var SEED_STAYS = [];
var SEED_BOOKS = [
  { id:"k1", name:"좌석 · 가는 편 KE931", when:"11.23 (월)",
    detail:"KIM MINWOO 36F · KIM SOYEONG 36E" },
  { id:"k2", name:"좌석 · 오는 편 KE5902", when:"12.05 (토)",
    detail:"KIM MINWOO 32D · KIM SOYEONG 32E" }
];
var SEED_PACK = [
  "여권", "항공권 (모바일)", "유로 현금", "신용카드",
  "유럽 어댑터 (C타입)", "보조배터리", "충전기 · 케이블",
  "우산", "상비약", "캐리어 여유 공간"
];

export function seedId(){ return SEED_TRIP.id; }

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
