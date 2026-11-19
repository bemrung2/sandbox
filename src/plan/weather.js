/* 그날 도착지의 날씨. 소스는 Open-Meteo — 키 없이 브라우저에서 바로 부를 수 있고,
   NOAA · DWD · Météo-France · ECMWF 같은 각국 기상 기관의 모델을 모아 준다.
   예보는 오늘 7일 전부터 16일 앞까지만 있다. 그 밖의 날은 '없음'이다.
   어느 도시의 날씨인지는 칩에 도시 이름으로 적는다. (링크는 없다 — 누른다고 어디로 가지 않는다.) */
import { trip, stayOn, stayDates, itemsOn, overnight, weatherOf, todayISO } from "./model.js";

var GEO = "https://geocoding-api.open-meteo.com/v1/search";
var FC = "https://api.open-meteo.com/v1/forecast";
var ARCHIVE = "https://archive-api.open-meteo.com/v1/archive";   /* 92일보다 오래된 날 */
var KEY = "bemtrip.wx.v2";   /* v2: 아이콘을 낮 시간 대표 날씨로 — 예전(그날 가장 나쁜 날씨) 기억은 버린다 */
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

/* ---------- 한국 ----------
   한국의 도시는 좌표까지 들고 있다 — 이름으로 찾는 길(geocoding)을 거치지 않는다. 그 길은 두 글자 이름("서울" · "부산")을
   글자가 똑같은 것만 찾고, 주소("경기도 성남시 분당구")나 동네("청담" · "해운대")는 아예 못 읽는다.
   · KR: 도시 → [위도, 경도]   · KR_SPOT: 동네 · 장소 → 도시   · KR_PROV: 도 → 도청이 있는 도시 (도시를 못 찾았을 때만)
   '고양' · '진주' · '세종' · '양산' · '이천' · '공주'처럼 흔한 말과 겹치는 이름은 '…시'로만 읽는다(고양이 · 진주 목걸이 · 세종문화회관 ·
   양산(우산) · 이천 원 · 공주). 도도 '경기도'처럼 끝까지 적은 것만 — '축구 경기'가 수원이 되면 안 된다. */
