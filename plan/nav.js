/* Where in the plan you are. The address is the screen, so this is what the
   address means:

     /                          the trips
     /t/<id>/<tab>/<day>        one of them

   음식 탭은 끝에 끼니가, 지도 탭은 끝에 보고 있는 범위가 붙는다. */

export var state = { screen: "list", tripId: null, tab: "sched", day: 0, meal: "all", span: "all" };

var navigate = null, repaintFn = null;

export function wire(o){ navigate = o.go; repaintFn = o.paint; }

export function pathOf(s){
  s = s || state;
  if (s.screen !== "trip" || !s.tripId) return "/";
  var tail = "";
  if (s.tab === "food" && s.meal !== "all") tail = "/" + s.meal;
  if (s.tab === "map" && s.span !== "all") tail = "/" + s.span;
  return "/t/" + encodeURIComponent(s.tripId) + "/" + s.tab + "/" + s.day + tail;
}

export function go(next){
  Object.assign(state, next);
  navigate(pathOf(state));
}

export function repaint(){ if (repaintFn) repaintFn(true); }
