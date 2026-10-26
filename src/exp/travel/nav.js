/* Where inside this experiment you are. The site's router owns the address;
   this owns the meaning of the part after /travel. */

export var state = { screen: "list", tripId: null, tab: "sched", day: 0, meal: "all" };

var navigate = null, repaintFn = null;

export function wire(o){ navigate = o.go; repaintFn = o.paint; }

export function pathOf(s){
  s = s || state;
  if (s.screen !== "trip" || !s.tripId) return "/travel";
  return "/travel/t/" + encodeURIComponent(s.tripId) + "/" + s.tab + "/" + s.day +
    (s.tab === "food" && s.meal !== "all" ? "/" + s.meal : "");
}

export function go(next){
  Object.assign(state, next);
  navigate(pathOf(state));
}

export function repaint(){ if (repaintFn) repaintFn(true); }
