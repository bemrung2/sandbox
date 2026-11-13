/* 그날 도착지의 날씨. 소스는 Open-Meteo — 키 없이 브라우저에서 바로 부를 수 있고,
   NOAA · DWD · Météo-France · ECMWF 같은 각국 기상 기관의 모델을 모아 준다.
   예보는 오늘 7일 전부터 16일 앞까지만 있다. 그 밖의 날은 '없음'이다.
   어느 도시의 날씨인지는 칩에 도시 이름으로 적는다. (링크는 없다 — 누른다고 어디로 가지 않는다.) */
import { trip, stayOn, stayDates, itemsOn, overnight } from "./model.js";

var GEO = "https://geocoding-api.open-meteo.com/v1/search";
var FC = "https://api.open-meteo.com/v1/forecast";
var KEY = "bemtrip.wx.v1";
var FRESH = 3 * 3600 * 1000;      // 예보는 3시간마다 새로
var mem = {};                     // 이 탭 안의 기억 { 장소키: { at, geo, daily } }
var inflight = {};                // 같은 장소를 두 번 부르지 않는다

/* WMO 날씨 코드 → 말 · 아이콘 · 색 */
export function describeCode(c){
  c = +c;
  if (c === 0) return { label: "맑음", icon: "wx-sun", tone: "sun" };
  if (c === 1 || c === 2) return { label: c === 1 ? "대체로 맑음" : "구름 조금", icon: "wx-part", tone: "sun" };
  if (c === 3) return { label: "흐림", icon: "wx-cloud", tone: "cloud" };
  if (c === 45 || c === 48) return { label: "안개", icon: "wx-fog", tone: "cloud" };
  if (c >= 51 && c <= 57) return { label: "이슬비", icon: "wx-rain", tone: "rain" };
  if (c >= 61 && c <= 67) return { label: "비", icon: "wx-rain", tone: "rain" };
  if (c >= 71 && c <= 77) return { label: "눈", icon: "wx-snow", tone: "snow" };
  if (c >= 80 && c <= 82) return { label: "소나기", icon: "wx-rain", tone: "rain" };
  if (c === 85 || c === 86) return { label: "눈", icon: "wx-snow", tone: "snow" };
  if (c >= 95) return { label: "뇌우", icon: "wx-storm", tone: "rain" };
  return { label: "날씨", icon: "wx-cloud", tone: "cloud" };
}

/* 알려진 도시의 영어 · 현지 표기 — 장소 이름에 "Tonnarello Roma"처럼 적혀 있는 것을 읽으려고. */
var ALIAS = {
  "로마": ["roma", "rome"], "피렌체": ["firenze", "florence"], "파리": ["paris"],
  "체르마트": ["zermatt"], "그린델발트": ["grindelwald"], "인터라켄": ["interlaken"],
  "베네치아": ["venezia", "venice"], "밀라노": ["milano", "milan"], "나폴리": ["napoli", "naples"],
  "취리히": ["zurich", "zürich"], "루체른": ["luzern", "lucerne"], "제네바": ["geneve", "geneva"],
  "인천": ["incheon"], "서울": ["seoul"], "도쿄": ["tokyo"], "오사카": ["osaka"], "교토": ["kyoto"],
  "런던": ["london"], "바르셀로나": ["barcelona"], "마드리드": ["madrid"]
};

/* 이 여행에서 이름이 알려진 도시 — 숙소의 지역 끝말. { 도시: 나라 } */
function knownCities(t){
  var out = {};
  (t.stays || []).forEach(function(st){
    var parts = String(st.area || "").split(/[·,/]/).map(function(x){ return x.trim(); }).filter(Boolean);
    if (parts.length) out[parts[parts.length - 1]] = parts.length > 1 ? parts[0] : "";
  });
  return out;
}
function inText(text, known){
  var low = String(text || "").toLowerCase();
  if (!low) return null;
  var names = Object.keys(known).concat(Object.keys(ALIAS).filter(function(k){ return !(k in known); }));
  names.sort(function(a, b){ return b.length - a.length; });
  for (var i = 0; i < names.length; i++){
    var n = names[i], hit = low.indexOf(n.toLowerCase()) >= 0;
    if (!hit) hit = (ALIAS[n] || []).some(function(al){ return new RegExp("(^|[^a-z])" + al + "($|[^a-z])").test(low); });
    if (hit) return { city: n, country: known[n] || "" };
  }
  return null;
}
/* 공항 이름의 첫 말이 도시다: "인천국제공항 제2여객터미널" → 인천 */
function airportCity(text){
  if (!/공항|airport/i.test(text || "")) return null;
  var w = String(text).trim().split(/\s+/)[0].replace(/(국제)?공항$/, "");
  return w ? { city: w, country: "" } : null;
}
function arrow(text){
  var parts = String(text || "").split(/\s*(?:→|➔|->|=>|>)\s*/);
  return parts.length > 1 ? parts[parts.length - 1].trim() : "";
}

/* 그날 어디에 도착하는가 — 하루의 마지막 일정이 있는 곳.
   이동이면 내리는 곳(마지막 장소 · '→' 뒤), 아니면 그 일정의 장소. 도시를 읽을 수 없는 일정은 건너뛰고
   그 앞 일정으로. 일정에서 못 읽으면 한 줄 요약의 '→' 뒤, 그것도 없으면 그날 묵는 숙소의 도시. */