var KR = {
  "서울":[37.5665,126.9780], "부산":[35.1796,129.0756], "대구":[35.8714,128.6014], "인천":[37.4563,126.7052],
  "광주":[35.1595,126.8526], "대전":[36.3504,127.3845], "울산":[35.5384,129.3114], "세종":[36.4800,127.2890],
  "수원":[37.2636,127.0286], "성남":[37.4200,127.1267], "고양":[37.6584,126.8320], "용인":[37.2411,127.1776],
  "부천":[37.5034,126.7660], "안산":[37.3219,126.8309], "안양":[37.3943,126.9568], "남양주":[37.6360,127.2165],
  "화성":[37.1995,126.8312], "평택":[36.9921,127.1129], "의정부":[37.7381,127.0337], "파주":[37.7599,126.7802],
  "시흥":[37.3800,126.8030], "김포":[37.6153,126.7156], "광명":[37.4786,126.8646], "하남":[37.5393,127.2149],
  "이천":[37.2720,127.4350], "가평":[37.8315,127.5105], "양평":[37.4917,127.4875],
  "춘천":[37.8813,127.7298], "원주":[37.3422,127.9202], "강릉":[37.7519,128.8761], "속초":[38.2070,128.5918],
  "양양":[38.0754,128.6190], "평창":[37.3705,128.3903], "동해":[37.5247,129.1143], "삼척":[37.4499,129.1652],
  "청주":[36.6424,127.4890], "충주":[36.9910,127.9259], "제천":[37.1326,128.1910],
  "천안":[36.8151,127.1139], "아산":[36.7898,127.0019], "공주":[36.4465,127.1190], "보령":[36.3333,126.6128], "홍성":[36.6013,126.6608],
  "전주":[35.8242,127.1480], "군산":[35.9676,126.7369], "익산":[35.9483,126.9577], "남원":[35.4164,127.3904],
  "여수":[34.7604,127.6622], "순천":[34.9506,127.4872], "목포":[34.8118,126.3922], "무안":[34.9904,126.4817],
  "광양":[34.9407,127.6959], "담양":[35.3211,126.9882],
  "포항":[36.0190,129.3435], "경주":[35.8562,129.2247], "안동":[36.5684,128.7294], "구미":[36.1195,128.3446],
  "창원":[35.2280,128.6811], "김해":[35.2285,128.8894], "진주":[35.1800,128.1076], "통영":[34.8544,128.4331],
  "거제":[34.8806,128.6211], "남해":[34.8377,127.8924], "양산":[35.3350,129.0373], "울릉":[37.4844,130.9058],
  "제주":[33.4996,126.5312], "서귀포":[33.2541,126.5600]
};
var KR_SPOT = {
  /* 흔한 말과 겹치는 도시 이름은 이 꼴로만 */
  "고양시":"고양", "일산":"고양", "진주시":"진주", "세종시":"세종", "세종특별자치시":"세종", "화성시":"화성", "동탄":"화성", "구미시":"구미",
  "남해군":"남해", "동해시":"동해", "이천시":"이천", "공주시":"공주", "양산시":"양산",
  /* 서울 */
  "강남":"서울", "서초":"서울", "송파":"서울", "잠실":"서울", "청담":"서울", "압구정":"서울", "신사동":"서울", "논현":"서울",
  "역삼":"서울", "삼성동":"서울", "선릉":"서울", "코엑스":"서울", "여의도":"서울", "영등포":"서울", "마포":"서울", "홍대":"서울",
  "합정":"서울", "연남":"서울", "망원":"서울", "상암":"서울", "성수":"서울", "건대":"서울", "왕십리":"서울", "용산":"서울",
  "이태원":"서울", "한남동":"서울", "종로":"서울", "광화문":"서울", "세종문화회관":"서울", "명동":"서울", "을지로":"서울",
  "인사동":"서울", "북촌":"서울", "동대문":"서울", "신촌":"서울", "반포":"서울", "잠원":"서울", "목동":"서울", "마곡":"서울",
  "구로":"서울", "가산디지털":"서울", "노원":"서울", "성북":"서울", "남산":"서울", "롯데월드":"서울", "워커힐":"서울",
  /* 부산 · 인천 · 경기 · 제주 · 강원 */
  "해운대":"부산", "광안리":"부산", "광안대교":"부산", "남포동":"부산", "기장군":"부산", "센텀":"부산",
  "송도":"인천", "영종":"인천", "을왕리":"인천", "인천국제공항":"인천", "인천공항":"인천",
  "분당":"성남", "판교":"성남", "광교":"수원",
  "애월":"제주", "협재":"제주", "한림":"제주", "함덕":"제주", "중문":"서귀포", "성산":"서귀포", "표선":"서귀포",
  "경포":"강릉", "주문진":"강릉", "대관령":"평창"
};
var KR_PROV = {
  "경기도":"수원", "강원도":"춘천", "강원특별자치도":"춘천", "충청북도":"청주", "충북":"청주", "충청남도":"홍성", "충남":"홍성",
  "전라북도":"전주", "전북":"전주", "전라남도":"무안", "전남":"무안", "경상북도":"안동", "경북":"안동",
  "경상남도":"창원", "경남":"창원", "제주도":"제주"
};
var KR_ROMAN = {
  seoul:"서울", busan:"부산", pusan:"부산", incheon:"인천", daegu:"대구", gwangju:"광주", daejeon:"대전", ulsan:"울산",
  sejong:"세종", suwon:"수원", seongnam:"성남", goyang:"고양", ilsan:"고양", gimpo:"김포", chuncheon:"춘천",
  gangneung:"강릉", sokcho:"속초", pyeongchang:"평창", jeonju:"전주", yeosu:"여수", suncheon:"순천", mokpo:"목포",
  pohang:"포항", gyeongju:"경주", changwon:"창원", tongyeong:"통영", geoje:"거제", jeju:"제주", seogwipo:"서귀포"
};
var KR_UNSAFE = { "고양":1, "진주":1, "세종":1, "화성":1, "구미":1, "남해":1, "동해":1, "이천":1, "공주":1, "양산":1 };
/* "한국" · "대한민국" · "국내"처럼 나라만 적힌 것 */
var KR_COUNTRY = /^(대한민국|한국|남한|국내|korea|south korea|republic of korea)$/i;
var KR_NAMES = Object.keys(KR).filter(function(k){ return !KR_UNSAFE[k]; }).concat(Object.keys(KR_SPOT))
  .sort(function(a, b){ return b.length - a.length; });
