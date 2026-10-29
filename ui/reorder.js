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
