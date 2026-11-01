/* 여행 계획 — the data, and the reading of it.
 *
 * One record is one document, so two people editing different things never
 * overwrite each other. The paths are what the server turns into table rows:
 *
 *   travel/trips/<id>                      여행
 *   travel/trips/<id>/days/<YYYY-MM-DD>    그날 요약 + 동선
 *   travel/trips/<id>/items/<id>           일정 하나
 *   travel/trips/<id>/<목록>/<id>           가게 · 항공 · 숙소 · 예약 · 링크 · 준비물 · 메모
 *   travel/trips/<id>/attach/<id>          일정에 붙인 자료
 */
import { uid } from "../ui/dom.js";
import { Store } from "../ui/store.js";

export var ROOT = "travel/trips";
export var LISTS = ["items", "shops", "flights", "stays", "books", "links", "packList", "notes"];
var DOW = ["일", "월", "화", "수", "목", "금", "토"];

/* Emoji are deliberately rare: only where one carries meaning on its own
   (비행기 · 호텔 · 짐). Everything else is told by the category colour. */


export function newTrip(o){
  o = o || {};
  return {
    id: o.id || uid("tr"),
    pin: +o.pin || 0,
    title: o.title || "",
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

/* 유럽 신혼여행. 항공편은 대한항공 예약 조회 화면에서, 현지 일정은 신혼여행
   계획표(엑셀)에서 옮겨 적었다. 첫 방문에 한 번 깔리고, 그 뒤로는 앱 안에서 고친다. */
var SEED_TRIP = { id:"europe2026", emoji:"🇪🇺", city:"유럽", country:"ROMA · PARIS",
                  start:"2026-11-23", end:"2026-12-06" };
var SEED_THEMES = {
  "2026-11-23": "인천 → 로마",
  "2026-11-24": "로마",
  "2026-11-25": "로마",
  "2026-11-26": "로마",
  "2026-11-27": "로마 → 피렌체",
  "2026-11-28": "피렌체 → 체르마트",
  "2026-11-29": "체르마트",
  "2026-11-30": "체르마트 → 그린델발트",
  "2026-12-01": "그린델발트",
  "2026-12-02": "그린델발트",
  "2026-12-03": "그린델발트 → 파리",
  "2026-12-04": "파리",
  "2026-12-05": "파리 → 인천"
};
/* 그날 어디에 있고 어디로 넘어가는지. 숙소에서 그대로 나온 동선이고,
   그날 무엇을 할지는 여기에 더 적으면 된다. */
var SEED_ROUTES = {
  "2026-11-23": ["로마 피우미치노 공항", "트라스테베레, 로마"],
  "2026-11-24": ["트라스테베레, 로마"],
  "2026-11-25": ["트라스테베레, 로마"],
  "2026-11-26": ["트라스테베레, 로마"],
  "2026-11-27": ["트라스테베레, 로마", "피렌체"],
  "2026-11-28": ["피렌체", "체르마트"],
  "2026-11-29": ["체르마트"],
  "2026-11-30": ["체르마트", "그린델발트"],
  "2026-12-01": ["그린델발트"],
  "2026-12-02": ["그린델발트"],
  "2026-12-03": ["그린델발트", "파리"],
  "2026-12-04": ["파리"],
  "2026-12-05": ["파리", "파리 샤를 드 골 공항"]
};
/* 항공편 하나가 일정 하나다 — 이동 · 항공기. 정보 탭의 항공 칸도 이것을 본다.
   (예전에는 출발 · 도착을 따로 적고 정보 탭에도 한 번 더 적었다.) */
var SEED_ITEMS = [
  { id:"fl-f1", d:"2026-11-23", s:"14:05", e:"19:35", cat:"move", mode:"plane", emo:"✈️",
    t:"대한항공 KE931",
    places:["인천국제공항 제2여객터미널", "로마 피우미치노 공항 제3터미널"],
    lines:["가는 편 · A350-900 · 일반석(K)", "14:05 인천 T2 — 19:35 로마 T3 · 13시간 30분",
           "KIM MINWOO 36F · KIM SOYEONG 36E"] },
  { id:"fl-f2", d:"2026-12-05", s:"15:05", e:"11:15", cat:"move", mode:"plane", emo:"✈️",
    t:"대한항공 KE5902",
    places:["파리 샤를 드 골 공항 제2E터미널", "인천국제공항 제2여객터미널"],
    lines:["오는 편 · A350-900 · 일반석(U) · 에어프랑스 운항",
           "15:05 파리 T2E — 12.06 11:15 인천 T2 · 12시간 10분",
           "KIM MINWOO 32D · KIM SOYEONG 32E"] },

  /* ---- 신혼여행 계획표(엑셀 '신혼여행계획')에서 옮겨 온 현지 일정. 아이디는 hm-로
     시작한다 — 이미 쓰고 있는 여행에도 이 묶음만 따로 불러올 수 있게. ---- */
  /* 11.23 로마 도착 */
  { id:"hm-1123a", d:"2026-11-23", s:"20:00", cat:"food", meal:"dinner", t:"Mr.Clood Bistrot",
    places:["Mr.Clood Bistrot Roma"], lines:["사과농어구이, 피스타치오 파스타"] },
  /* 11.24 로마 — 오전 콜로세움 · 포로 로마노, 오후 트라스테베레 */
  { id:"hm-1124a", d:"2026-11-24", s:"10:00", cat:"food", meal:"cafe", t:"Regoli Pasticceria",
    places:["Regoli Pasticceria Roma"], lines:["커피와 빵"] },
  { id:"hm-1124b", d:"2026-11-24", s:"10:30", e:"12:00", cat:"sight", t:"콜로세움 · 포로 로마노 · 팔라티노 언덕",
    places:["콜로세움", "콘스탄티누스 개선문", "포로 로마노", "팔라티노 언덕", "진실의 입"],
    lines:["콜로세움 통합권 예약", "콜로세움 → 콘스탄티누스 개선문 → 포로 로마노 → 팔라티노 언덕 · 진실의 입"] },
  { id:"hm-1124c", d:"2026-11-24", s:"12:00", cat:"food", meal:"lunch", t:"피자" },
  { id:"hm-1124d", d:"2026-11-24", s:"13:00", cat:"food", meal:"cafe", t:"카페" },
  { id:"hm-1124e", d:"2026-11-24", s:"14:00", cat:"sight", t:"트라스테베레 산책", places:["트라스테베레 로마"] },
  { id:"hm-1124f", d:"2026-11-24", s:"16:00", cat:"etc", t:"스냅 촬영" },
  { id:"hm-1124g", d:"2026-11-24", s:"17:00", cat:"food", meal:"dinner", t:"Tonnarello",
    places:["Tonnarello Roma"], lines:["까르보나라, 미트볼, 아마트리치아나"] },
  { id:"hm-1124h", d:"2026-11-24", s:"18:00", cat:"food", meal:"snack", t:"Fiordiluna",
    places:["Fiordiluna Roma"], lines:["젤라또"] },
  { id:"hm-1124i", d:"2026-11-24", s:"20:00", cat:"food", meal:"drink", t:"마트에서 장보고 2차" },
  /* 11.25 로마 — 바티칸, 천사의 성 */
  { id:"hm-1125a", d:"2026-11-25", s:"07:40", cat:"sight", t:"바티칸 투어",
    places:["바티칸 박물관"], lines:["07:40 시작"] },
  { id:"hm-1125b", d:"2026-11-25", s:"14:00", cat:"food", meal:"lunch", t:"Ristorante Arlù", tag:"예약완료",
    places:["Ristorante Arlù Roma"],
    lines:["까르보나라, 아마트리치아나, 티라미수", "Soyeong Kim 이름으로 14시 예약 · 15분 지나면 취소"] },
  { id:"hm-1125c", d:"2026-11-25", s:"15:00", cat:"food", meal:"cafe", t:"카페" },
  { id:"hm-1125d", d:"2026-11-25", s:"16:00", cat:"food", meal:"snack", t:"Supplizio",
    places:["Supplizio Roma"], lines:["수플리 간식 — 맥주랑 같이"] },
  { id:"hm-1125e", d:"2026-11-25", s:"17:00", cat:"sight", t:"야경 투어",
    places:["천사의 성"], lines:["17:00 천사의 성 정문 앞"] },
  { id:"hm-1125f", d:"2026-11-25", s:"20:00", cat:"food", meal:"dinner", t:"저녁" },
  { id:"hm-1125g", d:"2026-11-25", s:"21:00", cat:"food", meal:"drink", t:"마트에서 장보고 2차" },
  /* 11.26 로마 — 트레비 · 판테온 · 나보나 · 스페인 계단 */
  { id:"hm-1126a", d:"2026-11-26", s:"08:30", cat:"food", meal:"cafe", t:"La Casa del Caffè Tazza d'Oro",
    places:["La Casa del Caffè Tazza d'Oro Roma"], lines:["커피, 피스타치오 크루아상"] },
  { id:"hm-1126b", d:"2026-11-26", s:"09:00", cat:"sight", t:"트레비 분수", places:["트레비 분수"], lines:["예약 필요"] },
  { id:"hm-1126c", d:"2026-11-26", s:"10:00", cat:"sight", t:"판테온", places:["판테온 로마"], lines:["예약 필요"] },
  { id:"hm-1126d", d:"2026-11-26", s:"11:00", cat:"sight", t:"나보나 광장", places:["나보나 광장"] },
  { id:"hm-1126e", d:"2026-11-26", s:"12:00", cat:"sight", t:"스페인 계단", places:["스페인 계단"] },
  { id:"hm-1126f", d:"2026-11-26", s:"13:00", cat:"food", meal:"lunch", t:"Osteria da Fortunata - Pantheon",
    places:["Osteria da Fortunata Pantheon Roma"] },
  { id:"hm-1126g", d:"2026-11-26", s:"14:00", cat:"food", meal:"snack", t:"Giolitti",
    places:["Giolitti Roma"], lines:["젤라또"] },
  { id:"hm-1126h", d:"2026-11-26", s:"15:00", cat:"food", meal:"drink", t:"Dar Filettaro a Santa Barbara",
    places:["Dar Filettaro a Santa Barbara Roma"], lines:["대구튀김 & 맥주"] },
  { id:"hm-1126i", d:"2026-11-26", s:"19:00", cat:"food", meal:"dinner", t:"저녁" },
  { id:"hm-1126j", d:"2026-11-26", s:"21:00", cat:"food", meal:"drink", t:"마트에서 장보고 2차" },
  /* 11.27 피렌체 */
  { id:"hm-1127a", d:"2026-11-27", s:"11:00", cat:"food", meal:"cafe", t:"Caffè Gilli",
    places:["Caffè Gilli Firenze"] },
  { id:"hm-1127b", d:"2026-11-27", s:"12:00", cat:"food", meal:"lunch", t:"Bottega di Fattoria - Trattoria Toscana",
    tag:"예약완료", places:["Bottega di Fattoria Trattoria Toscana Firenze"],
    lines:["12시 2명 예약완료", "또는 NUTI Il Grande Nuti Trattoria"] },
  { id:"hm-1127c", d:"2026-11-27", s:"13:00", cat:"food", meal:"drink", t:"View on Art Rooftop Cocktail Bar",
    places:["View on Art Rooftop Cocktail Bar Firenze"] },
  { id:"hm-1127d", d:"2026-11-27", s:"14:15", cat:"sight", t:"두오모 쿠폴라", tag:"예약완료",
    places:["Cupola del Brunelleschi Firenze"], lines:["14:15 쿠폴라 예약 완료"] },
  { id:"hm-1127e", d:"2026-11-27", s:"15:00", cat:"food", meal:"cafe", t:"Vivoli",
    places:["Vivoli Firenze"], lines:["피스타치오 커피"] },
  { id:"hm-1127f", d:"2026-11-27", s:"16:00", cat:"sight", t:"베키오 궁전 전망대 · 우피치 미술관",
    places:["베키오 궁전", "우피치 미술관"] },
  { id:"hm-1127g", d:"2026-11-27", s:"17:00", cat:"sight", t:"미켈란젤로 언덕", places:["미켈란젤로 광장 피렌체"] },
  { id:"hm-1127h", d:"2026-11-27", s:"18:00", cat:"shop", t:"피렌체 쇼핑" },
  { id:"hm-1127i", d:"2026-11-27", s:"19:00", cat:"food", meal:"dinner", t:"Trattoria Dalloste", tag:"예약완료",
    places:["Trattoria Dalloste Firenze"], lines:["19시 2명 예약완료 (The Fork 앱)"] },
  { id:"hm-1127j", d:"2026-11-27", s:"19:00", cat:"food", meal:"dinner", t:"Trattoria Zà Zà", tag:"예약완료",
    places:["Trattoria Zà Zà Firenze"], lines:["19시 2명 예약완료"] },
  { id:"hm-1127k", d:"2026-11-27", s:"20:00", cat:"food", meal:"drink", t:"Buca San Giovanni Frigest",
    places:["Buca San Giovanni Firenze"], lines:["두오모 성당 야경 보면서 와인 한잔"] },
  /* 11.28 피렌체 → 체르마트 */
  { id:"hm-1128a", d:"2026-11-28", s:"07:00", cat:"food", meal:"breakfast", t:"All'Antico Vinaio",
    places:["All'Antico Vinaio Firenze"], lines:["아침 샌드위치"] },
  { id:"hm-1128b", d:"2026-11-28", s:"09:00", e:"15:00", cat:"move", mode:"other", t:"피렌체 → 밀라노 → 체르마트",
    lines:["15:00 체르마트 도착 예상"] },
  { id:"hm-1128c", d:"2026-11-28", s:"16:00", cat:"stay", t:"알펜리조트 체크인",
    places:["알펜리조트 체르마트"], lines:["근처 3분 거리에 마트 — 토블론 초콜릿 구매"] },
  { id:"hm-1128d", d:"2026-11-28", s:"17:00", cat:"sight", t:"반호프슈트라세 산책",
    places:["Bahnhofstrasse Zermatt"] },
  { id:"hm-1128e", d:"2026-11-28", s:"18:00", cat:"shop", t:"쿱마트 장보기",
    places:["Coop Zermatt"], lines:["쿱마트는 20시까지"] },
  { id:"hm-1128f", d:"2026-11-28", s:"19:00", cat:"food", meal:"dinner", t:"저녁" },
  { id:"hm-1128g", d:"2026-11-28", s:"20:00", cat:"etc", t:"수영장 · 루프탑 자쿠지",
    lines:["실내 수영장, 실내 자쿠지, 루프탑 자쿠지 (07:00–22:00)"] },
  /* 11.29 체르마트 — 고르너그라트 */
  { id:"hm-1129a", d:"2026-11-29", s:"06:00", cat:"sight", t:"일출 — 황금 호른 보기",
    map:"https://www.google.com/maps?q=46.019271,7.748542",
    lines:["뷰포인트 46° 1' 9.3756\" N 7° 44' 54.7512\" E", "또는 키르히다리"] },
  { id:"hm-1129b", d:"2026-11-29", s:"08:00", cat:"food", meal:"breakfast", t:"호텔 조식",
    lines:["주문 가능한 에그 메뉴 — 알펜 리조트 스페셜 추천"] },
  { id:"hm-1129c", d:"2026-11-29", s:"09:00", cat:"move", mode:"walk", t:"조식 후 역으로 이동" },
  { id:"hm-1129d", d:"2026-11-29", s:"10:00", cat:"sight", t:"고르너그라트 전망대",
    places:["고르너그라트"],
    lines:["체르마트 → 고르너그라트 (열차)", "고르너그라트 → 로텐보덴역 (열차)",
           "로텐보덴역 → 리펠제 호수 → 리펠베르크역 (하이킹 — 당일 날씨 보고 결정)",
           "리펠베르크역 → 체르마트 (열차)",
           "스위스 패스 있으면 반값 · 입구 쪽 오른편 창가에 앉아야 마테호른이 잘 보임",
           "점심은 피크닉 — 마트에서 장봐서 도시락"] },
  { id:"hm-1129e", d:"2026-11-29", s:"14:00", cat:"sight", t:"체르마트 마을 산책",
    places:["Hinterdorf Zermatt", "Kirchbrücke Zermatt", "Fuchs Bakery Zermatt"],
    lines:["구시가지 힌터도르프 — 오래된 목조 가옥", "키르히브뤼케 — 전망 포인트",
           "쿱마트 장보기", "Fuchs Bakery & Cafe — 맛있는 빵집"] },
  { id:"hm-1129f", d:"2026-11-29", s:"18:00", cat:"food", meal:"dinner", t:"Restaurant Pinte", tag:"예약완료",
    places:["Restaurant Pinte Zermatt"], lines:["18시 예약완료", "베이컨 & 에그 뢰스티 (25프랑) · 라클렛"] },
  { id:"hm-1129g", d:"2026-11-29", s:"20:00", cat:"etc", t:"수영장 · 루프탑 자쿠지",
    lines:["실내 수영장, 실내 자쿠지, 루프탑 자쿠지 (07:00–22:00)"] },
  { id:"hm-1129h", d:"2026-11-29", cat:"food", meal:"drink", t:"Brown Cow Pub",
    places:["Brown Cow Pub Zermatt"], lines:["맥주"] },
  /* 11.30 체르마트 → 그린델발트 */
  { id:"hm-1130a", d:"2026-11-30", s:"08:00", cat:"food", meal:"breakfast", t:"호텔 조식" },
  { id:"hm-1130b", d:"2026-11-30", s:"09:30", cat:"move", mode:"other", t:"그린델발트로 이동",
    lines:["체크아웃 후 기차역으로", "체르마트 → 비스프(Visp) → 슈피츠(Spiez) → 인터라켄 오스트 → 그린델발트"] },
  /* 12.1 · 12.2 그린델발트 */
  { id:"hm-1201a", d:"2026-12-01", s:"09:00", cat:"sight", t:"융프라우", places:["융프라우요흐"], lines:["VIP 패스 구매"] },
  { id:"hm-1202a", d:"2026-12-02", s:"09:00", cat:"sight", t:"피르스트", places:["피르스트 그린델발트"],
    lines:["플라이어 · 글라이더"] }
];
var SEED_SHOPS = [];
var SEED_FLIGHTS = [];   /* 항공편은 일정(SEED_ITEMS)에 있다 */
/* 예약된 숙소. 묵는 밤으로 적혀 온 것을 체크인–체크아웃으로 옮겨 적었다. */
var SEED_STAYS = [
  { id:"st1", name:"비밀의 안뜰 - 트라스테베레", area:"이탈리아 · 로마",
    detail:"11.23 (월) – 11.27 (금) · 4박" },
  { id:"st2", name:"Hotel Ester", area:"이탈리아 · 피렌체",
    detail:"11.27 (금) – 11.28 (토) · 1박" },
  { id:"st3", name:"알펜리조트", area:"스위스 · 체르마트",
    detail:"11.28 (토) – 11.30 (월) · 2박" },
  { id:"st4", name:"벨베데르", area:"스위스 · 그린델발트",
    detail:"11.30 (월) – 12.3 (목) · 3박" },
  { id:"st5", name:"풀만", area:"프랑스 · 파리",
    detail:"12.3 (목) – 12.5 (토) · 2박" }
];
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
        mode: s.mode || null, title: s.t, emo: s.emo || "", tag: s.tag || null,
        places: (s.places || []).slice(), lines: (s.lines || []).slice(),
        mapUrl: s.map || null, buys: []
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
    /* 아이디가 매번 달라지면 "이미 들어와 있는지"를 알 수 없다. 씨앗은 늘 같다. */
    packList: SEED_PACK.map(function(t, i){ return { id: "pk" + (i + 1), text: t, on: false, ord: i }; })
  });
}

