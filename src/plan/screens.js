/* 여행 계획 — every screen of it. */
import { el, esc, icon, ripple, tap, toast, safeUrl, hostOf } from "../ui/dom.js";
import { Store } from "../ui/store.js";
import { themeButton } from "../ui/theme.js";
import {
  sheetShell, openFormSheet, openTextDialog, openConfirmDialog, pickerField, pickGroup,
  showOverlay, closeOverlay
} from "../ui/sheet.js";
import { storePhoto, dropPhoto, thumb } from "../ui/photos.js";
import { reorder } from "../ui/reorder.js";
import { accountFooter } from "../ui/shell.js";
import {
  Plan, CAT, CAT_ORDER, MEALS, MEAL_LABEL, ordered, seedTrip, seedId, tripToMap,
  mins, fmtMD, dowOf, todayISO, dayDiff,
  trip, tripsForList, isPinned, tripDaysOf, tripDays, nightsOf, nightsLabel, tripStatus,
  spanLabel, emoPrefix, itemsOn, timedOn, currentPair
} from "./model.js";
import { state, go, repaint } from "./nav.js";

/* The trip that is already booked, written down from the airline's own
   screen. It is offered until it is actually here, and then never again. */
function bookedWaiting(){
  return !Plan.tripById(seedId());
}

function loadBooked(){
  var t = seedTrip();
  var map = tripToMap(t, {});
  var wrote = true;
  Object.keys(map).forEach(function(path){ if (!Store.write(path, map[path])) wrote = false; });
  if (!wrote) return;
  Plan.trips.push(t);
  Plan.open(t.id);
  toast("예약된 일정을 불러왔어요.");
  go({ screen:"trip", tripId: t.id, tab:"sched", meal:"all", day:0 });
}

/* Nothing here yet. One tap should start a trip, and a second way in for
   someone who would rather look at a finished one first. */
function emptyState(){
  var box = el(
    '<div class="empty">' +
      '<div class="empty-mark">' + icon("compass") + '</div>' +
      '<h2>아직 여행이 없어요</h2>' +
      '<p>날짜만 정하면 일정 · 음식 · 쇼핑 · 정보가 한 세트로 따라옵니다.</p>' +
      '<button class="btn btn-primary" type="button" data-new>' + icon("plus") + '여행 만들기</button>' +
      (bookedWaiting() ? '<button class="btn btn-quiet" type="button" data-booked>' +
        icon("plane") + '예약된 일정 불러오기</button>' : '') +
    '</div>'
  );
  ripple(box.querySelector("[data-new]"), function(){ openTripEditor(null); });
  if (bookedWaiting()) ripple(box.querySelector("[data-booked]"), loadBooked);
  return box;
}

/* 지도 검색은 열어둔 여행의 도시를 함께 넣는다 — 같은 이름의 가게가 다른 나라에도 있다. */
function mapUrl(q){
  var t = trip();
  var city = (t && t.city) || "";
  var query = city && q.indexOf(city) === -1 ? q + " " + city : q;
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(query);
}
function placeHtml(text, place){
  if (!place) return esc(text);
  return '<a class="placelink" href="' + esc(mapUrl(place)) + '" target="_blank" rel="noopener">' + esc(text) +
    '<svg class="pinch" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/></svg></a>';
}

/* ---------- the trips: the first screen there is ---------- */
export function renderTrips(root, keepScroll){
  var wrap = el(
    '<div class="pad">' +
      '<div class="page-head">' +
        '<div class="page-title"><h1>여행 계획</h1></div>' +
      '</div>' +
    '</div>'
  );
  wrap.querySelector(".page-head").appendChild(themeButton());

  var list = tripsForList();
  var box = el('<div class="trip-list"></div>');

  if (!list.length){
    box.appendChild(emptyState());
  } else {
    list.forEach(function(t){ box.appendChild(tripCard(t, box)); });
    var add = el('<button class="addcard trip-add" type="button">' + icon("plus") + '여행 추가</button>');
    ripple(add, function(){ openTripEditor(null); });
    box.appendChild(add);
    if (bookedWaiting()){
      var booked = el('<button class="addcard" type="button">' + icon("plane") + '예약된 일정 불러오기</button>');
      ripple(booked, loadBooked);
      box.appendChild(booked);
    }
  }
  wrap.appendChild(box);
  wrap.appendChild(accountFooter());

  root.innerHTML = "";
  root.appendChild(wrap);
  if (!keepScroll) window.scrollTo(0, 0);
}

/* The pinned cards are the ones that may be dragged, and they are the top of
   the list, so their order is simply their order in the DOM. */
function pinnedRows(box){
  return Array.prototype.filter.call(box.children, function(node){
    return node.classList.contains("pinned");
  });
}

function tripCard(t, box){
  var st = tripStatus(t);
  var days = tripDaysOf(t);
  var packOn = t.packList.filter(function(k){ return k.on; }).length;
  var theme = days.map(function(d){ return d.theme; }).filter(Boolean)[0] || "";

  var pinned = isPinned(t);
  var card = el(
    '<div class="trip-card ' + st.kind + (pinned ? ' pinned' : '') + '">' +
      '<button class="trip-open" type="button">' +
        '<span class="trip-top">' +
          '<span class="trip-flag">' + (t.emoji ? esc(t.emoji) : icon("pin")) + '</span>' +
          '<span class="trip-id">' +
            '<span class="trip-city">' + esc(t.city || "이름 없는 여행") + '</span>' +
            (t.country ? '<span class="trip-country mono">' + esc(t.country) + '</span>' : '') +
          '</span>' +
          '<span class="trip-status ' + st.kind + '">' + esc(st.label) + '</span>' +
        '</span>' +
        '<span class="trip-dates mono">' + esc(t.start.replace(/-/g, ".")) + ' (' + dowOf(t.start) + ')' +
          ' – ' + esc(fmtMD(t.end)) + ' (' + dowOf(t.end) + ')' +
          '<span class="trip-nights">' + esc(nightsOf(t)) + '</span></span>' +
        (theme ? '<span class="trip-theme">' + esc(theme) + '</span>' : '') +
        '<span class="trip-stats">' +
          '<span class="trip-stat"><b class="mono">' + t.items.length + '</b>일정</span>' +
          '<span class="trip-stat"><b class="mono">' + t.shops.length + '</b>쇼핑</span>' +
          '<span class="trip-stat"><b class="mono">' + packOn + '/' + t.packList.length + '</b>준비물</span>' +
        '</span>' +
      '</button>' +
      '<div class="trip-acts"></div>' +
    '</div>'
  );
  ripple(card.querySelector(".trip-open"), function(){
    Plan.open(t.id);
    var p = currentPair();
    go({ screen:"trip", tripId: t.id, tab:"sched", meal:"all", day: p ? p.dayIndex : 0 });
  });

  var acts = card.querySelector(".trip-acts");
  /* Only the pinned ones are hand-ordered — the rest sort themselves by how
     near they are, and dragging one would be undone by the next render. */
  if (pinned){
    var grip = el('<span class="trip-grip" aria-hidden="true">' + icon("grip") + '</span>');
    acts.appendChild(grip);
    reorder(grip, card, function(){ return pinnedRows(box); }, function(rows){
      Plan.setPins(rows.map(function(node){ return node.dataset.trip; }));
      toast("핀 순서를 바꿨어요.");
      repaint();
    });
  }
  var pin = el('<button class="trip-pin' + (pinned ? ' on' : '') + '" type="button" aria-pressed="' +
    pinned + '" aria-label="' + (pinned ? "핀 해제" : "맨 위에 고정") + '">' + icon("tack") + '</button>');
  ripple(pin, function(){
    if (pinned){ Plan.unpin(t.id); toast("핀을 뺐어요."); }
    else { Plan.pin(t.id); toast("맨 위에 고정했어요."); }
    repaint();
  });
  acts.appendChild(pin);

  card.dataset.trip = t.id;
  return card;
}