function krPlace(city){ return KR[city] ? { city: city, country: "대한민국", geo: KR[city] } : null; }
/* 글에서 한국의 도시를 읽는다 — 동네 · 장소 이름(긴 것부터), 영어 표기, 마지막으로 도 이름 */
function krIn(text){
  var raw = String(text || "");
  if (!raw.trim()) return null;
  for (var i = 0; i < KR_NAMES.length; i++){
    if (raw.indexOf(KR_NAMES[i]) >= 0) return krPlace(KR_SPOT[KR_NAMES[i]] || KR_NAMES[i]);
  }
  var low = raw.toLowerCase();
  for (var r in KR_ROMAN){
    if (new RegExp("(^|[^a-z])" + r + "($|[^a-z])").test(low)) return krPlace(KR_ROMAN[r]);
  }
  for (var pv in KR_PROV){
    if (raw.indexOf(pv) >= 0) return krPlace(KR_PROV[pv]);
  }
  return null;
}
/* 여행 전체에서 가장 많이 나온 한국의 도시 — 그날 읽을 것이 없을 때 쓴다 */
function krMost(t){
  var count = {}, best = null;
  (t.items || []).forEach(function(it){
    var hit = krIn((it.places || []).join(" ") + " " + (it.title || ""));
    if (hit) count[hit.city] = (count[hit.city] || 0) + 1;
  });
  (t.stays || []).forEach(function(st){
    var hit = krIn((st.area || "") + " " + (st.name || ""));
    if (hit) count[hit.city] = (count[hit.city] || 0) + 1;
  });
  Object.keys(count).forEach(function(c){ if (!best || count[c] > count[best]) best = c; });
  return best ? krPlace(best) : null;
}

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
  /* 이 여행의 숙소에 적힌 도시가 먼저 */
  var own = Object.keys(known).sort(function(a, b){ return b.length - a.length; });
  for (var o = 0; o < own.length; o++){
    if (low.indexOf(own[o].toLowerCase()) >= 0) return krPlace(own[o]) || { city: own[o], country: known[own[o]] || "" };
  }
  var kr = krIn(text);
  if (kr) return kr;
  var names = Object.keys(ALIAS);
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
  return w ? (krPlace(w) || { city: w, country: "" }) : null;
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
    hit = inText(dest, known) || airportCity(dest) || (to ? (krPlace(to) || { city: to, country: "" }) : null);
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
  if (tail) return krPlace(tail) || { city: tail, country: "" };

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
  /* 지역이 주소 · 동네라도 한국이면 도시로 읽는다("서울 강남구" · "경기도 가평" · "청담") */
  var krArea = krIn(area);
  if (krArea) return krArea;
  var parts = String(area).split(/[·,/]/).map(function(x){ return x.trim(); }).filter(Boolean);
  var last = parts.length ? parts[parts.length - 1] : "";
  /* 나라만 적혔거나(한국 · 대한민국) 아무것도 없으면 — 이 여행의 일정 · 숙소에 가장 많이 나온 한국 도시,
     그것도 없는데 나라가 한국이면 서울 */
  if (!last || KR_COUNTRY.test(last)){
    var most = krMost(t);
    if (most) return most;
    if (last) return krPlace("서울");
    return null;
  }
  return { city: last, country: parts.length > 1 ? parts[0] : "" };
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
  /* 한국의 도시는 들고 있는 좌표로 — 부르지 않는다 */
  var own = p.geo || KR[p.city];
  if (own) return Promise.resolve({ lat: own[0], lon: own[1], name: p.city });
  var korean = p.country === "대한민국";
  function ask(name){
    var url = GEO + "?name=" + encodeURIComponent(name) + "&count=8&language=ko&format=json" + (korean ? "&countryCode=KR" : "");
    return getJSON(url).then(function(d){
      var rs = (d && d.results) || [];
      if (!rs.length) return null;
      var hit = rs.filter(function(r){ return p.country && (r.country === p.country); })[0] || rs[0];
      return { lat: hit.latitude, lon: hit.longitude, name: hit.name };
    });
  }
  return ask(p.city).then(function(g){
    /* "가평군" · "속초시"처럼 끝말이 붙은 한글 이름은 끝말을 떼고 한 번 더 */
    var bare = String(p.city).replace(/(특별자치시|특별자치도|특별시|광역시|시|군|구)$/, "");
    return g || (bare !== p.city && bare.length >= 2 ? ask(bare) : null);
  });
}