/* 고를 수 있는 분류는 CAT_ORDER다. CAT에는 예전에 쓰던 것(항공 · 자유 · 준비)도
   남아 있다 — 이미 그렇게 저장된 일정이 그대로 보여야 하기 때문이다. */
export var CAT = {
  food:  { label:"식사", color:"var(--c-food)" },
  sight: { label:"관광", color:"var(--c-sight)" },
  shop:  { label:"쇼핑", color:"var(--c-shop)" },
  move:  { label:"이동", color:"var(--c-move)" },
  stay:  { label:"숙소", color:"var(--c-stay)" },
  etc:   { label:"기타", color:"var(--c-etc)" },

  air:   { label:"항공", color:"var(--c-air)" },
  free:  { label:"자유", color:"var(--c-free)" },
  todo:  { label:"준비", color:"var(--c-todo)" }
};
export var CAT_ORDER = ["food","sight","shop","move","stay","etc"];
/* 이동은 무엇으로 가는지까지 적는다. 항공기는 정보 탭의 항공 칸에도 선다. */
export var MODES = [
  { key:"plane", label:"항공기" }, { key:"bus", label:"버스" }, { key:"subway", label:"지하철" },
  { key:"walk", label:"도보" }, { key:"other", label:"기타" }
];
export var MODE_LABEL = { plane:"항공기", bus:"버스", subway:"지하철", walk:"도보", other:"기타" };
/* 항공기로 가는 이동 — 예전 분류 '항공'도 같은 것이다 */
export function isFlight(it){ return it && (it.cat === "air" || (it.cat === "move" && it.mode === "plane")); }
export var MEALS = [
  { key:"all", label:"전체" }, { key:"breakfast", label:"아침" }, { key:"lunch", label:"점심" },
  { key:"dinner", label:"저녁" }, { key:"snack", label:"간식" },
  { key:"drink", label:"술" }, { key:"cafe", label:"카페" }
];
export var MEAL_LABEL = { breakfast:"아침", lunch:"점심", dinner:"저녁", snack:"간식",
                          drink:"술", cafe:"카페" };

