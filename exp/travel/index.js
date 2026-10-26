/* 여행 계획 — EXP 01.
 *
 * The site knows this experiment only through what is exported here. Delete
 * this folder and the one line in src/app.js that names it, and nothing else
 * has to change. */
import { Plan, tripsSorted, tripStatus, todayISO, dayDiff } from "./model.js";
import { state, wire, pathOf, go } from "./nav.js";
import { renderTrips, renderTrip, onLeave } from "./screens.js";
import { currentPair } from "./model.js";

var host = null;
var ticking = false;

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

function paint(keepScroll){
  if (!host) return;
  Plan.reread();
  if (state.screen === "trip" && Plan.cur()) renderTrip(host, keepScroll);
  else {
    if (state.screen !== "list") state.screen = "list";
    renderTrips(host, keepScroll);
  }
}

export default {
  id: "travel",
  index: "EXP 01",
  name: "여행 계획",
  icon: "compass",
  css: "exp/travel/travel.css",

  /* one line for the hub card */
  summary(){
    Plan.reread();
    var trips = tripsSorted();
    if (!trips.length) return "첫 여행을 만들어보세요";
    var next = null;
    trips.forEach(function(t){ if (!next && dayDiff(t.end, todayISO()) >= 0) next = t; });
    return "여행 " + trips.length + "개" +
      (next ? " · 다음 " + next.city + " " + tripStatus(next).label : " · 지난 여행만");
  },

  /* the site hands over the screen and the part of the address after /travel */
  mount(root, segs, ctx){
    host = root;
    wire({ go: ctx.go, paint: paint });
    onLeave(ctx.home);

    Plan.reread();
    if (segs[0] === "t" && segs[1]){
      state.screen = "trip";
      state.tripId = decodeURIComponent(segs[1]);
      state.tab = ["sched", "food", "shop", "info"].indexOf(segs[2]) >= 0 ? segs[2] : "sched";
      state.day = Math.max(0, parseInt(segs[3], 10) || 0);
      state.meal = segs[4] || "all";
      Plan.open(state.tripId);
      if (!Plan.cur()){ state.screen = "list"; ctx.replace("/travel"); }
    } else {
      state.screen = "list";
      if (!Plan.cur()){
        var last = Plan.lastOpened();
        if (last && Plan.tripById(last)) Plan.open(last);
        else if (Plan.trips.length) Plan.open(Plan.trips[0].id);
      }
    }
    paint(false);
    startTicking();
  },

  /* a change arrived from somewhere else */
  refresh(){ paint(true); }
};
