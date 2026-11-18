/* 옆으로 밀어 앞 · 뒤로 넘기기.
   손가락을 따라 내용이 조금 끌려오고(저항이 있다), 충분히 밀었거나 빠르게 튕겼을 때만 넘어간다.
   · 가로가 세로보다 확실히 클 때(1.7배)만 넘기기로 본다 — 아니면 그냥 위아래로 구르는 손가락이다.
   · 옆으로 구르는 줄 · 적는 칸 · 화면 양 끝(폰의 '뒤로' 몸짓 자리) · 창이 떠 있을 때는 손대지 않는다.
   · 가장자리에 넘어갈 곳의 이름이 작은 알약으로 떠오르고, 넘어갈 만큼 밀면 알약이 켜진다.
   · 앞 · 뒤가 없으면 아주 조금만 늘어났다 돌아온다. */
import { el, esc } from "./dom.js";

var SKIP = ".dayrow, .chiprow, .pickrow, .tabs-roll, .att-photos, .wear-add-row, .perks, .roll, " +
  "input, textarea, select, [contenteditable]";
var EDGE = 22;

function still(){ return window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches; }

/* opts: { prev: {label}|null, next: {label}|null, go(dir) }  dir = -1(앞) | 1(뒤) */
export function swipePager(pane, opts){
  var st = null, pill = null;
  pane.classList.add("swipe-pane");

  function threshold(){ return Math.max(80, Math.min(140, window.innerWidth * 0.24)); }
  function target(dir){ return dir < 0 ? opts.prev : opts.next; }
  function showPill(dir, p, armed){
    var t = target(dir);
    if (!t){ hidePill(); return; }
    if (!pill || pill._dir !== dir){
      hidePill(true);
      pill = el('<div class="swipe-pill ' + (dir < 0 ? "l" : "r") + '" aria-hidden="true">' +
        (dir < 0 ? '<i>‹</i>' : '') + '<span>' + esc(t.label) + '</span>' + (dir > 0 ? '<i>›</i>' : '') + '</div>');
      pill._dir = dir;
      document.body.appendChild(pill);
    }
    pill.style.opacity = String(Math.min(1, p * 1.15));
    pill.style.setProperty("--p", String(Math.min(1, p)));
    if (armed !== pill._armed){
      pill._armed = armed;
      pill.classList.toggle("armed", armed);
      if (armed && navigator.vibrate) try{ navigator.vibrate(8); }catch(e){}
    }
  }
  function hidePill(now){
    if (!pill) return;
    var p = pill; pill = null;
    if (now){ p.remove(); return; }
    p.classList.add("gone");
    setTimeout(function(){ p.remove(); }, 200);
  }
  function follow(dx){
    var dir = dx > 0 ? -1 : 1, has = !!target(dir);
    var k = has ? 0.5 : 0.16;
    pane.style.transition = "none";
    pane.style.transform = "translate3d(" + (dx * k).toFixed(1) + "px,0,0)";
    var th = threshold();
    showPill(dir, Math.abs(dx) / th, has && Math.abs(dx) >= th);
  }
  function settle(){
    pane.style.transition = "transform 260ms cubic-bezier(.2,.8,.2,1)";
    pane.style.transform = "";
    hidePill();
    setTimeout(function(){ pane.style.transition = ""; }, 280);
  }

  pane.addEventListener("touchstart", function(e){
    st = null;
    if (e.touches.length !== 1) return;
    if (document.querySelector("#overlay > *") || document.body.classList.contains("dragging-row")) return;
    var t = e.touches[0];
    if (t.clientX < EDGE || t.clientX > window.innerWidth - EDGE) return;
    if (e.target.closest && e.target.closest(SKIP)) return;
    st = { x: t.clientX, y: t.clientY, mode: 0, dx: 0, v: 0, hist: [[e.timeStamp, t.clientX]] };
  }, { passive: true });

  pane.addEventListener("touchmove", function(e){
    if (!st) return;
    if (e.touches.length !== 1){ if (st.mode === 1) settle(); st = null; return; }
    var t = e.touches[0], dx = t.clientX - st.x, dy = t.clientY - st.y;
    if (st.mode === 0){
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if (Math.abs(dx) > Math.abs(dy) * 1.7) st.mode = 1;
      else { st = null; return; }   /* 위아래로 구르는 손가락 */
    }
    if (e.cancelable) e.preventDefault();
    /* 빠르기는 손을 떼기 전 0.1초 동안 움직인 거리로 잰다 — 마지막 한 토막만 보면 떼는 순간 느려져서 흔들린다 */
    st.hist.push([e.timeStamp, t.clientX]);
    while (st.hist.length > 2 && e.timeStamp - st.hist[0][0] > 100) st.hist.shift();
    var h0 = st.hist[0];
    st.v = (t.clientX - h0[1]) / Math.max(1, e.timeStamp - h0[0]);
    st.dx = dx;
    follow(dx);
  }, { passive: false });

  function end(){
    if (!st) return;
    var s = st; st = null;
    if (s.mode !== 1) return;
    var dir = s.dx > 0 ? -1 : 1, ad = Math.abs(s.dx);
    var flick = Math.abs(s.v) > 0.55 && ad > 48 && (s.v > 0) === (s.dx > 0);
    if (!target(dir) || (ad < threshold() && !flick)){ settle(); return; }
    /* 넘어간다: 내용은 밀던 쪽으로 빠져나가고, 새 것이 반대편에서 들어온다(swipeIn) */
    hidePill();
    if (still()){ opts.go(dir); return; }
    pane.style.transition = "transform 150ms ease-in, opacity 150ms ease-in";
    pane.style.transform = "translate3d(" + (dir > 0 ? -34 : 34) + "%,0,0)";
    pane.style.opacity = "0";
    setTimeout(function(){ opts.go(dir); }, 140);
  }
  pane.addEventListener("touchend", end);
  pane.addEventListener("touchcancel", function(){ if (st && st.mode === 1) settle(); st = null; });
}

/* 넘겨 온 뒤 새 내용이 들어오는 모습 — dir 1이면 오른쪽에서, -1이면 왼쪽에서 */
export function swipeIn(pane, dir){
  if (!dir || still()) return;
  pane.classList.add(dir > 0 ? "swipe-in-r" : "swipe-in-l");
}