/* ---------- trip ---------- */
export function renderTrip(root, keepScroll){
  var days = tripDays();
  if (state.day >= days.length) state.day = days.length - 1;

  var frag = document.createDocumentFragment();
  frag.appendChild(renderHero());

  var tabs = el('<div class="tabs" role="tablist"></div>');
  [["sched","일정"],["food","음식"],["shop","쇼핑"],["info","정보"]].forEach(function(t){
    var b = el('<button class="tab" role="tab" type="button" aria-selected="' + (state.tab === t[0]) + '">' + t[1] + '</button>');
    ripple(b, function(){ go({ tab: t[0] }); });
    tabs.appendChild(b);
  });
  frag.appendChild(tabs);

  var body = el('<div class="tabpad"></div>');
  frag.appendChild(body);

  root.innerHTML = "";
  root.appendChild(frag);

  if (state.tab === "sched") renderSchedule(body, days);
  else if (state.tab === "food") renderFood(body, days);
  else if (state.tab === "shop") renderShop(body, days);
  else renderInfo(body);

  if (!keepScroll) window.scrollTo(0, 0);
}

function renderHero(){
  var t = trip();
  var pair = currentPair();
  var d = dayDiff(t.start, todayISO());

  var hero = el(
    '<div class="hero">' +
      '<div class="hero-top">' +
      '<button class="icon-btn hero-back" type="button" aria-label="여행 목록으로">' + icon("back") + '</button>' +
      '<h1 class="hero-city">' + (t.emoji ? '<span class="hero-flag">' + esc(t.emoji) + '</span>' : '') +
      esc(t.city) + '</h1>' +
      '<span class="hero-country mono">' + esc(t.country) + '</span></div>' +
    '</div>'
  );
  hero.querySelector(".hero-top").appendChild(themeButton());
  ripple(hero.querySelector(".hero-back"), function(){ go({ screen:"list" }); });
  var dates = el('<p class="hero-dates mono">' +
    fmtMD(t.start) + ' (' + dowOf(t.start) + ') – ' + fmtMD(t.end) + ' (' + dowOf(t.end) + ') · ' + esc(nightsLabel()) +
    '</p>');
  var pen = el('<button class="quietbtn" type="button" aria-label="여행 정보 수정">' + icon("edit") + '</button>');
  ripple(pen, function(){ openTripEditor(t); });
  dates.appendChild(pen);
  hero.appendChild(dates);

  hero.appendChild(pair ? nowCard(pair) : countCard(t, d));
  return hero;
}

/* Where the day is, right now: what is running, how far through it is, and
   what follows. One accent, a hairline, and numbers that line up. */
function nowCard(pair){
  var cur = pair.current, nx = pair.next;
  var card = el('<div class="pulse"></div>');

  var head = el('<div class="pulse-head"></div>');
  head.appendChild(el('<span class="pulse-live' + (cur ? '' : ' idle') + '"><i></i>' +
    (cur ? '지금' : '여유 시간') + '</span>'));
  if (cur){
    head.appendChild(el('<span class="pulse-clock mono">' +
      esc(cur.s) + (cur.e ? '–' + esc(cur.e) : '') + '</span>'));
  }
  card.appendChild(head);

  if (cur){
    card.appendChild(el('<p class="pulse-title">' + esc(emoPrefix(cur) + cur.title) + '</p>'));
    var span = Math.max(1, pair.to - pair.from);
    var done = Math.min(100, Math.max(0, Math.round((pair.now - pair.from) / span * 100)));
    var bar = el('<div class="pulse-bar"><span></span></div>');
    bar.firstElementChild.style.width = done + "%";
    card.appendChild(bar);
    card.appendChild(el('<p class="pulse-left mono">' + esc(spanLabel(pair.to - pair.now)) + ' 남음</p>'));
  } else {
    card.appendChild(el('<p class="pulse-title muted">' +
      (nx ? '다음 일정까지 비어 있어요' : '오늘 일정은 여기까지') + '</p>'));
  }

  if (nx){
    card.appendChild(el(
      '<div class="pulse-next">' +
        '<span class="pulse-when mono">' + esc(nx.s) + '</span>' +
        '<span class="pulse-name">' + esc(emoPrefix(nx) + nx.title) + '</span>' +
        '<span class="pulse-in mono">' + esc(spanLabel(mins(nx.s) - pair.now)) + ' 뒤</span>' +
      '</div>'
    ));
  }
  return card;
}

function countCard(t, d){
  var label = d > 0 ? "D-" + d : (d === 0 ? "D-DAY" : "다녀온 여행");
  var kicker = d > 0 ? "출발까지" : (d === 0 ? "오늘 출발" : "여행 기록");
  var first = timedOn(t.start)[0];
  var sub = d >= 0 && first
    ? fmtMD(t.start) + " (" + dowOf(t.start) + ") " + first.s + " · " + first.title
    : fmtMD(t.start) + " – " + fmtMD(t.end);
  var card = el(
    '<div class="pulse count' + (d === 0 ? " live" : "") + '">' +
      '<span class="pulse-live' + (d === 0 ? '' : ' idle') + '"><i></i>' + esc(kicker) + '</span>' +
      '<p class="count-big mono">' + esc(label) + '</p>' +
      '<p class="count-sub">' + esc(sub) + '</p>' +
    '</div>'
  );
  return card;
}