/* ---------- time ---------- */
/* Every clock on screen is the one you are travelling by: the times are
   written down as they were given, and the device clock reads them as is. */
export function mins(hhmm){
  if (!hhmm) return null;
  var p = String(hhmm).split(":");
  return (+p[0]) * 60 + (+p[1]);
}
/* 시계는 5분 단위로 돌린다. 1분을 고르게 하면 아무도 고르지 않고, 적어둔 시간도
   10:07처럼 쓸데없이 정확해진다. */
export function hhmm(m){
  m = Math.max(0, Math.min(24 * 60 - 5, Math.round(m)));
  return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
}
export function step5(v){
  var m = mins(v);
  return m === null ? "" : hhmm(Math.round(m / 5) * 5);
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
export function isPinned(t){ return (+t.pin || 0) > 0; }

/* 핀을 꽂은 여행이 꽂은 순서대로 맨 위에, 그 아래로 다가오는 여행이 임박한
   순서대로, 지난 여행은 최근 다녀온 것부터. */
export function tripsForList(){
  var today = todayISO();
  var pinned = [], soon = [], past = [];
  Plan.trips.forEach(function(t){
    if (isPinned(t)) pinned.push(t);
    else if (dayDiff(t.end, today) >= 0) soon.push(t);
    else past.push(t);
  });
  pinned.sort(function(a, b){ return (+a.pin) - (+b.pin) || a.start.localeCompare(b.start); });
  soon.sort(function(a, b){ return a.start.localeCompare(b.start); });
  past.sort(function(a, b){ return b.end.localeCompare(a.end); });
  return pinned.concat(soon, past);
}
export function pinnedTrips(){ return tripsForList().filter(isPinned); }
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
/* "11.23" 같은 날짜를 이 여행의 해에 맞춰 읽는다. 해가 바뀌는 여행이면 다음 해로. */
function mdToIso(text, t){
  var m = /(\d{1,2})\.(\d{1,2})/.exec(text || "");
  if (!m || !t) return "";
  var y = +t.start.slice(0, 4), mo = +m[1], d = +m[2];
  if (mo < +t.start.slice(5, 7)) y++;
  return y + "-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0");
}
function flightToItem(f, t){
  var times = (f.detail || "").match(/\b\d{1,2}:\d{2}\b/g) || [];
  var s = times[0] || null;
  /* 도착이 출발보다 이르면 다음 날 도착이다 (overnight) — 그래도 끝 시각이다 */
  var e = times[1] || null;
  var kind = String(f.label || "").split("·")[0].trim();
  return {
    dayDate: mdToIso(f.label, t) || mdToIso(f.detail, t) || t.start,
    s: s, e: e, cat: "move", mode: "plane", emo: "✈️",
    title: [f.airline, f.no].filter(Boolean).join(" ") || "항공편",
    places: [], lines: [kind, f.detail].filter(Boolean)
  };
}
function shopToItem(sh, t){
  return {
    dayDate: sh.dayDate || t.start, s: sh.time || null, cat: "shop",
    title: sh.name || "쇼핑", places: [sh.map || sh.name].filter(Boolean),
    lines: sh.area ? [sh.area] : [], buys: (sh.items || []).slice()
  };
}