function arrivalOf(it, known){
  var places = it.places || [], hit = null;
  if (it.cat === "move" || it.cat === "air"){
    var to = arrow(it.title);
    var dest = to || (places.length ? places[places.length - 1] : "");
    hit = inText(dest, known) || airportCity(dest) || (to ? { city: to, country: "" } : null);
  } else {
    hit = inText(places.join(" ") + " " + (it.title || ""), known);
  }
  return hit;
}
function dayBefore(date){
  var d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
export function placeOn(date){
  var t = trip();
  if (!t) return null;
  var known = knownCities(t);
  var list = itemsOn(date).slice().reverse();
  for (var i = 0; i < list.length; i++){
    var hit = arrivalOf(list[i], known);
    if (hit) return hit;
  }
  /* 이 날 적힌 것이 없는데 어제 밤을 넘겨 오는 비행이 이 날 내렸다면 그곳이다 */
  var prev = itemsOn(dayBefore(date)).filter(function(it){ return overnight(it); });
  for (var j = prev.length - 1; j >= 0; j--){
    var h2 = arrivalOf(prev[j], known);
    if (h2) return h2;
  }
  var theme = (t.dayThemes || {})[date] || "";
  var tail = arrow(theme);
  var fromTheme = inText(tail || theme, known);
  if (fromTheme) return fromTheme;
  if (tail) return { city: tail, country: "" };

  var st = stayOn(date);
  if (!st){
    var best = null, bestGap = 1e9;
    (t.stays || []).forEach(function(s){
      var r = stayDates(s, t);
      if (!r) return;
      var gap = date > r.b ? Date.parse(date) - Date.parse(r.b)
        : date < r.a ? Date.parse(r.a) - Date.parse(date) : 0;
      if (gap < bestGap){ best = s; bestGap = gap; }
    });
    st = best;
  }
  var area = (st && st.area) || t.city || "";
  var parts = String(area).split(/[·,/]/).map(function(x){ return x.trim(); }).filter(Boolean);
  if (!parts.length) return null;
  return { city: parts[parts.length - 1], country: parts.length > 1 ? parts[0] : "" };
}

function load(){
  try{ return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; }catch(e){ return {}; }
}
function save(key, val){
  mem[key] = val;
  try{
    var all = load();
    all[key] = val;
    var keys = Object.keys(all);
    if (keys.length > 12) delete all[keys.sort(function(a, b){ return all[a].at - all[b].at; })[0]];
    localStorage.setItem(KEY, JSON.stringify(all));
  }catch(e){}
}
function recall(key){
  if (mem[key]) return mem[key];
  var v = load()[key];
  if (v && v.daily){ mem[key] = v; return v; }
  return null;
}
function placeKey(p){ return (p.country + "|" + p.city).toLowerCase(); }

function getJSON(url){
  var ctl = typeof AbortController === "function" ? new AbortController() : null;
  var timer = ctl ? setTimeout(function(){ ctl.abort(); }, 9000) : 0;
  return fetch(url, ctl ? { signal: ctl.signal } : undefined).then(function(res){
    clearTimeout(timer);
    if (!res.ok) throw new Error("http " + res.status);
    return res.json();
  }, function(e){ clearTimeout(timer); throw e; });
}

/* 도시 이름 → 좌표. 나라 이름이 같은 것을 먼저 고른다. */
function geocode(p){
  var url = GEO + "?name=" + encodeURIComponent(p.city) + "&count=8&language=ko&format=json";
  return getJSON(url).then(function(d){
    var rs = (d && d.results) || [];
    if (!rs.length) return null;
    var hit = rs.filter(function(r){ return p.country && (r.country === p.country); })[0] || rs[0];
    return { lat: hit.latitude, lon: hit.longitude, name: hit.name };
  });
}

function forecast(geo){
  var url = FC + "?latitude=" + geo.lat + "&longitude=" + geo.lon +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&past_days=7&forecast_days=16";
  return getJSON(url).then(function(d){
    var dd = d && d.daily;
    if (!dd || !dd.time) return null;
    var out = {};
    dd.time.forEach(function(day, i){
      var hi = dd.temperature_2m_max[i], lo = dd.temperature_2m_min[i], code = dd.weather_code[i];
      if (hi == null || lo == null || code == null) return;
      out[day] = { hi: Math.round(hi), lo: Math.round(lo), code: code };
    });
    return out;
  });
}

function reading(rec, date, p){
  var w = rec && rec.daily && rec.daily[date];
  if (!w) return { ok: false, place: p };
  return { ok: true, place: p, city: p.city, hi: w.hi, lo: w.lo, code: w.code, desc: describeCode(w.code) };
}

/* 지금 기억에 있는 것만, 기다리지 않고. 없으면 null. */
export function peek(date){
  var p = placeOn(date);
  if (!p) return { ok: false, place: null };
  var rec = recall(placeKey(p));
  return rec ? reading(rec, date, p) : null;
}

/* 날씨를 가져온다. 항상 {ok:false} 또는 {ok:true, …}로 끝난다 — 실패는 '없음'일 뿐이다. */
export function weatherOn(date){
  var p = placeOn(date);
  if (!p) return Promise.resolve({ ok: false, place: null });
  var key = placeKey(p), rec = recall(key);
  if (rec && Date.now() - rec.at < FRESH) return Promise.resolve(reading(rec, date, p));
  if (!inflight[key]){
    inflight[key] = geocode(p).then(function(geo){
      return geo ? forecast(geo).then(function(daily){
        return daily ? { at: Date.now(), geo: geo, daily: daily } : null;
      }) : null;
    }).then(function(fresh){
      if (fresh) save(key, fresh);
      return fresh;
    }, function(){ return null; }).then(function(fresh){
      delete inflight[key];
      return fresh;
    });
  }
  return inflight[key].then(function(fresh){
    return reading(fresh || rec, date, p);   // 새로 못 받으면 묵은 것이라도
  });
}