/* ---------- tab: schedule ---------- */
function renderSchedule(root, days){
  var pair = currentPair();

  var dayrow = el('<div class="dayrow"></div>');
  days.forEach(function(day, i){
    var isToday = pair && pair.dayIndex === i;
    var b = el('<button class="daybtn' + (isToday ? " today" : "") + '" type="button" aria-pressed="' +
      (state.day === i) + '"><b>' + fmtMD(day.date) + '</b>' + day.dow + (isToday ? " · 오늘" : "") + '</button>');
    ripple(b, function(){ go({ day: i }); });
    dayrow.appendChild(b);
  });
  root.appendChild(dayrow);

  /* A fortnight does not fit on a phone, so the row scrolls. Bring the day you
     are actually on into it — otherwise day 12 looks like an empty row of 1s.
     Only the row moves; the page stays where it is. */
  requestAnimationFrame(function(){
    var on = dayrow.children[state.day];
    if (!on || dayrow.scrollWidth <= dayrow.clientWidth) return;
    dayrow.scrollLeft = on.offsetLeft - (dayrow.clientWidth - on.offsetWidth) / 2;
  });

  var day = days[state.day];
  var list = timedOn(day.date);

  var themeRow = el(
    '<button class="theme-row" type="button">' +
      '<span class="theme-body"><span class="theme-label mono">' + fmtMD(day.date) + ' (' + day.dow + ')</span>' +
      '<span class="theme-text' + (day.theme ? "" : " empty") + '">' +
      esc(day.theme || "이 날의 한 줄 요약 추가") + '</span></span>' + icon("edit") +
    '</button>'
  );
  ripple(themeRow, function(){
    openTextDialog({ title:"이 날의 요약", value: day.theme, placeholder:"예: 하카타 → 나카스 → 텐진" },
      function(v){ Plan.setDay(day.date, { theme: v }); repaint(); },
      day.theme ? function(){ Plan.setDay(day.date, { theme: "" }); repaint(); } : null);
  });
  root.appendChild(themeRow);

  root.appendChild(routeRow(day));

  var attCount = list.reduce(function(n, it){ return n + Plan.attachOf(it.id).length; }, 0);
  root.appendChild(el('<p class="day-stat mono">' + list.length + '개 일정' + (attCount ? ' · 자료 ' + attCount : '') + '</p>'));

  var tl = el('<div class="tl"></div>');
  list.forEach(function(it){ tl.appendChild(timelineItem(it, pair)); });
  var add = el('<div class="tl-add"><div class="tl-time mono">+</div>' +
    '<div class="tl-rail"><span class="tl-dot"></span></div>' +
    '<button class="addrow" type="button">' + icon("plus") + '일정 추가</button></div>');
  ripple(add.querySelector(".addrow"), function(){ openItemEditor(null, day.date); });
  tl.appendChild(add);
  root.appendChild(tl);
}

/* 그날의 동선 한 줄. 칩 하나가 한 곳, 화살표로 이어진다. */
function routeRow(day){
  var stops = day.route || [];
  var row = el('<button class="routerow" type="button" aria-label="이 날의 동선 수정"></button>');
  var label = el('<span class="route-label mono">동선</span>');
  row.appendChild(label);
  if (stops.length){
    var chain = el('<span class="route-chain"></span>');
    /* the arrow travels with the stop before it, so a wrap never starts with → */
    stops.forEach(function(stop, i){
      chain.appendChild(el('<span class="route-seg"><span class="route-stop">' + esc(stop) + '</span>' +
        (i < stops.length - 1 ? '<span class="route-arrow" aria-hidden="true">→</span>' : '') + '</span>'));
    });
    row.appendChild(chain);
  } else {
    row.appendChild(el('<span class="route-chain empty">이 날의 동선 적어두기</span>'));
  }
  row.appendChild(el(icon("edit", "route-pen")));
  ripple(row, function(){
    openTextDialog({
      title: fmtMD(day.date) + " 동선",
      value: stops.join("\n"),
      placeholder: "한 줄에 한 곳",
      multiline: true
    }, function(v){
      var next = v.split(/[\n→>,]/).map(function(x){ return x.trim(); }).filter(Boolean);
      Plan.setDay(day.date, { route: next });
      repaint();
    }, stops.length ? function(){ Plan.setDay(day.date, { route: [] }); repaint(); } : null);
  });
  return row;
}

function timelineItem(it, pair){
  var cat = CAT[it.cat] || CAT.todo;
  var isCurrent = pair && pair.current && pair.current.id === it.id;
  var places = it.places || [];
  var titleHtml = places.length === 1 ? placeHtml(it.title, places[0]) : esc(it.title);

  var row = el(
    '<div class="tl-item' + (isCurrent ? " current" : "") + '">' +
      '<div class="tl-time mono">' + esc(it.s) + (it.e ? '<small>' + esc(it.e) + '</small>' : '') + '</div>' +
      '<div class="tl-rail"><span class="tl-dot"' +
        (isCurrent ? '' : ' style="border-color:' + cat.color + '"') + '></span></div>' +
      '<div class="tl-body"><p class="tl-title">' +
        (it.emo ? '<span class="emo">' + esc(it.emo) + '</span>' : '') + titleHtml + '</p></div>' +
    '</div>'
  );
  var body = row.querySelector(".tl-body");
  (it.lines || []).forEach(function(l){ body.appendChild(el('<p class="tl-line">' + esc(l) + '</p>')); });

  var atts = Plan.attachOf(it.id);
  if (atts.length) body.appendChild(attachStrip(it.id, atts));

  var meta = el('<div class="tl-meta"></div>');
  if (isCurrent) meta.appendChild(el('<span class="badge live">지금</span>'));
  meta.appendChild(el('<span class="badge cat" style="color:' + cat.color + '">' + cat.label + '</span>'));
  if (it.meal) meta.appendChild(el('<span class="badge">' + esc(MEAL_LABEL[it.meal]) + '</span>'));
  if (it.tag) meta.appendChild(el('<span class="badge tag">' + esc(it.tag) + '</span>'));
  if (places.length > 1){
    places.forEach(function(p){
      meta.appendChild(el('<a class="maplink" href="' + esc(mapUrl(p)) + '" target="_blank" rel="noopener">' +
        icon("pin") + esc(shortPlace(p)) + '</a>'));
    });
  }

  var actions = el('<span class="tl-actions"></span>');
  var clip = el('<button class="quietbtn' + (atts.length ? " has" : "") + '" type="button" aria-label="자료">' +
    icon("clip") + (atts.length ? atts.length : "") + '</button>');
  ripple(clip, function(){ openAttachSheet(it); });
  actions.appendChild(clip);
  var edit = el('<button class="quietbtn" type="button">' + icon("edit") + '수정</button>');
  ripple(edit, function(){ openItemEditor(it, null); });
  actions.appendChild(edit);
  meta.appendChild(actions);

  body.appendChild(meta);
  return row;
}
function shortPlace(p){
  var city = trip().city;
  return p.replace(new RegExp("\\s*" + city + "$"), "").replace(/\s*(텐진|하카타)$/, "");
}