/* 그날 밤 묵는 숙소. 숙소의 '기간 · 메모'에 적힌 두 날짜(체크인 – 체크아웃)를 읽는다.
   체크인한 밤부터 체크아웃 전날 밤까지가 그 숙소다. 못 읽으면 없는 것으로 친다. */
export function stayOn(date){
  var t = trip(), hit = null;
  if (!t) return null;
  (t.stays || []).forEach(function(st){
    if (hit) return;
    var both = String(st.detail || "").match(/\d{1,2}\.\d{1,2}/g) || [];
    if (both.length < 2) return;
    var a = mdToIso(both[0], t), b = mdToIso(both[1], t);
    if (a && b && date >= a && date < b) hit = st;
  });
  return hit;
}

/* 한 분류의 일정 전부, 날짜 순으로. 일정 탭에 적은 것이 그 탭에서도 보이게 하는 데 쓴다. */
export function itemsOfCat(cat){
  var t = trip();
  if (!t) return [];
  return t.items.filter(function(i){ return i.cat === cat; })
    .sort(function(a, b){ return a.dayDate.localeCompare(b.dayDate) || byStart(a, b); });
}
/* 시각이 적힌 가게 — 일정 탭의 시간표에도 함께 선다. */
export function shopsOn(date){
  var t = trip();
  if (!t) return [];
  return t.shops.filter(function(sh){ return sh.dayDate === date && sh.time; });
}
export function itemsOn(date){
  return trip().items.filter(function(i){ return i.dayDate === date; }).sort(byStart);
}
/* The timeline is a clock, so only items with a time belong on it. An item
   without one is a candidate — it lives in 음식, at the top of its day. */
