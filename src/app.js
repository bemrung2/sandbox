/* 여행 계획 — where the app starts.
 *
 *   src/ui/     the parts any screen uses: sheets, icons, the store, routing
 *   src/plan/   the plan itself: its data, its screens, where you are in it
 *
 * This file owns the address and hands the screen to src/plan/screens.js. */
import { Store } from "./ui/store.js";
import { Theme } from "./ui/theme.js";
import { Router } from "./ui/router.js";
import { paintSignIn } from "./ui/shell.js";
import { toast } from "./ui/dom.js";
import { Plan, currentPair } from "./plan/model.js";
import { state, wire } from "./plan/nav.js";
import { renderTrips, renderTrip } from "./plan/screens.js";

var view = null;
var ticking = false;
var wasOn = "";

/* 목록과 여행 사이를 오갈 때만 한 번 스치듯 밀린다. 탭을 옮기거나 날짜를
   고르는 것까지 움직이면 금세 멀미가 난다. */
function slide(next){
  if (!view || next === wasOn){ wasOn = next; return; }
  var back = wasOn === "trip" && next === "list";
  var first = !wasOn;
  wasOn = next;
  if (first) return;
  view.classList.remove("slide-in", "slide-back");
  void view.offsetWidth;                 /* 같은 쪽으로 또 가도 다시 움직이게 */
  view.classList.add(back ? "slide-back" : "slide-in");
  view.addEventListener("animationend", function off(){
    view.classList.remove("slide-in", "slide-back");
    view.removeEventListener("animationend", off);
  });
}

function paint(keepScroll){
  if (!view) return;
  Plan.reread();
  if (state.screen === "trip" && Plan.cur()){
    slide("trip");
    renderTrip(view, keepScroll);
  } else {
    state.screen = "list";
    slide("list");
    renderTrips(view, keepScroll);
  }
}

/* The 지금 card says how far through the current item you are, so it has to
   move on its own — otherwise it is true only at the moment it was drawn. */
function startTicking(){
  if (ticking) return;
  ticking = true;
  setInterval(function(){
    if (state.screen !== "trip") return;
    if (currentPair()) paint(true);
  }, 60000);
}

/* "/"                      the trips
   "/t/<id>/<tab>/<day>"    one of them, on a tab, on a day (식사 탭은 끝에 끼니) */
function route(path, segs){
  if (Store.needSignIn) return paintSignIn(view);
  Plan.reread();

  if (segs[0] === "t" && segs[1]){
    state.screen = "trip";
    state.tripId = decodeURIComponent(segs[1]);
    state.tab = ["sched", "food", "shop", "info"].indexOf(segs[2]) >= 0 ? segs[2] : "sched";
    state.day = Math.max(0, parseInt(segs[3], 10) || 0);
    state.meal = state.tab === "food" ? (segs[4] || "all") : "all";
    Plan.open(state.tripId);
    if (!Plan.cur()){ state.screen = "list"; Router.set("/"); return; }
    /* 예전엔 항공편과 가게를 일정과 따로 적었다. 고칠 수 있는 사람이 열면 한 번
       일정으로 옮긴다 — 같은 것이 두 군데 적혀 있으면 반드시 어긋난다. */
    if (Store.canEdit() && Plan.migrate()) toast("항공편과 쇼핑을 일정으로 옮겼습니다.");
  } else {
    state.screen = "list";
    if (!Plan.cur()){
      var last = Plan.lastOpened();
      if (last && Plan.tripById(last)) Plan.open(last);
      else if (Plan.trips.length) Plan.open(Plan.trips[0].id);
    }
  }
  paint(false);
}

(async function start(){
  Theme.apply();
  view = document.getElementById("view");
  wire({ go: function(p){ Router.go(p); }, paint: paint });

  /* The waiting state is already on screen — src/app.html carries it, so it
     paints before any module arrives. Nothing to draw here; just ask. */
  await Store.open();
  Store.onChange = function(){
    if (Store.needSignIn) return paintSignIn(view);
    paint(true);
  };

  Router.start(route);
  /* no address to read — pick up where this browser left off */
  if (!location.hash){
    var last = Router.remembered();
    if (last && last !== "/") Router.set(last);
    Router.fire();
  }
  startTicking();
})();