function attachStrip(itemId, atts){
  var box = el('<div class="att"></div>');
  var photos = atts.filter(function(a){ return a.type === "photo"; });
  if (photos.length){
    var strip = el('<div class="att-photos"></div>');
    photos.forEach(function(a){ strip.appendChild(thumb(a.pid)); });
    box.appendChild(strip);
  }
  atts.forEach(function(a){
    if (a.type === "link"){
      var u = safeUrl(a.url);
      if (!u) return;
      box.appendChild(el('<a class="att-link" href="' + esc(u) + '" target="_blank" rel="noopener">' +
        icon("link") + '<span>' + esc(a.title || hostOf(u)) + '</span></a>'));
    } else if (a.type === "note"){
      box.appendChild(el('<p class="att-note">' + esc(a.text) + '</p>'));
    }
  });
  return box;
}

/* ---------- tab: food ---------- */
function renderFood(root, days){
  var all = [];
  days.forEach(function(day, i){
    itemsOn(day.date).forEach(function(it){ if (it.meal) all.push({ item: it, day: day, dayIndex: i }); });
  });

  var chips = el('<div class="chiprow"></div>');
  MEALS.forEach(function(m){
    var n = m.key === "all" ? all.length : all.filter(function(f){ return f.item.meal === m.key; }).length;
    if (n === 0 && m.key !== "all") return;
    var b = el('<button class="chip" type="button" aria-pressed="' + (state.meal === m.key) + '">' +
      m.label + ' <span class="mono">' + n + '</span></button>');
    ripple(b, function(){ go({ meal: m.key }); });
    chips.appendChild(b);
  });
  root.appendChild(chips);

  var list = state.meal === "all" ? all : all.filter(function(f){ return f.item.meal === state.meal; });
  var lastDay = -1;
  list.forEach(function(f){
    if (f.dayIndex !== lastDay){
      lastDay = f.dayIndex;
      var n = list.filter(function(x){ return x.dayIndex === f.dayIndex; }).length;
      root.appendChild(el('<div class="group-label"><h3>' + fmtMD(f.day.date) + ' (' + f.day.dow + ')</h3>' +
        '<span class="group-count mono">' + n + '</span></div>'));
    }
    root.appendChild(foodCard(f));
  });
  if (!list.length) root.appendChild(el('<div class="card dashed"><p class="card-kind">해당하는 식사가 없어요.</p></div>'));

  var addDate = days[state.day] ? days[state.day].date : days[0].date;
  var add = el('<button class="addcard" type="button">' + icon("plus") + '음식 추가</button>');
  ripple(add, function(){
    openItemEditor(null, addDate, { cat:"food", meal: state.meal === "all" ? "lunch" : state.meal });
  });
  root.appendChild(add);
}

function foodCard(f){
  var it = f.item;
  var places = it.places || [];
  var card = el('<div class="card"></div>');
  card.appendChild(el('<p class="card-when mono' + (it.s ? '' : ' undated') + '">' +
    (it.s ? esc(it.s) + (it.e ? '–' + esc(it.e) : '') : '시간 미정') + ' · ' +
    esc(MEAL_LABEL[it.meal] || "") + '</p>'));
  card.appendChild(el('<div class="card-top"><p class="card-name">' +
    (it.emo ? '<span class="emo">' + esc(it.emo) + '</span>' : '') +
    (places.length === 1 ? placeHtml(it.title, places[0]) : esc(it.title)) + '</p></div>'));
  (it.lines || []).forEach(function(l){ card.appendChild(el('<p class="card-kind">' + esc(l) + '</p>')); });

  var atts = Plan.attachOf(it.id);
  if (atts.length) card.appendChild(attachStrip(it.id, atts));

  var meta = el('<div class="card-meta"></div>');
  if (it.tag) meta.appendChild(el('<span class="badge tag">' + esc(it.tag) + '</span>'));
  if (places.length > 1){
    places.forEach(function(p){
      meta.appendChild(el('<a class="maplink" href="' + esc(mapUrl(p)) + '" target="_blank" rel="noopener">' +
        icon("pin") + esc(shortPlace(p)) + '</a>'));
    });
  }
  var actions = el('<span class="tl-actions"></span>');
  var clip = el('<button class="quietbtn' + (atts.length ? " has" : "") + '" type="button" aria-label="자료">' +
    icon("clip") + (atts.length ? atts.length : "") + '</button>');
  ripple(clip, function(){ openAttachSheet(it); });
  actions.appendChild(clip);
  var edit = el('<button class="quietbtn" type="button">' + icon("edit") + '수정</button>');
  ripple(edit, function(){ openItemEditor(it, null); });
  actions.appendChild(edit);
  meta.appendChild(actions);
  card.appendChild(meta);
  return card;
}

/* ---------- tab: shopping ---------- */
function renderShop(root, days){
  var shops = trip().shops.slice().sort(function(a, b){
    return a.dayDate === b.dayDate ? (mins(a.time) || 0) - (mins(b.time) || 0) : a.dayDate.localeCompare(b.dayDate);
  });
  var total = 0, got = 0;
  shops.forEach(function(s){ s.items.forEach(function(i){ total++; if (i.got) got++; }); });

  root.appendChild(el('<div class="group-label"><h3>쇼핑 목록</h3>' +
    '<span class="group-count mono">' + shops.length + '곳 · 살 것 ' + got + '/' + total + '</span></div>'));

  var lastDay = "";
  shops.forEach(function(s){
    if (s.dayDate !== lastDay){
      lastDay = s.dayDate;
      var n = shops.filter(function(x){ return x.dayDate === s.dayDate; }).length;
      root.appendChild(el('<div class="group-label"><h3>' + fmtMD(s.dayDate) + ' (' + dowOf(s.dayDate) + ')</h3>' +
        '<span class="group-count mono">' + n + '곳</span></div>'));
    }
    root.appendChild(shopCard(s));
  });

  var add = el('<button class="addcard" type="button">' + icon("plus") + '가게 추가</button>');
  ripple(add, function(){ openShopEditor(null, days[state.day] ? days[state.day].date : days[0].date); });
  root.appendChild(add);
}

