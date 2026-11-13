/* 그날 여행지의 날씨. 소스는 Open-Meteo — 키 없이 브라우저에서 바로 부를 수 있고,
   NOAA · DWD · Météo-France · ECMWF 같은 각국 기상 기관의 모델을 모아 준다.
   예보는 오늘부터 16일 앞까지만 있다. 그 밖의 날은 '없음'이다.
   어디서 가져왔는지는 화면의 링크가 말한다 (누르면 같은 좌표의 Open-Meteo 페이지). */
import { trip, stayOn, stayDates } from "./model.js";

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

/* 그날 어느 도시에 있는가 — 정보 탭의 숙소에서 읽는다. 그날 묵는 곳이 없으면 가장 가까운 숙소.
   (체크아웃하는 날은 떠나는 숙소, 첫 체크인 전은 첫 숙소.) 숙소가 없으면 여행의 도시. */
export function placeOn(date){
  var t = trip();
  if (!t) return null;
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

/* 같은 좌표를 Open-Meteo에서 열어 보는 주소 */
export function sourceUrl(geo){
  return "https://open-meteo.com/en/docs?latitude=" + (+geo.lat).toFixed(4) +
    "&longitude=" + (+geo.lon).toFixed(4) +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto";
}

function reading(rec, date, p){
  var w = rec && rec.daily && rec.daily[date];
  if (!w) return { ok: false, place: p };
  return { ok: true, place: p, city: rec.geo.name || p.city, hi: w.hi, lo: w.lo, code: w.code,
    desc: describeCode(w.code), url: sourceUrl(rec.geo) };
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