/* ---------- 하루를 한 그림으로 ----------
   Open-Meteo의 하루 날씨 코드(daily weather_code)는 '그날 가장 나쁜 날씨'다 — 새벽에 한 시간 이슬비가 와도 하루 종일 비가 된다.
   그래서 아이콘은 **낮(9–18시)의 시간별 날씨**로 정한다:
   · 뇌우: 낮에 뇌우가 한 시간이라도 있고 낮 강수가 1mm 이상
   · 눈: 낮에 눈 오는 시간이 2시간 이상(또는 1시간이라도 낮 강수 1mm 이상)
   · 비: 낮에 젖는 시간(이슬비 · 비 · 소나기)이 4시간 이상이거나 낮 강수 3mm 이상 → 비(가장 흔한 비 코드)
         2–3시간이거나 1mm 이상 → 소나기(80) — 오다 말다
   · 그 밖에는 하늘: 맑음 0 · 대체로 맑음 1 · 구름 조금 2 · 흐림 3(낮 시간 구름 정도의 평균), 안개가 4시간 넘으면 안개
   시간별 값이 없으면 하루 코드 그대로. */
var WET = function(c){ return (c >= 51 && c <= 67) || (c >= 80 && c <= 82); };
var SNOW = function(c){ return (c >= 71 && c <= 77) || c === 85 || c === 86; };
export function dayCode(codes, precs, fallback){
  if (!codes || !codes.length) return fallback;
  var n = codes.length, wet = 0, snow = 0, storm = 0, fog = 0, cloud = 0, mm = 0, wetCodes = {}, snowCodes = {};
  codes.forEach(function(c, i){
    mm += +(precs && precs[i]) || 0;
    if (c >= 95) storm++;
    else if (SNOW(c)){ snow++; snowCodes[c] = (snowCodes[c] || 0) + 1; }
    else if (WET(c)){ wet++; wetCodes[c] = (wetCodes[c] || 0) + 1; }
    else if (c === 45 || c === 48) fog++;
    cloud += c <= 1 ? (c === 0 ? 0 : 0.6) : c === 2 ? 1.3 : 2;   /* 젖은 시간 · 안개는 흐린 하늘로 센다 */
  });
  var most = function(m){ return +Object.keys(m).sort(function(a, b){ return m[b] - m[a]; })[0]; };
  if (storm && mm >= 1) return 95;
  if (snow >= 2 || (snow && mm >= 1)) return most(snowCodes);
  if (wet >= 4 || mm >= 3) return most(wetCodes) || 61;
  if (wet >= 2 || (wet && mm >= 1)) return 80;
  if (fog >= 4) return 45;
  var avg = cloud / n;
  return avg < 0.3 ? 0 : avg < 0.8 ? 1 : avg < 1.5 ? 2 : 3;
}
/* 시간별 표에서 그날 낮(9–18시) 몫만 */
function daytime(h, day){
  var codes = [], precs = [];
  if (!h || !h.time) return null;
  for (var i = 0; i < h.time.length; i++){
    var t = h.time[i];
    if (t.slice(0, 10) !== day) continue;
    var hr = +t.slice(11, 13);
    if (hr < 9 || hr > 18 || h.weather_code[i] == null) continue;
    codes.push(h.weather_code[i]); precs.push(h.precipitation ? h.precipitation[i] : 0);
  }
  return codes.length >= 6 ? { codes: codes, precs: precs } : null;
}
function readDays(d){
  var dd = d && d.daily;
  if (!dd || !dd.time) return null;
  var out = {};
  dd.time.forEach(function(day, i){
    var hi = dd.temperature_2m_max[i], lo = dd.temperature_2m_min[i], code = dd.weather_code[i];
    if (hi == null || lo == null || code == null) return;
    var dt = daytime(d.hourly, day);
    out[day] = { hi: Math.round(hi), lo: Math.round(lo), code: dt ? dayCode(dt.codes, dt.precs, code) : code };
  });
  return out;
}
function forecast(geo){
  var url = FC + "?latitude=" + geo.lat + "&longitude=" + geo.lon +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min&hourly=weather_code,precipitation" +
    "&timezone=auto&past_days=92&forecast_days=16";
  return getJSON(url).then(readDays);
}