function shopCard(s){
  var card = el('<div class="card"></div>');
  var head = el('<div class="card-head"><h3>' + esc(s.time) + ' · ' + esc(s.area) + '</h3></div>');
  var ed = el('<button class="quietbtn" type="button">' + icon("edit") + '수정</button>');
  ripple(ed, function(){ openShopEditor(s); });
  head.appendChild(ed);
  card.appendChild(head);
  card.appendChild(el('<div class="card-top"><p class="card-name">' + placeHtml(s.name, s.map || s.name) + '</p></div>'));

  s.items.forEach(function(i){
    var row = el('<div class="rowline' + (i.got ? " on" : "") + '"></div>');
    var cb = el('<button class="check" type="button" aria-pressed="' + i.got + '" aria-label="샀음 표시">' + icon("check") + '</button>');
    ripple(cb, function(){
      i.got = !i.got;
      Plan.listEdit("shops", s.id, { items: s.items });
      repaint();
    });
    row.appendChild(cb);
    var btn = el('<button class="rowbtn" type="button"><span class="rowbody"><b>' + esc(i.text) + '</b></span>' +
      icon("edit", "rowpen") + '</button>');
    ripple(btn, function(){
      openTextDialog({ title:"살 것 수정", value:i.text },
        function(v){ i.text = v; Plan.listEdit("shops", s.id, { items: s.items }); repaint(); },
        function(){
          s.items = s.items.filter(function(x){ return x.id !== i.id; });
          Plan.listEdit("shops", s.id, { items: s.items });
          repaint();
        });
    });
    row.appendChild(btn);
    card.appendChild(row);
  });

  var addBtn = el('<button class="quietbtn" type="button" style="margin-top:10px">' + icon("plus") + '살 것 적어두기</button>');
  ripple(addBtn, function(){
    openTextDialog({ title:"살 것 추가", placeholder:"예: 티셔츠" }, function(v){
      s.items.push({ id: uid("i"), text: v, got: false });
      Plan.listEdit("shops", s.id, { items: s.items });
      repaint();
    });
  });
  card.appendChild(addBtn);
  return card;
}

/* ---------- tab: info ---------- */
function renderInfo(root){
  root.appendChild(sectionCard({
    title: "항공", key: "flights", ic: "plane",
    empty: "항공편을 추가해두세요.",
    render: function(f){
      return '<span class="lbl mono">' + esc(f.label || "") + '</span>' +
        '<b><span class="airline-name">' + esc(f.airline || "") + '</span>' +
        (f.no ? '<span class="flightno">' + esc(f.no) + '</span>' : '') + '</b>' +
        (f.detail ? '<small>' + esc(f.detail) + '</small>' : '');
    },
    fields: [
      { key:"label", label:"구분", placeholder:"예: 가는 편 · 9.12 (토)" },
      { key:"airline", label:"항공사", placeholder:"예: 제주항공", required:true },
      { key:"no", label:"편명", placeholder:"예: 7C1471" },
      { key:"detail", label:"시간", placeholder:"예: 11:10 한국 출발 — 12:40 후쿠오카 도착" }
    ]
  }));

  root.appendChild(sectionCard({
    title: "숙소", key: "stays", ic: "bed",
    empty: "숙소를 추가해두세요.",
    render: function(h){
      return (h.area ? '<span class="lbl mono">' + esc(h.area) + '</span>' : '') +
        '<b>' + placeHtml(h.name, h.name) + '</b>' +
        (h.detail ? '<small>' + esc(h.detail) + '</small>' : '');
    },
    fields: [
      { key:"name", label:"이름", placeholder:"예: 더 로얄 파크 캔버스 후쿠오카 나카스", required:true },
      { key:"area", label:"지역", placeholder:"예: 나카스" },
      { key:"detail", label:"메모", placeholder:"예: 체크인 15:00 · 체크아웃 11:00" }
    ]
  }));

  root.appendChild(sectionCard({
    title: "예약", key: "books", ic: "star",
    empty: "확정된 예약을 적어두세요.",
    render: function(k){
      return (k.when ? '<span class="lbl mono">' + esc(k.when) + '</span>' : '') +
        '<b>' + placeHtml(k.name, k.name) + '</b>' +
        (k.detail ? '<small>' + esc(k.detail) + '</small>' : '');
    },
    fields: [
      { key:"name", label:"이름", placeholder:"예: 야키니쿠 카쿠라 니시나카스점", required:true },
      { key:"when", label:"일시", placeholder:"예: 9.13 (일) 17:15 · 2명" },
      { key:"detail", label:"메모", placeholder:"예: 16:30 니시나카스 방향 이동" }
    ]
  }));

  root.appendChild(sectionCard({
    title: "유용한 정보", key: "links", ic: "link",
    empty: "링크를 모아두면 여행 중에 바로 꺼내볼 수 있어요.",
    linkMode: true,
    render: function(l){
      var u = safeUrl(l.url);
      return '<b>' + esc(l.title) + '</b><small>' + esc(u ? hostOf(u) : "잘못된 주소") + '</small>';
    },
    fields: [
      { key:"title", label:"제목", placeholder:"예: 공항버스 타는 법", required:true },
      { key:"url", label:"링크", placeholder:"https://...", required:true, url:true }
    ]
  }));

  root.appendChild(packCard());
  root.appendChild(sectionCard({
    title: "메모", key: "notes", ic: "note",
    empty: "아직 메모가 없어요.",
    simple: true,
    render: function(n){ return '<b>' + esc(n.text) + '</b>'; },
    fields: [{ key:"text", label:"메모", placeholder:"기억해둘 것", required:true, area:true }]
  }));
  root.appendChild(dangerCard());
}

/* The last card in 정보: the one action with nothing after it. */
function dangerCard(){
  var t = trip();
  var card = el(
    '<div class="card danger">' +
      '<div class="card-head"><h3>여행 삭제</h3></div>' +
      '<p class="card-empty">일정 · 음식 · 쇼핑 · 정보에 적어둔 것이 모두 사라집니다. ' +
        '되돌릴 수 없고, 함께 보는 사람들의 화면에서도 없어집니다.</p>' +
      '<button class="btn btn-danger" type="button">' + icon("trash") + '이 여행 삭제하기</button>' +
    '</div>'
  );
  ripple(card.querySelector(".btn-danger"), function(){
    if (!Store.canEdit()){ Store.refuse("편집 권한이 없어요. 계획 주인에게 요청해주세요."); return; }
    openConfirmDialog({
      title: "정말 삭제하시겠습니까?",
      body: "'" + (t.city || "이름 없는 여행") + "' 여행과 그 안의 모든 기록이 사라집니다. " +
            "되돌릴 수 없습니다.",
      label: "확인을 위해 아래 칸에 '삭제하기'를 적어주세요",
      phrase: "삭제하기",
      okLabel: "삭제하기"
    }, function(){
      Plan.removeTrip(t.id);
      toast("'" + (t.city || "여행") + "'을 삭제했어요.");
      go({ screen:"list", tripId: null });
    });
  });
  return card;
}

