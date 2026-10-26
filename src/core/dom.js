/* Building blocks every experiment uses. Knows nothing about any of them. */

export function el(html){
  var t = document.createElement("template");
  t.innerHTML = String(html).trim();
  return t.content.firstElementChild;
}

var ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function esc(s){
  return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return ESC[c]; });
}

export function uid(prefix){
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export var ICONS = {
  back: '<polyline points="14 5 7 12 14 19"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  go: '<polyline points="10 5 17 12 10 19"/>',
  check: '<polyline points="5 12.5 10 17 19 7"/>',
  compass: '<circle cx="12" cy="12" r="9"/><polygon points="15.6 8.4 10.4 10.4 8.4 15.6 13.6 13.6" fill="currentColor" stroke="none"/>',
  pin: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
  plane: '<path d="M2 13l20-7-7 20-3-8-8-3z"/>',
  bed: '<path d="M3 18v-8h11a5 5 0 0 1 5 5v3"/><line x1="3" y1="18" x2="21" y2="18"/><circle cx="7.5" cy="12.5" r="1.6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 14"/>',
  x: '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
  edit: '<path d="M14.5 5.5l4 4L7 21H3v-4L14.5 5.5z"/><line x1="13" y1="7" x2="17" y2="11"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><line x1="12" y1="2.5" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="21.5"/><line x1="2.5" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="21.5" y2="12"/><line x1="5.3" y1="5.3" x2="7" y2="7"/><line x1="17" y1="17" x2="18.7" y2="18.7"/><line x1="5.3" y1="18.7" x2="7" y2="17"/><line x1="17" y1="7" x2="18.7" y2="5.3"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
  clip: '<path d="M20 11.5l-8.4 8.4a5 5 0 0 1-7-7l9-9a3.4 3.4 0 0 1 4.8 4.8l-8.9 8.9a1.8 1.8 0 0 1-2.5-2.5l8.1-8.1"/>',
  link: '<path d="M9.5 13.5a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L11 6.3"/><path d="M14.5 10.5a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7L13 17.7"/>',
  note: '<line x1="6" y1="7" x2="18" y2="7"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="6" y1="17" x2="13" y2="17"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.6"/><path d="M21 16l-5-5-5.5 5.5L8 14l-5 5"/>',
  bag: '<path d="M7 8h10l1 12H6L7 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  star: '<polygon points="12 3.6 14.6 9.2 20.6 10 16.2 14.2 17.4 20.2 12 17.3 6.6 20.2 7.8 14.2 3.4 10 9.4 9.2"/>',
  logout: '<path d="M14 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2"/><polyline points="17 9 20 12 17 15"/><line x1="20" y1="12" x2="10" y2="12"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 5.6a3.2 3.2 0 0 1 0 4.8"/><path d="M17.5 14.2A5.5 5.5 0 0 1 20.5 19"/>'
};

export function icon(name, cls){
  return '<svg class="icon' + (cls ? " " + cls : "") + '" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    (ICONS[name] || "") + "</svg>";
}

/* A press spreads from where the finger actually landed, and the action runs
   on click. Acting on pointerdown would re-render under the finger and let the
   trailing click hit whatever replaced it — one tap, two screens. */
export function ripple(node, handler){
  node.classList.add("rip");
  node.addEventListener("pointerdown", function(e){
    if (e.button && e.button !== 0) return;
    var box = node.getBoundingClientRect();
    var size = Math.max(box.width, box.height) * 2.2;
    var ink = document.createElement("span");
    ink.className = "ink";
    ink.style.width = ink.style.height = size + "px";
    ink.style.left = (e.clientX - box.left - size / 2) + "px";
    ink.style.top = (e.clientY - box.top - size / 2) + "px";
    node.appendChild(ink);
    var done = false;
    function off(){
      if (done) return;
      done = true;
      ink.classList.add("out");
      setTimeout(function(){ ink.remove(); }, 320);
    }
    ["pointerup", "pointercancel", "pointerleave"].forEach(function(ev){
      node.addEventListener(ev, off, { once: true });
    });
    setTimeout(off, 1200);
  });
  if (handler) node.addEventListener("click", handler);
  return node;
}

/* kept for nodes that cannot host an ink layer (an <input> overlay, say) */
export function tap(node, handler){
  node.addEventListener("click", handler);
  return node;
}

var toastTimer = null, toastHold = 0;
/* `hold` is for a message that must not be buried by whatever the caller says
   next — a refusal, told after the action that seemed to succeed. */
export function toast(msg, hold){
  var now = Date.now();
  if (!hold && now < toastHold) return;
  toastHold = hold ? now + 2600 : 0;
  var t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ t.classList.remove("show"); }, 2600);
}

/* Only http(s) gets through — a stored "javascript:" would run on tap. */
export function safeUrl(u){
  var s = String(u || "").trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)){
    if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null;
    s = "https://" + s;
  }
  return s;
}

export function hostOf(u){
  try{ return new URL(u).hostname.replace(/^www\./, ""); }catch(e){ return u; }
}
