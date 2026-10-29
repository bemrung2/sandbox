/* Where in the plan you are. The address is the screen, so this is what the
   address means:

     /                          the trips
     /t/<id>/<tab>/<day>        one of them  (식사 탭은 끝에 끼니가 붙는다) */

export var state = { screen: "list", tripId: null, tab: "sched", day: 0, meal: "all" };

var navigate = null, repaintFn = null;

export function wire(o){ navigate = o.go; repaintFn = o.paint; }

export function pathOf(s){
  s = s || state;
  if (s.screen !== "trip" || !s.tripId) return "/";
  return "/t/" + encodeURIComponent(s.tripId) + "/" + s.tab + "/" + s.day +
    (s.tab === "food" && s.meal !== "all" ? "/" + s.meal : "");
}

export function go(next){
  Object.assign(state, next);
  navigate(pathOf(state));
}

export function repaint(){ if (repaintFn) repaintFn(true); }