/* One card shape for every editable list in 정보. */
function sectionCard(o){
  var list = ordered(trip()[o.key]);
  var card = el('<div class="card"></div>');
  var head = el('<div class="card-head"><h3>' + esc(o.title) + (list.length ? ' · ' + list.length : '') + '</h3></div>');
  var add = el('<button class="quietbtn" type="button">' + icon("plus") + '추가</button>');
  ripple(add, function(){
    openFormSheet({ title: o.title + " 추가", fields: o.fields }, null, function(v){
      Plan.listAdd(o.key, v); repaint();
    });
  });
  head.appendChild(add);
  card.appendChild(head);

  if (!list.length){
    card.appendChild(el('<p class="card-empty">' + esc(o.empty) + '</p>'));
    return card;
  }

  list.forEach(function(rec){
    var row = el('<div class="rowline"></div>');
    var inner = '<span class="rowbody">' + o.render(rec) + '</span>' + icon("edit", "rowpen");
    if (o.linkMode){
      var u = safeUrl(rec.url);
      var a = el('<a class="rowbtn" href="' + esc(u || "#") + '" target="_blank" rel="noopener">' +
        icon("link") + '<span class="rowbody">' + o.render(rec) + '</span></a>');
      row.appendChild(a);
      var pen = el('<button class="quietbtn" type="button" aria-label="수정">' + icon("edit") + '</button>');
      ripple(pen, function(){ editRec(o, rec); });
      row.appendChild(pen);
    } else {
      var btn = el('<button class="rowbtn" type="button">' +
        (o.simple ? "" : icon(o.ic)) + inner + '</button>');
      ripple(btn, function(){ editRec(o, rec); });
      row.appendChild(btn);
    }
    card.appendChild(row);
  });
  return card;
}
function editRec(o, rec){
  openFormSheet({ title: o.title + " 수정", fields: o.fields }, rec,
    function(v){ Plan.listEdit(o.key, rec.id, v); repaint(); },
    function(){ Plan.listRemove(o.key, rec.id); repaint(); });
}

function packCard(){
  var list = ordered(trip().packList);
  var done = list.filter(function(p){ return p.on; }).length;
  var card = el('<div class="card"></div>');
  var head = el('<div class="card-head"><h3>준비물 · ' + done + '/' + list.length + '</h3></div>');
  var add = el('<button class="quietbtn" type="button">' + icon("plus") + '추가</button>');
  ripple(add, function(){
    openTextDialog({ title:"준비물 추가", placeholder:"예: 멀티탭" }, function(v){
      Plan.listAdd("packList", { text: v, on: false });
      repaint();
    });
  });
  head.appendChild(add);
  card.appendChild(head);

  list.forEach(function(p){
    var row = el('<div class="rowline' + (p.on ? " on" : "") + '"></div>');
    var cb = el('<button class="check" type="button" aria-pressed="' + p.on + '" aria-label="챙김 표시">' + icon("check") + '</button>');
    ripple(cb, function(){ Plan.listEdit("packList", p.id, { on: !p.on }); repaint(); });
    row.appendChild(cb);
    var btn = el('<button class="rowbtn" type="button"><span class="rowbody"><b>' + esc(p.text) + '</b></span>' +
      icon("edit", "rowpen") + '</button>');
    ripple(btn, function(){
      openTextDialog({ title:"준비물 수정", value:p.text },
        function(v){ Plan.listEdit("packList", p.id, { text: v }); repaint(); },
        function(){ Plan.listRemove("packList", p.id); repaint(); });
    });
    row.appendChild(btn);
    card.appendChild(row);
  });
  return card;
}

export function openTripEditor(t){
  var adding = !t;
  var sheet = sheetShell(adding ? "여행 추가" : "여행 정보");
  var body = sheet.querySelector(".sheet-body");
  var flagRow = el('<div class="fld"><div class="fld-row"></div></div>');
  var inner = flagRow.querySelector(".fld-row");
  inner.appendChild(el('<div class="fld-col flag-col"><label for="t-emoji">아이콘</label>' +
    '<input id="t-emoji" type="text" maxlength="4" placeholder="🇯🇵" value="' + esc(t ? t.emoji : "") + '"></div>'));
  inner.appendChild(el('<div class="fld-col"><label for="t-city">도시</label>' +
    '<input id="t-city" type="text" placeholder="예: 후쿠오카" value="' + esc(t ? t.city : "") + '"></div>'));
  body.appendChild(flagRow);
  body.appendChild(el(
    '<div class="fld"><label for="t-country">라벨</label><input id="t-country" type="text" value="' +
    esc(t ? t.country : "") + '" placeholder="예: JAPAN"></div>'
  ));
  var dateRow = el('<div class="fld"><div class="fld-row"></div></div>');
  var dr = dateRow.querySelector(".fld-row");
  dr.appendChild(pickerField({ type:"date", id:"t-start", label:"시작일", value: t ? t.start : "", col:true }));
  dr.appendChild(pickerField({ type:"date", id:"t-end", label:"종료일", value: t ? t.end : "", col:true }));
  body.appendChild(dateRow);
  body.appendChild(el('<p class="fld-hint">날짜를 줄이면 그 날에 있던 일정은 화면에서 빠집니다. 다시 늘리면 돌아옵니다.</p>'));

  var foot = sheet.querySelector(".sheet-foot");
  /* 삭제는 여기 없다 — 정보 탭 맨 아래, 한 번 더 묻는 곳에 있다. */
  var save = el('<button class="btn btn-primary" type="button">저장</button>');
  ripple(save, function(){
    var city = sheet.querySelector("#t-city").value.trim();
    var start = sheet.querySelector("#t-start").value;
    var end = sheet.querySelector("#t-end").value;
    if (!city){ toast("도시를 적어주세요."); return; }
    if (!start || !end){ toast("날짜를 골라주세요."); return; }
    if (end < start){ toast("종료일이 시작일보다 빠릅니다."); return; }
    var rec = {
      emoji: sheet.querySelector("#t-emoji").value.trim(),
      city: city,
      country: sheet.querySelector("#t-country").value.trim(),
      start: start, end: end
    };
    closeOverlay();
    if (adding){
      var made = Plan.addTrip(rec);
      Plan.open(made.id);
      toast("여행을 만들었어요.");
      go({ screen:"trip", tripId: made.id, tab:"sched", meal:"all", day:0 });
      return;
    }
    Plan.editTrip(t.id, rec);
    state.day = 0;
    toast("수정했어요.");
    repaint();
  });
  foot.appendChild(save);
  showOverlay(sheet);
}