/* 오래된 하루 — 예보의 지난 92일 밖이면 기록 보관소(archive)에서 그날 하나를 가져온다 */
function archiveDay(geo, date){
  var url = ARCHIVE + "?latitude=" + geo.lat + "&longitude=" + geo.lon + "&start_date=" + date + "&end_date=" + date +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min&hourly=weather_code,precipitation&timezone=auto";
  return getJSON(url).then(function(d){
    var days = readDays(d);
    return days && days[date] || null;
  }, function(){ return null; });
}
/* 예보가 닿는 마지막 날 — 오늘에서 15일 뒤 */
function fcEnd(){
  var d = new Date(todayISO() + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 15);
  return d.toISOString().slice(0, 10);
}
function daysAgo(date){ return Math.round((Date.parse(todayISO()) - Date.parse(date)) / 86400000); }

/* 적어 둔 기록 — 지나간 날은 이것이 먼저다 */
function recorded(date){
  var w = weatherOf(date);
  return w && w.hi != null ? { ok: true, recorded: true, city: w.city, hi: w.hi, lo: w.lo, code: w.code, desc: describeCode(w.code) } : null;
}

function reading(rec, date, p){
  var w = rec && rec.daily && rec.daily[date];
  if (!w) return { ok: false, place: p, far: date > fcEnd() };
  /* 7일 넘게 남은 예보는 어느 원천이든 크게 바뀐다 — 화면에서 옅게(far) */
  return { ok: true, place: p, city: p.city, hi: w.hi, lo: w.lo, code: w.code, desc: describeCode(w.code), far: daysAgo(date) < -7 };
}

/* 지금 기억에 있는 것만, 기다리지 않고. 없으면 null. */
export function peek(date){
  var r = recorded(date);
  if (r) return r;
  var p = placeOn(date);
  if (!p) return { ok: false, place: null };
  var rec = recall(placeKey(p));
  return rec ? reading(rec, date, p) : null;
}

/* 날씨를 가져온다. 항상 {ok:false} 또는 {ok:true, …}로 끝난다 — 실패는 '없음'일 뿐이다. */
export function weatherOn(date){
  var r = recorded(date);
  if (r) return Promise.resolve(r);
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
    var got = reading(fresh || rec, date, p);   // 새로 못 받으면 묵은 것이라도
    var have = fresh || rec;
    if (got.ok || !have || !have.geo || daysAgo(date) <= 85) return got;
    /* 예보가 닿지 않는 오래된 날이면 기록 보관소에서 */
    return archiveDay(have.geo, date).then(function(w){
      return w ? { ok: true, place: p, city: p.city, hi: w.hi, lo: w.lo, code: w.code, desc: describeCode(w.code) } : got;
    });
  });
}
