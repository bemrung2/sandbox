/* Dragging a row to a new place in its list.
 *
 * Pointer events, not the HTML drag-and-drop API: that one does not exist on
 * a phone. The grip is the handle — the rest of the row stays tappable, and
 * the page only stops scrolling while a drag is actually running.
 *
 *   reorder(grip, row, group, onOrder)
 *     group()   the rows that may trade places, in their current order
 *     onOrder() the new order, once, when the finger lifts and it changed
 *
 * The listeners go on the window, not on the grip: taking the row out of its
 * place and putting it back in puts it through the DOM again, and Chromium
 * drops the pointer capture when that happens. Captured or not, the events
 * still reach the window.
 */
export function reorder(grip, row, group, onOrder){
  grip.addEventListener("pointerdown", function(e){
    if (e.button && e.button !== 0) return;
    e.preventDefault();

    var grab = e.clientY - row.getBoundingClientRect().top;
    var shift = 0;
    var started = group().slice();
    row.classList.add("dragging");
    document.body.classList.add("dragging-row");

    function move(ev){
      if (ev.cancelable) ev.preventDefault();

      /* Glue the row to the finger. Measuring where it actually is each time
         keeps it there even though the list reflows underneath it. */
      var box = row.getBoundingClientRect();
      shift += (ev.clientY - grab) - box.top;
      row.style.transform = "translateY(" + shift + "px)";

      /* Once the row covers half of its neighbour, they trade places — what
         overlaps is the row you are holding, not the finger inside it. */
      var now = row.getBoundingClientRect();
      var rows = group();
      var i = rows.indexOf(row);
      var prev = rows[i - 1], next = rows[i + 1];
      if (prev){
        var p = prev.getBoundingClientRect();
        if (now.top < p.top + p.height / 2){ row.parentNode.insertBefore(row, prev); return; }
      }
      if (next){
        var n = next.getBoundingClientRect();
        if (now.bottom > n.bottom - n.height / 2) row.parentNode.insertBefore(row, next.nextSibling);
      }
    }

    function up(){
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      row.style.transform = "";
      row.classList.remove("dragging");
      document.body.classList.remove("dragging-row");
      var now = group();
      var moved = now.length !== started.length ||
        now.some(function(x, i){ return x !== started[i]; });
      if (moved) onOrder(now);
    }

    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  });
}

/* Holding a row down, then dragging it to a new place.
 *
 * For lists and grids that have no room for a grip: the whole row is the
 * handle, but only after it has been held still for a moment — a finger that
 * moves first is scrolling, and scrolling must keep working.
 *
 *   holdReorder(row, group, onOrder, opts)
 *     group()     the rows that may trade places, in their current order
 *     onOrder()   the new order, once the row has settled, if it changed
 *     opts.can()  asked at the moment the row lifts — false leaves it where it is
 *     opts.axis   "y" for a list (the row only slides up and down); a grid moves both ways
 *     opts.skip   a selector: a press that starts inside it is not a hold (a small button of its own)
 *     opts.zone(x, y, row)  over no other row: may return { box, first } — a container elsewhere the row
 *                 moves into (to its start or end). The rows of group() may live in several containers;
 *                 a row that only changed container still counts as moved.
 *                 Or { into: node } — a target that cannot show the row (a folded container): the row stays
 *                 where it is, and letting go there calls opts.drop(row, node) instead of onOrder.
 *     opts.lift(row) · opts.moved(row) · opts.end(row)   told when it lifts, after each move, before it settles
 *
 * The others slide out of the way (measured before and after each swap), the
 * page follows when the finger nears its top or bottom edge, and the tap that
 * a release would otherwise become is swallowed — letting go must not also
 * open or tick the thing that was just moved.
 */