export function openShopEditor(shop, defaultDate){
  var days = tripDays();
  var cur = { dayDate: shop ? shop.dayDate : defaultDate };
  var sheet = sheetShell(shop ? "가게 수정" : "가게 추가");
  var body = sheet.querySelector(".sheet-body");

  body.appendChild(el('<div class="fld"><label for="sh-name">이름</label>' +
    '<input id="sh-name" type="text" placeholder="예: 빔스" value="' + esc(shop ? shop.name : "") + '"></div>'));
  body.appendChild(el('<div class="fld"><label>날짜</label><div class="pickrow" id="sh-day"></div></div>'));
  var shRow = el('<div class="fld"><div class="fld-row"></div></div>');
  var shInner = shRow.querySelector(".fld-row");
  shInner.appendChild(pickerField({ type:"time", id:"sh-time", label:"시간", value: shop ? shop.time : "", col:true }));
  shInner.appendChild(el('<div class="fld-col"><label for="sh-area">지역</label>' +
    '<input id="sh-area" type="text" placeholder="예: 텐진" value="' + esc(shop ? shop.area : "") + '"></div>'));
  body.appendChild(shRow);
  body.appendChild(el('<div class="fld"><label for="sh-map">지도 검색어</label>' +
    '<input id="sh-map" type="text" placeholder="비우면 이름으로 검색" value="' + esc(shop && shop.map ? shop.map : "") + '"></div>'));

  pickGroup(sheet.querySelector("#sh-day"),
    days.map(function(d){ return { key:d.date, label: fmtMD(d.date) + " (" + d.dow + ")" }; }),
    function(){ return cur.dayDate; }, function(v){ cur.dayDate = v; });

  var foot = sheet.querySelector(".sheet-foot");
  if (shop){
    var del = el('<button class="btn btn-danger" type="button">삭제</button>');
    ripple(del, function(){
      Plan.listRemove("shops", shop.id);
      closeOverlay(); toast("삭제했어요."); repaint();
    });
    foot.appendChild(del);
  }
  var save = el('<button class="btn btn-primary" type="button">저장</button>');
  ripple(save, function(){
    var name = sheet.querySelector("#sh-name").value.trim();
    if (!name){ toast("이름을 적어주세요."); return; }
    var rec = {
      name: name, dayDate: cur.dayDate,
      time: sheet.querySelector("#sh-time").value || "",
      area: sheet.querySelector("#sh-area").value.trim(),
      map: sheet.querySelector("#sh-map").value.trim() || name
    };
    if (shop) Plan.listEdit("shops", shop.id, rec);
    else Plan.listAdd("shops", Object.assign(rec, { items: [] }));
    closeOverlay(); toast(shop ? "수정했어요." : "추가했어요."); repaint();
  });
  foot.appendChild(save);
  showOverlay(sheet);
}

/* A date or time field whose box never moves: the value is painted as text
   and the native input sits invisible over it. */

/* ---------- item editor ---------- */
function openItemEditor(item, defaultDate, presets){
  var days = tripDays();
  var cur = {
    dayDate: item ? item.dayDate : defaultDate,
    cat: item ? item.cat : ((presets && presets.cat) || "food"),
    meal: item ? (item.meal || "") : ((presets && presets.meal) || "")
  };
  var sheet = sheetShell(item ? "일정 수정" : "일정 추가");
  var body = sheet.querySelector(".sheet-body");

  var nameRow = el('<div class="fld"><div class="fld-row"></div></div>');
  var nameInner = nameRow.querySelector(".fld-row");
  nameInner.appendChild(el('<div class="fld-col flag-col"><label for="ed-emo">아이콘</label>' +
    '<input id="ed-emo" type="text" maxlength="4" placeholder="없음" value="' +
    esc(item && item.emo ? item.emo : "") + '"></div>'));
  nameInner.appendChild(el('<div class="fld-col"><label for="ed-title">이름</label>' +
    '<input id="ed-title" type="text" placeholder="예: 나카스 야타이" value="' + esc(item ? item.title : "") + '"></div>'));
  body.appendChild(nameRow);
  body.appendChild(el('<div class="fld"><label>날짜</label><div class="pickrow" id="ed-day"></div></div>'));
  var timeRow = el('<div class="fld"><div class="fld-row"></div></div>');
  var row = timeRow.querySelector(".fld-row");
  row.appendChild(pickerField({ type:"time", id:"ed-s", label:"시작", value: item ? item.s : "", col:true }));
  row.appendChild(pickerField({ type:"time", id:"ed-e", label:"종료", value: item && item.e ? item.e : "", col:true }));
  body.appendChild(timeRow);
  body.appendChild(el('<div class="fld"><label>분류</label><div class="pickrow" id="ed-cat"></div></div>'));
  body.appendChild(el('<div class="fld"><label>음식 종류</label><div class="pickrow" id="ed-meal"></div>' +
    '<p class="fld-hint">고르면 음식 탭에도 함께 표시됩니다. 음식은 시작 시간을 비워둘 수 있고, ' +
    '그러면 음식 탭 맨 위에 시간 미정으로 모입니다.</p></div>'));
  body.appendChild(el('<div class="fld"><label for="ed-tag">배지</label>' +
    '<input id="ed-tag" type="text" placeholder="예: 예약 17:15 · 2명" value="' + esc(item && item.tag ? item.tag : "") + '">' +
    '<p class="fld-hint">짧게 강조할 한마디. 비워두면 표시되지 않습니다.</p></div>'));
  body.appendChild(el('<div class="fld"><label for="ed-places">장소</label>' +
    '<textarea id="ed-places" placeholder="한 줄에 하나씩">' + esc(item ? (item.places || []).join("\n") : "") + '</textarea>' +
    '<p class="fld-hint">한 곳이면 이름을 눌러 지도로, 여러 곳이면 장소 칩이 생깁니다.</p></div>'));
  body.appendChild(el('<div class="fld"><label for="ed-lines">메모</label>' +
    '<textarea id="ed-lines" placeholder="한 줄에 하나씩">' + esc(item ? (item.lines || []).join("\n") : "") + '</textarea></div>'));

  pickGroup(sheet.querySelector("#ed-day"),
    days.map(function(d){ return { key:d.date, label: fmtMD(d.date) + " (" + d.dow + ")" }; }),
    function(){ return cur.dayDate; }, function(v){ cur.dayDate = v; });
  pickGroup(sheet.querySelector("#ed-cat"),
    CAT_ORDER.map(function(k){ return { key:k, label: CAT[k].label }; }),
    function(){ return cur.cat; }, function(v){ cur.cat = v; });
  pickGroup(sheet.querySelector("#ed-meal"),
    [{ key:"", label:"없음" }].concat(Object.keys(MEAL_LABEL).map(function(k){ return { key:k, label:MEAL_LABEL[k] }; })),
    function(){ return cur.meal; }, function(v){ cur.meal = v; });

  var foot = sheet.querySelector(".sheet-foot");
  if (item){
    var del = el('<button class="btn btn-danger" type="button">삭제</button>');
    ripple(del, function(){
      Plan.listRemove("items", item.id);
      closeOverlay(); toast("삭제했어요."); repaint();
    });
    foot.appendChild(del);
  }
  var save = el('<button class="btn btn-primary" type="button">저장</button>');
  ripple(save, function(){
    var titleEl = sheet.querySelector("#ed-title"), sEl = sheet.querySelector("#ed-s");
    var title = titleEl.value.trim();
    if (!title){ titleEl.focus(); toast("이름을 적어주세요."); return; }
    /* An item with no time is off the timeline, so it needs 음식 종류 to
       have somewhere to live — otherwise saving would hide it everywhere. */
    if (!sEl.value && !cur.meal){
      sEl.focus();
      toast("시간을 비우려면 음식 종류를 골라주세요.");
      return;
    }
    var lines = function(id){
      return sheet.querySelector(id).value.split("\n").map(function(x){ return x.trim(); }).filter(Boolean);
    };
    var rec = {
      dayDate: cur.dayDate, s: sEl.value || null, e: sheet.querySelector("#ed-e").value || null,
      cat: cur.cat, meal: cur.meal || null, title: title,
      tag: sheet.querySelector("#ed-tag").value.trim() || null,
      places: lines("#ed-places"), lines: lines("#ed-lines"),
      emo: sheet.querySelector("#ed-emo").value.trim()
    };
    if (item) Plan.listEdit("items", item.id, rec);
    else Plan.listAdd("items", rec);
    closeOverlay();
    toast(item ? "수정했어요." : "추가했어요.");
    if (!item){
      var di = tripDays().findIndex(function(d){ return d.date === rec.dayDate; });
      if (di >= 0) state.day = di;
    }
    repaint();
  });
  foot.appendChild(save);
  overlay.appendChild(sheet);
  if (!item) setTimeout(function(){ sheet.querySelector("#ed-title").focus(); }, 60);
}