export function timedOn(date){
  return itemsOn(date).filter(function(i){ return !!i.s; });
}
/* 끝이 시작보다 이르면 다음 날 끝난다. 밤을 넘는 비행이 그렇다. */
export function overnight(it){
  return !!(it && it.s && it.e && mins(it.e) < mins(it.s));
}
/* "14:05–19:35", 다음 날 끝나면 "15:05–11:15 +1" */
export function spanOf(it){
  if (!it || !it.s) return "";
  return it.s + (it.e ? "–" + it.e + (overnight(it) ? " +1" : "") : "");
}

export function currentPair(){
  var days = tripDays(), today = todayISO(), di = -1;
  if (!days.length) return null;
  days.forEach(function(d, i){ if (d.date === today) di = i; });
  if (di < 0) return null;
  var list = timedOn(days[di].date), n = nowMins(), cur = null, next = null, from = null, to = null;
  for (var i = 0; i < list.length; i++){
    var s = mins(list[i].s), e = list[i].e ? mins(list[i].e) : null;
    if (e !== null && e < s) e = 24 * 60;          /* 다음 날 끝나는 것은 오늘 내내 */
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
  return { pin: +t.pin || 0, title: t.title || "", emoji: t.emoji || "", city: t.city,
           country: t.country || "", start: t.start, end: t.end };
}

/* 제목과 여행지는 서로를 대신하지 않는다. 이름은 제목이고, 어디로 가는지는
   그 아래에 따로 선다 — 둘 다 적혀 있으면 둘 다 보인다.
   (제목 없이 만들어둔 여행은 여행지가 이름 자리에 서고, 아래에서는 빠진다.) */
export function tripName(t){
  return (t && (t.title || t.city)) || "이름 없는 여행";
}
export function tripPlace(t){
  return t && t.title && t.city ? t.city : "";
}
export function tripLabel(t){
  return (t && t.country) || "";
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
    try{ localStorage.setItem("plan.trip", id); }catch(e){ /* private mode */ }
  },
  lastOpened(){ try{ return localStorage.getItem("plan.trip"); }catch(e){ return null; } },

  path(key){ return ROOT + "/" + this.active + "/" + key; },
  write(path, body){ return Store.write(path, body); },

  listAdd(key, rec){
    var full = Object.assign({ id: uid("x"), ord: Date.now() }, rec);
    this.cur()[key].push(full);
    this.write(this.path(key) + "/" + full.id, bodyOf(full));
    return full;
  },
  /* 고친 것도 되돌릴 수 있다: 고치기 전의 모습을 쥐고 있다가 그대로 다시 쓴다. */
  listEdit(key, id, patch){
    var self = this, c = this.cur(), next = null, was = null;
    var here = this.path(key) + "/" + id;
    c[key] = c[key].map(function(x){
      if (x.id !== id) return x;
      was = JSON.parse(JSON.stringify(x));
      next = Object.assign({}, x, patch);
      return next;
    });
    if (!next) return null;
    this.write(here, bodyOf(next));
    return function(){ self.write(here, bodyOf(was)); };
  },
  /* 지운 것들은 되살릴 수 있게 돌려준다: 부른 쪽이 그 함수를 쥐고 있다가
     "되돌리기"를 누르면 지우기 전 모습 그대로 다시 쓴다. */
  listRemove(key, id){
    var self = this, c = this.cur(), rec = null;
    c[key] = c[key].filter(function(x){
      if (x.id !== id) return true;
      rec = x; return false;
    });
    if (!rec) return null;
    var atts = key === "items" ? (c.attach[id] || []).slice() : [];
    var here = this.path(key), attHere = this.path("attach");
    this.write(here + "/" + id, null);
    atts.forEach(function(a){ self.write(attHere + "/" + a.id, null); });
    if (key === "items") delete c.attach[id];
    return function(){
      self.write(here + "/" + id, bodyOf(rec));
      atts.forEach(function(a){ self.write(attHere + "/" + a.id, Object.assign(bodyOf(a), { itemId: id })); });
    };
  },

  /* 하루 한 줄과 동선도 지운 것은 지운 것이다 — 되살리는 함수를 돌려준다. */
  setDay(date, patch){
    var self = this, t = this.cur();
    var here = this.path("days") + "/" + date;
    var was = { theme: t.dayThemes[date] || "", route: (t.dayRoutes[date] || []).slice() };
    if (patch.theme !== undefined){
      if (patch.theme) t.dayThemes[date] = patch.theme; else delete t.dayThemes[date];
    }
    if (patch.route !== undefined){
      if (patch.route && patch.route.length) t.dayRoutes[date] = patch.route;
      else delete t.dayRoutes[date];
    }
    var theme = t.dayThemes[date] || "", route = t.dayRoutes[date] || [];
    if (!theme && !route.length) this.write(here, null);
    else this.write(here, { theme: theme, route: route });

    return function(){
      /* 저장된 것만 되돌린다. 화면은 다시 읽어 그리므로 그걸로 충분하다. */
      if (!was.theme && !was.route.length) self.write(here, null);
      else self.write(here, { theme: was.theme, route: was.route });
    };
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
    var self = this, t = this.cur(), gone = null;
    t.attach[itemId] = this.attachOf(itemId).filter(function(a){
      if (a.id !== attId) return true;
      gone = a; return false;
    });
    var here = this.path("attach");
    this.write(here + "/" + attId, null);
    if (!gone) return null;
    return function(){ self.write(here + "/" + attId, Object.assign(bodyOf(gone), { itemId: itemId })); };
  },

  addTrip(rec){
    var t = newTrip(rec);
    this.trips.push(t);
    this.write(ROOT + "/" + t.id, metaOf(t));
    return t;
  },
  editTrip(id, rec){
    var self = this, t = this.tripById(id);
    if (!t) return null;
    var was = metaOf(t);
    Object.assign(t, rec);
    this.write(ROOT + "/" + id, metaOf(t));
    return function(){ self.write(ROOT + "/" + id, was); };
  },

  /* 예전 모양의 기록을 지금 모양으로 옮긴다. 항공편과 가게는 따로 적던 것을 이제
     일정 하나로 적는다 — 한 자리에 적어야 탭들이 같은 것을 본다. 옮긴 것은 원래
     자리에서 지운다(두 군데 남기면 어긋난다). 이미 옮긴 것은 다시 만들지 않는다.
     고칠 수 있는 사람이 열었을 때만 돈다. 옮긴 개수를 돌려준다. */
  migrate(){
    var self = this, t = this.cur();
    if (!t) return 0;
    var moved = 0, items = this.path("items"), have = Store.map;
    function adopt(id, it){
      if (!have[items + "/" + id]){
        var full = Object.assign({ id: id, ord: Date.now() + moved }, it);
        t.items.push(full);
        self.write(items + "/" + id, bodyOf(full));
      }
      moved++;
    }
    (t.flights || []).slice().forEach(function(f){
      adopt("fl-" + f.id, flightToItem(f, t));
      self.write(self.path("flights") + "/" + f.id, null);
    });
    t.flights = [];
    (t.shops || []).slice().forEach(function(sh){
      adopt("sh-" + sh.id, shopToItem(sh, t));
      self.write(self.path("shops") + "/" + sh.id, null);
    });
    t.shops = [];
    /* 예전에 옮겨 온 항공편은 다음 날 도착을 끝 시각으로 적지 않았다. 줄에 적힌
       '출발 — 도착'에서 도착을 찾아 채운다 (조용히, 한 번). */
    t.items.forEach(function(it){
      if (!isFlight(it) || !it.s || it.e) return;
      var times = (it.lines || []).join(" ").match(/\b\d{1,2}:\d{2}\b/g) || [];
      if (times.length < 2 || times[0] !== it.s) return;
      it.e = times[1].length === 4 ? "0" + times[1] : times[1];
      self.write(items + "/" + it.id, bodyOf(it));
    });
    return moved;
  },
  /* A pin is a number: nonzero means pinned, and the order among the pinned
     is the order of those numbers. Dragging rewrites them 1, 2, 3… */
  setPins(ids){
    var self = this;
    ids.forEach(function(id, i){
      var t = self.tripById(id);
      if (!t || t.pin === i + 1) return;
      t.pin = i + 1;
      self.write(ROOT + "/" + id, metaOf(t));
    });
  },
  pin(id){
    var t = this.tripById(id);
    if (!t) return;
    var ids = pinnedTrips().map(function(x){ return x.id; });
    if (ids.indexOf(id) < 0) ids.push(id);
    this.setPins(ids);
  },
  unpin(id){
    var t = this.tripById(id);
    if (!t) return;
    t.pin = 0;
    this.write(ROOT + "/" + id, metaOf(t));
    this.setPins(pinnedTrips().filter(function(x){ return x.id !== id; }).map(function(x){ return x.id; }));
  },

  removeTrip(id){
    var self = this, t = this.tripById(id);
    if (!t) return null;
    /* 여행 하나는 문서 수십 개다. 지우기 전의 전부를 그대로 떠둔다. */
    var was = tripToMap(t, {});
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
    return function(){
      Object.keys(was).forEach(function(path){ self.write(path, was[path]); });
    };
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