var HOLD_MS = 350, SLOP = 8, SLIDE_MS = 170, LIFT = 1.03;
var EASE = "cubic-bezier(0.2, 0, 0, 1)";
export function holdReorder(row, group, onOrder, opts){
  opts = opts || {};
  var st = null;
  row.classList.add("holdable");
  /* A long press also asks for the system menu, and a link or a picture for
     the browser's own drag. While a press is ours, neither gets it. */
  row.addEventListener("contextmenu", function(e){ if (st) e.preventDefault(); });
  row.addEventListener("dragstart", function(e){ e.preventDefault(); });
  /* The page must not scroll under a row that is being carried. Scrolling can
     only be refused before it starts, so this listens from the beginning and
     speaks up only while a drag is live. */
  row.addEventListener("touchmove", function(e){ if (st && st.live && e.cancelable) e.preventDefault(); }, { passive: false });

  function listen(on){
    var f = on ? "addEventListener" : "removeEventListener";
    window[f]("pointermove", move, on ? { passive: false } : undefined);
    window[f]("pointerup", up);
    window[f]("pointercancel", up);
  }
  /* glue the row to the finger — measured, so it stays there while the list reflows under it */
  function place(){
    var box = row.getBoundingClientRect();
    var grow = (LIFT - 1) / 2;
    if (opts.axis !== "y"){
      /* a carried tile stops at the edge of the screen — pushed past it, the page would grow sideways */
      var w = box.width / LIFT;
      var want = Math.max(2, Math.min(window.innerWidth - w - 2, st.px - st.gx));
      st.sx += want - (box.left + box.width * grow / LIFT);
    }
    st.sy += (st.py - st.gy) - (box.top + box.height * grow / LIFT);
    row.style.transform = "translate(" + st.sx + "px," + st.sy + "px) scale(" + LIFT + ")";
  }
  /* the others slide to where they now belong, instead of jumping */
  function slide(rows, change){
    var others = rows.filter(function(r){ return r !== row; });
    var was = others.map(function(r){ return r.getBoundingClientRect(); });
    change();
    others.forEach(function(r, k){
      var now = r.getBoundingClientRect();
      var dx = was[k].left - now.left, dy = was[k].top - now.top;
      if (!dx && !dy) return;
      r.style.transition = "none";
      r.style.transform = "translate(" + dx + "px," + dy + "px)";
      r.getBoundingClientRect();
      r.style.transition = "transform " + SLIDE_MS + "ms " + EASE;
      r.style.transform = "";
      clearTimeout(r._slideT);
      r._slideT = setTimeout(function(){ r.style.transition = ""; }, SLIDE_MS + 30);
    });
  }
  /* once the middle of the carried row is over a neighbour, they trade places */
  function trade(){
    if (Date.now() < st.rest) return;
    var rows = group(), i = rows.indexOf(row);
    var me = row.getBoundingClientRect();
    var cx = me.left + me.width / 2, cy = me.top + me.height / 2;
    var target = null;
    for (var k = 0; k < rows.length; k++){
      if (rows[k] === row) continue;
      var q = rows[k].getBoundingClientRect();
      if (cx > q.left && cx < q.right && cy > q.top && cy < q.bottom){ target = rows[k]; break; }
    }
    if (!target){
      /* over no row: perhaps over another container (an empty one, or its heading) */
      var z = opts.zone && opts.zone(cx, cy, row);
      if (z && z.into){
        if (st.into !== z.into){ st.into = z.into; if (opts.moved) opts.moved(row, z.into); }
        return;
      }
      if (st.into){ st.into = null; if (opts.moved) opts.moved(row, null); }
      if (!z || !z.box) return;
      var at = z.first ? z.box.firstChild : null;
      if (row.parentNode === z.box && (z.first ? z.box.firstElementChild === row : z.box.lastElementChild === row)) return;
      slide(rows, function(){ z.box.insertBefore(row, at); });
      st.rest = Date.now() + SLIDE_MS + 30;
      place();
      if (opts.moved) opts.moved(row);
      return;
    }
    st.into = null;
    var j = rows.indexOf(target);
    slide(rows, function(){
      target.parentNode.insertBefore(row, j > i ? target.nextSibling : target);
    });
    if (opts.moved) opts.moved(row);
    /* the neighbour is still sliding out from under the finger — wait for it, or the two swap straight back */
    st.rest = Date.now() + SLIDE_MS + 30;
    place();
  }
  /* near the top or bottom of the screen, the page comes along */
  function edge(){
    if (!st || !st.live) return;
    var h = window.innerHeight, top = 120, bottom = 84, v = 0;
    if (st.py < top) v = -Math.ceil((top - st.py) / 7);
    else if (st.py > h - bottom) v = Math.ceil((st.py - (h - bottom)) / 7);
    if (v){
      var y = window.scrollY;
      window.scrollBy(0, Math.max(-16, Math.min(16, v)));
      if (window.scrollY !== y){ place(); trade(); }
    }
    /* a finger held still can still land somewhere new — a folded container that has just opened under it */
    else if (opts.zone && Date.now() > st.rest){ place(); trade(); }
    st.raf = requestAnimationFrame(edge);
  }
  function lift(){
    if (!st) return;
    if (opts.can && !opts.can()){ listen(false); st = null; return; }
    var box = row.getBoundingClientRect();
    st.live = true;
    st.started = group().slice();
    st.home = row.parentNode;
    st.gx = st.x - box.left; st.gy = st.y - box.top;
    st.sx = 0; st.sy = 0; st.px = st.x; st.py = st.y; st.rest = 0;
    row.classList.add("dragging");
    document.body.classList.add("dragging-row");
    try{ if (navigator.vibrate) navigator.vibrate(12); }catch(e){ /* no buzz, no matter */ }
    if (opts.lift) opts.lift(row);
    place();
    st.raf = requestAnimationFrame(edge);
  }
  function move(ev){
    if (!st || ev.pointerId !== st.id) return;
    if (!st.live){
      /* it moved before it was held: that is a scroll, not a hold */
      if (Math.abs(ev.clientX - st.x) > SLOP || Math.abs(ev.clientY - st.y) > SLOP){
        clearTimeout(st.timer); listen(false); st = null;
      }
      return;
    }
    if (ev.cancelable) ev.preventDefault();
    st.px = ev.clientX; st.py = ev.clientY;
    place();
    trade();
  }
  function up(ev){
    if (!st || (ev && ev.pointerId !== st.id)) return;
    var was = st;
    clearTimeout(was.timer);
    listen(false);
    st = null;
    if (!was.live) return;
    cancelAnimationFrame(was.raf);
    document.body.classList.remove("dragging-row");
    if (opts.end) opts.end(row);
    /* letting go is not a tap */
    function eat(e){ e.stopPropagation(); e.preventDefault(); }
    window.addEventListener("click", eat, true);
    setTimeout(function(){ window.removeEventListener("click", eat, true); }, 350);
    /* it settles into its place rather than snapping there */
    row.style.transition = "transform " + SLIDE_MS + "ms " + EASE;
    row.style.transform = "";
    setTimeout(function(){
      row.style.transition = "";
      row.classList.remove("dragging");
      if (was.into && opts.drop){ opts.drop(row, was.into); return; }
      var now = group();
      var moved = row.parentNode !== was.home || now.length !== was.started.length ||
        now.some(function(x, i){ return x !== was.started[i]; });
      if (moved) onOrder(now);
    }, SLIDE_MS + 20);
  }

  row.addEventListener("pointerdown", function(e){
    if (st || (e.button && e.button !== 0)) return;
    if (opts.skip && e.target.closest && e.target.closest(opts.skip)) return;
    st = { id: e.pointerId, x: e.clientX, y: e.clientY, live: false };
    st.timer = setTimeout(lift, HOLD_MS);
    listen(true);
  });
}