/* ---------- attachments sheet ---------- */
function openAttachSheet(item){
  var sheet = sheetShell("자료", item.s + " " + item.title);
  var body = sheet.querySelector(".sheet-body");
  sheet.querySelector(".sheet-foot").remove();

  var picker = el('<div class="attpick">' +
    '<button type="button" data-k="note" aria-pressed="true">' + icon("note") + '메모</button>' +
    '<button type="button" data-k="link" aria-pressed="false">' + icon("link") + '링크</button>' +
    '<button type="button" data-k="photo" aria-pressed="false">' + icon("image") + '사진</button></div>');
  var form = el('<div></div>');
  var listBox = el('<div class="attlist"></div>');
  body.appendChild(picker); body.appendChild(form); body.appendChild(listBox);

  var kind = "note";
  picker.querySelectorAll("button").forEach(function(b){
    ripple(b, function(){
      kind = b.getAttribute("data-k");
      picker.querySelectorAll("button").forEach(function(x){
        x.setAttribute("aria-pressed", String(x.getAttribute("data-k") === kind));
      });
      paintForm();
    });
  });

  function paintForm(){
    form.innerHTML = "";
    if (kind === "note"){
      var f = el('<div><div class="fld"><textarea id="a-note" placeholder="예: 2층 버스 정류장, 줄이 길면 택시"></textarea></div>' +
        '<button class="btn btn-primary" type="button" style="width:100%">메모 추가</button></div>');
      ripple(f.querySelector("button"), function(){
        var v = f.querySelector("#a-note").value.trim();
        if (!v) return;
        Plan.addAttach(item.id, { type:"note", text:v });
        f.querySelector("#a-note").value = "";
        paintList(); repaint(); toast("메모를 넣었어요.");
      });
      form.appendChild(f);
    } else if (kind === "link"){
      var g = el('<div><div class="fld"><label for="a-lt">제목</label><input id="a-lt" type="text" placeholder="예: 공항버스 후기"></div>' +
        '<div class="fld"><label for="a-lu">링크</label><input id="a-lu" type="text" inputmode="url" placeholder="https://..."></div>' +
        '<button class="btn btn-primary" type="button" style="width:100%">링크 추가</button></div>');
      ripple(g.querySelector("button"), function(){
        var t = g.querySelector("#a-lt").value.trim();
        var u = safeUrl(g.querySelector("#a-lu").value);
        if (!u){ g.querySelector("#a-lu").focus(); toast("http로 시작하는 주소를 넣어주세요."); return; }
        Plan.addAttach(item.id, { type:"link", title: t || hostOf(u), url: u });
        g.querySelector("#a-lt").value = ""; g.querySelector("#a-lu").value = "";
        paintList(); repaint(); toast("링크를 넣었어요.");
      });
      form.appendChild(g);
    } else {
      var h = el('<div><label class="btn btn-primary" style="width:100%">' + icon("image") + '사진 고르기' +
        '<input type="file" accept="image/*" hidden></label>' +
        '<p class="fld-hint">사진은 크기를 줄여서 저장됩니다.</p></div>');
      var fileInput = h.querySelector("input");
      fileInput.addEventListener("change", async function(){
        var file = fileInput.files[0];
        if (!file) return;
        var label = h.querySelector("label");
        label.textContent = "저장 중...";
        try{
          var pid = await storePhoto(file);
          Plan.addAttach(item.id, { type:"photo", pid: pid });
          paintList(); repaint(); toast("사진을 넣었어요.");
        }catch(e){ toast("사진을 저장하지 못했어요."); }
        label.innerHTML = icon("image") + "사진 고르기";
        label.appendChild(fileInput);
        fileInput.value = "";
      });
      form.appendChild(h);
    }
  }

  function paintList(){
    listBox.innerHTML = "";
    var atts = Plan.attachOf(item.id);
    if (!atts.length){
      listBox.appendChild(el('<p class="card-empty" style="padding:12px 0">아직 넣은 자료가 없어요.</p>'));
      return;
    }
    atts.forEach(function(a){
      var row = el('<div class="attlist-row"></div>');
      if (a.type === "photo"){
        row.appendChild(thumb(a.pid));
        row.appendChild(el('<div class="attlist-body"><b>사진</b></div>'));
      } else if (a.type === "link"){
        row.appendChild(el('<div class="attlist-body"><b>' + esc(a.title) + '</b><small>' + esc(hostOf(a.url)) + '</small></div>'));
      } else {
        row.appendChild(el('<div class="attlist-body"><p>' + esc(a.text) + '</p></div>'));
      }
      var del = el('<button class="quietbtn" type="button" aria-label="삭제">' + icon("x") + '</button>');
      ripple(del, function(){
        if (a.type === "photo") dropPhoto(a.pid);
        Plan.removeAttach(item.id, a.id);
        paintList(); repaint();
      });
      row.appendChild(del);
      listBox.appendChild(row);
    });
  }

  paintForm(); paintList();
  overlay.appendChild(sheet);
}
