/* 글에 모양을 주는 작은 편집기 — 굵게 · 밑줄 · 취소선 · 체크 줄 · 글씨 크기 · 글씨 색.

   저장하는 것은 **걸러 낸 HTML**이다. 허락한 것만 남긴다:
     줄      <div>…</div>            체크 줄  <div class="mk" data-on="0|1">…</div>
     머리표 줄  <div class="bl" data-b="dash|dot">…</div>   (– 또는 ·)
     글자    <b> <u> <s>             크기 · 색  <span class="ms-l mc-red">
   그 밖의 태그 · 속성 · 스타일은 전부 버린다. 화면에 낼 때도 저장된 것을 믿지 않고 같은 체로 다시 거른다 —
   다른 사람이 적은 글이 내 화면에서 스크립트가 되면 안 된다.

   편집기 안에서는 브라우저의 execCommand가 만드는 <font size · color>를 그대로 두고(글자를 치는 도중에
   노드를 바꾸면 커서가 달아난다) CSS가 같은 모양으로 그린다. 저장할 때 체가 span으로 바꾼다. */
import { el, esc, icon, ripple } from "./dom.js";

/* 색은 토큰이다 — hex는 execCommand에 건네는 표식일 뿐, 화면의 색은 CSS(토큰)가 정한다. */
export var RICH_COLORS = [
  { key:"ink",    hex:"#000001", label:"기본" },
  { key:"red",    hex:"#d92d20", label:"빨강" },
  { key:"orange", hex:"#c2670a", label:"주황" },
  { key:"green",  hex:"#1e8a57", label:"초록" },
  { key:"blue",   hex:"#1f5fd6", label:"파랑" },
  { key:"purple", hex:"#6b54b5", label:"보라" }
];
/* 크기 넷. n은 execCommand("fontSize")에 건네는 수(1–7)다. */
export var RICH_SIZES = [
  { key:"s",  n:"2", label:"작게" },
  { key:"m",  n:"3", label:"보통" },
  { key:"l",  n:"5", label:"크게" },
  { key:"xl", n:"6", label:"제목" }
];
var COLOR_OF = {}, SIZE_OF = {};
RICH_COLORS.forEach(function(c){ COLOR_OF[c.hex] = c.key; });
RICH_SIZES.forEach(function(s){ SIZE_OF[s.n] = s.key; });
var COLOR_KEYS = RICH_COLORS.map(function(c){ return c.key; });
var SIZE_KEYS = RICH_SIZES.map(function(s){ return s.key; });

var BLOCK = /^(DIV|P|LI|UL|OL|H[1-6]|BLOCKQUOTE|PRE|TABLE|TBODY|TR|TD|TH|SECTION|ARTICLE|HEADER|FOOTER)$/;
var SKIP = /^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|SVG|MATH|TEMPLATE|NOSCRIPT|HEAD|META|LINK|TITLE)$/;

function hexOf(v){
  v = String(v || "").trim().toLowerCase();
  var m = v.match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) v = "#" + [m[1], m[2], m[3]].map(function(n){ return ("0" + (+n).toString(16)).slice(-2); }).join("");
  return v;
}
/* 이 요소가 글자에 주는 모양 — 허락한 것만 */
function wrapsOf(node){
  var tag = node.nodeName, out = [];
  if (tag === "B" || tag === "STRONG") out.push(["<b>", "</b>"]);
  else if (tag === "U") out.push(["<u>", "</u>"]);
  else if (tag === "S" || tag === "STRIKE" || tag === "DEL") out.push(["<s>", "</s>"]);
  var cls = [];
  if (tag === "FONT"){
    var ck = COLOR_OF[hexOf(node.getAttribute("color"))], sk = SIZE_OF[node.getAttribute("size")];
    if (sk) cls.push("ms-" + sk);
    if (ck) cls.push("mc-" + ck);
  } else if (tag === "SPAN"){
    String(node.getAttribute("class") || "").split(/\s+/).forEach(function(c){
      if (/^ms-/.test(c) && SIZE_KEYS.indexOf(c.slice(3)) >= 0) cls.push(c);
      if (/^mc-/.test(c) && COLOR_KEYS.indexOf(c.slice(3)) >= 0) cls.push(c);
    });
  }
  if (cls.length) out.push(['<span class="' + cls.join(" ") + '">', "</span>"]);
  return out;
}

/* DOM → 걸러 낸 HTML. 줄 단위로 평평하게 편다(겹친 블록 · 붙여 넣은 표도 줄이 된다). */
export function cleanRich(root){
  /* mk: 줄의 종류 — null(보통) · "0"/"1"(체크 줄) · "dash"/"dot"(머리표 줄) */
  var lines = [], cur = "", mk = null, stack = [], pushed = 0;
  function open(){ return stack.map(function(w){ return w[0]; }).join(""); }
  function close(){ return stack.slice().reverse().map(function(w){ return w[1]; }).join(""); }
  function push(){
    lines.push({ mk: mk, html: cur ? cur + close() : "" });
    cur = ""; pushed++;
  }
  function text(t){
    if (!t) return;
    if (!cur) cur = open();
    cur += esc(t);
  }
  function walk(node){
    for (var c = node.firstChild; c; c = c.nextSibling){
      if (c.nodeType === 3){ text(c.nodeValue.replace(/ /g, " ").replace(/[\r\n]+/g, " ")); continue; }
      if (c.nodeType !== 1 || SKIP.test(c.nodeName)) continue;
      if (c.nodeName === "BR"){ push(); continue; }
      if (BLOCK.test(c.nodeName)){
        if (cur) push();
        var before = pushed, wasMk = mk;
        if (c.classList && c.classList.contains("mk")) mk = c.getAttribute("data-on") === "1" ? "1" : "0";
        else if (c.classList && c.classList.contains("bl")) mk = c.getAttribute("data-b") === "dot" ? "dot" : "dash";
        walk(c);
        if (cur || pushed === before) push();
        mk = wasMk;
        continue;
      }
      var ws = wrapsOf(c);
      if (cur && ws.length) cur += ws.map(function(w){ return w[0]; }).join("");
      ws.forEach(function(w){ stack.push(w); });
      walk(c);
      ws.forEach(function(){ var w = stack.pop(); if (cur) cur += w[1]; });
    }
  }
  walk(root);
  if (cur) push();
  /* 빈 꼬리표(<b></b>)는 지우고, 끝의 빈 줄은 버린다 */
  lines.forEach(function(l){
    var prev;
    do { prev = l.html; l.html = l.html.replace(/<(b|u|s|span)(?: class="[^"]*")?><\/\1>/g, ""); } while (l.html !== prev);
  });
  while (lines.length && !lines[lines.length - 1].html && lines[lines.length - 1].mk === null) lines.pop();
  if (!lines.some(function(l){ return l.html.replace(/<[^>]+>/g, "").trim(); })) return "";
  return lines.map(function(l){
    var open = l.mk === null ? "<div>" :
      (l.mk === "dash" || l.mk === "dot") ? '<div class="bl" data-b="' + l.mk + '">' : '<div class="mk" data-on="' + l.mk + '">';
    return open + (l.html || "<br>") + "</div>";
  }).join("");
}

/* 저장된 HTML 글자 → 다시 걸러 낸 HTML. template 안에서 읽으므로 그 사이에 아무것도 실행되지 않는다. */
export function safeRich(html){
  var t = document.createElement("template");
  t.innerHTML = String(html || "");
  return cleanRich(t.content);
}
/* 모양 없는 글 → 줄마다 한 줄 */
export function richFromText(text){
  var rows = String(text || "").replace(/\r/g, "").split("\n");
  while (rows.length && !rows[rows.length - 1].trim()) rows.pop();
  return rows.map(function(r){ return "<div>" + (esc(r) || "<br>") + "</div>"; }).join("");
}
/* 걸러 낸 HTML → 글자만 (첫 줄을 이름으로 쓸 때) */
export function richText(html){
  var t = document.createElement("template");
  t.innerHTML = String(html || "").replace(/<\/div>/g, "\n</div>");
  return (t.content.textContent || "").replace(/\n+$/, "");
}

/* ---------- 편집기 ---------- */
function topBlock(ed, node){
  while (node && node.parentNode !== ed) node = node.parentNode;
  return node && node.nodeType === 1 ? node : null;
}
/* 맨 바깥에 맨글자로 놓인 것(첫 줄이 그렇게 생긴다)을 줄(div)로 감싼다 — 줄에 표시를 달려면 줄이 있어야 한다 */
function blockify(ed){
  var run = null, moved = false;
  Array.prototype.slice.call(ed.childNodes).forEach(function(n){
    var isBlock = n.nodeType === 1 && BLOCK.test(n.nodeName);
    if (isBlock){ run = null; return; }
    moved = true;
    if (n.nodeType === 1 && n.nodeName === "BR"){
      if (!run){ var e = document.createElement("div"); ed.insertBefore(e, n); e.appendChild(n); }
      else ed.removeChild(n);
      run = null; return;
    }
    if (!run){ run = document.createElement("div"); ed.insertBefore(run, n); }
    run.appendChild(n);
  });
  if (!ed.firstChild){ var d = document.createElement("div"); d.appendChild(document.createElement("br")); ed.appendChild(d); moved = true; }
  return moved;   /* 옮긴 것이 있었나 — 없었으면 커서를 건드릴 까닭이 없다 */
}

export function richEditor(opts){
  opts = opts || {};
  var wrap = el(
    '<div class="rich-wrap">' +
      '<div class="rich-bar" role="toolbar" aria-label="글 모양">' +
        '<div class="rich-tools">' +
          '<button type="button" class="rich-btn" data-cmd="bold" aria-label="굵게" aria-pressed="false"><b>가</b></button>' +
          '<button type="button" class="rich-btn" data-cmd="underline" aria-label="밑줄" aria-pressed="false"><u>가</u></button>' +
          '<button type="button" class="rich-btn" data-cmd="strikeThrough" aria-label="취소선" aria-pressed="false"><s>가</s></button>' +
          '<button type="button" class="rich-btn" data-check aria-label="체크박스" aria-pressed="false">' + icon("check") + '</button>' +
          '<button type="button" class="rich-btn rich-bl" data-list="dash" aria-label="줄 앞에 –" aria-pressed="false"><i>–</i></button>' +
          '<button type="button" class="rich-btn rich-bl" data-list="dot" aria-label="줄 앞에 가운데점" aria-pressed="false"><i>•</i></button>' +
        '</div>' +
        '<div class="rich-tools rich-sizes">' +
          RICH_SIZES.map(function(s){
            return '<button type="button" class="rich-btn rich-size sz-' + s.key + '" data-size="' + s.n + '" aria-label="글씨 ' + s.label + '">가</button>';
          }).join("") +
        '</div>' +
        '<div class="rich-colors">' +
          RICH_COLORS.map(function(c){
            return '<button type="button" class="rich-dot mc-' + c.key + '" data-color="' + c.hex + '" aria-label="글씨 색 ' + c.label + '"><i></i></button>';
          }).join("") +
        '</div>' +
      '</div>' +
      '<div class="rich rich-ed" contenteditable="true" role="textbox" aria-multiline="true" aria-label="' + esc(opts.label || "메모") +
        '" data-ph="' + esc(opts.placeholder || "") + '"></div>' +
    '</div>'
  );
  var ed = wrap.querySelector(".rich-ed");
  ed.innerHTML = safeRich(opts.html || "");

  function changed(){ ed.dispatchEvent(new Event("input", { bubbles: true })); }
  function emptyMark(){
    ed.classList.toggle("is-empty", !(ed.textContent || "").trim() && !ed.querySelector(".mk, .bl"));
  }
  function inEd(){
    var sel = window.getSelection();
    return sel && sel.rangeCount && ed.contains(sel.anchorNode) ? sel : null;
  }
  function states(){
    var sel = inEd();
    wrap.querySelectorAll("[data-cmd]").forEach(function(b){
      var on = false;
      try{ on = !!sel && document.queryCommandState(b.dataset.cmd); }catch(e){}
      b.setAttribute("aria-pressed", String(on));
    });
    var blk = sel ? topBlock(ed, sel.anchorNode) : null;
    wrap.querySelector("[data-check]").setAttribute("aria-pressed", String(!!(blk && blk.classList.contains("mk"))));
    wrap.querySelectorAll("[data-list]").forEach(function(b){
      b.setAttribute("aria-pressed", String(!!(blk && blk.classList.contains("bl") && blk.getAttribute("data-b") === b.dataset.list)));
    });
  }
  /* 고른 곳이 편집기 밖으로 나가 있으면(단추를 누르다 초점을 잃는 폰이 있다) 마지막으로 있던 자리를 되살린다 */
  var saved = null;
  function ensureSel(){
    var sel = inEd();
    if (sel) return sel;
    ed.focus();
    sel = window.getSelection();
    if (saved && ed.contains(saved.startContainer) && ed.contains(saved.endContainer)){
      sel.removeAllRanges(); sel.addRange(saved);
    } else if (!sel.rangeCount || !ed.contains(sel.anchorNode)){
      var r0 = document.createRange(); r0.selectNodeContents(ed); r0.collapse(false);
      sel.removeAllRanges(); sel.addRange(r0);
    }
    return sel;
  }
  /* 맨글자로 놓인 줄을 줄(div)로 감싸되, 커서와 고른 곳은 그대로 둔다.
     노드를 옮기면 브라우저가 그 안에 있던 커서를 바깥으로 내보내므로, 옮기기 전에 자리를 적어 두었다가 되돌려 놓는다. */
  function tidy(){
    var sel = window.getSelection();
    var r = sel.rangeCount && ed.contains(sel.anchorNode) ? sel.getRangeAt(0) : null;
    function pin(c, o){
      if (c !== ed) return [c, o];
      var ch = ed.childNodes[o];
      if (ch) return [ch, 0];
      ch = ed.lastChild;
      return ch ? [ch, ch.nodeType === 3 ? ch.nodeValue.length : ch.childNodes.length] : [null, 0];
    }
    var a = r ? pin(r.startContainer, r.startOffset) : null, z = r ? pin(r.endContainer, r.endOffset) : null;
    /* 옮긴 것이 없으면 커서도 그대로 둔다 — 다시 놓으면 '이제부터 쓸 글의 모양'(크기를 누르고 색을 누른 것)이 지워진다 */
    if (!blockify(ed) || !r) return;
    try{
      var nr = document.createRange();
      if (a[0] && ed.contains(a[0])) nr.setStart(a[0], a[1]); else { nr.selectNodeContents(ed.firstChild); nr.collapse(true); }
      if (z[0] && ed.contains(z[0])) nr.setEnd(z[0], z[1]);
      sel.removeAllRanges(); sel.addRange(nr);
    }catch(e){}
  }
  /* 커서가 있는 줄(맨 바깥 블록). */
  function lineAt(){
    tidy();
    var sel = window.getSelection(), n = sel.anchorNode;
    if (!n || !ed.contains(n)) return null;
    if (n === ed){
      var c = ed.childNodes[Math.min(sel.anchorOffset, ed.childNodes.length - 1)];
      return c && c.nodeType === 1 ? c : null;
    }
    var b = topBlock(ed, n);
    return b && BLOCK.test(b.nodeName) ? b : null;
  }
  function caretTo(node, offset, fallback){
    var sel = window.getSelection(), r = document.createRange();
    try{
      if (!node || !ed.contains(node)) throw 0;
      r.setStart(node, Math.min(offset, node.nodeType === 3 ? node.nodeValue.length : node.childNodes.length));
    }catch(e){ r.selectNodeContents(fallback || ed); r.collapse(false); }
    r.collapse(true);
    sel.removeAllRanges(); sel.addRange(r);
  }
  /* 글자 모양(굵게 · 밑줄 · 취소선 · 크기 · 색)을 준다.
     · 글을 골라 두었으면 고른 곳에.
     · 고른 것 없이 커서만 있으면 **그 줄에 이미 쓴 글 전체에** 주고, 커서는 제자리에 둔다 — 이어서 쓰는 글도 같은 모양이 된다.
       (빈 줄이면 이제부터 쓰는 글의 모양만 정해진다.) 이미 쓴 글과 앞으로 쓸 글, 둘 다 된다. */
  function exec(cmd, val){
    var sel = ensureSel();
    try{
      document.execCommand("styleWithCSS", false, false);
      var blk = sel.isCollapsed ? lineAt() : null;
      if (blk && (blk.textContent || "").length){
        /* 커서의 자리는 '줄의 몇 번째 글자'로 기억한다 — 모양을 주면 브라우저가 글자 노드를 새로 만들어서 노드로는 못 찾는다 */
        sel = window.getSelection();
        var before = document.createRange();
        before.selectNodeContents(blk);
        try{ before.setEnd(sel.anchorNode, sel.anchorOffset); }catch(e){}
        var at = before.toString().length;
        var all = document.createRange(); all.selectNodeContents(blk);
        sel.removeAllRanges(); sel.addRange(all);
        document.execCommand(cmd, false, val);
        var w = document.createTreeWalker(blk, NodeFilter.SHOW_TEXT), t, left = at, hit = null;
        while ((t = w.nextNode())){
          if (left <= t.nodeValue.length){ hit = t; break; }
          left -= t.nodeValue.length;
        }
        caretTo(hit, left, blk);
      } else {
        document.execCommand(cmd, false, val);
      }
    }catch(e){}
    changed(); states();
  }
  /* 줄의 종류를 벗긴다 → 보통 줄 */
  function plain(b){
    b.classList.remove("mk", "bl"); b.removeAttribute("data-on"); b.removeAttribute("data-b");
    if (!b.getAttribute("class")) b.removeAttribute("class");
  }
  function isKind(b, kind){
    return kind === "check" ? b.classList.contains("mk") : (b.classList.contains("bl") && b.getAttribute("data-b") === kind);
  }
  /* 지금 줄(고른 줄들)을 그 종류로 — 체크 줄("check") · 머리표 줄("dash" · "dot"). 이미 모두 그 종류면 보통 줄로 되돌린다.
     한 줄은 한 가지 종류다(체크 줄이면서 머리표 줄일 수는 없다). */
  function toggleLine(kind){
    var sel = ensureSel(), blocks;
    if (sel.isCollapsed){
      /* 커서만 있으면 그 줄 — 아직 아무것도 안 쓴 빈 줄 · 빈 편집기여도 된다(먼저 켜고 쓰는 경우) */
      var b0 = lineAt();
      blocks = b0 ? [b0] : [];
      if (b0 && !b0.contains(window.getSelection().anchorNode)) caretTo(null, 0, b0);
    } else {
      tidy();
      var range = window.getSelection().getRangeAt(0);
      blocks = Array.prototype.filter.call(ed.children, function(b){ return range.intersectsNode(b); });
    }
    if (!blocks.length) return;
    var all = blocks.every(function(b){ return isKind(b, kind); });
    blocks.forEach(function(b){
      if (all){ plain(b); return; }
      if (isKind(b, kind)) return;
      plain(b);
      if (kind === "check"){ b.classList.add("mk"); b.setAttribute("data-on", "0"); }
      else { b.classList.add("bl"); b.setAttribute("data-b", kind); }
    });
    changed(); states();
  }

  /* 단추를 눌러도 글의 선택은 그대로여야 한다 — 누르는 순간 초점이 옮겨 가지 않게 한다 */
  wrap.querySelectorAll(".rich-bar button").forEach(function(b){
    b.addEventListener("pointerdown", function(e){ e.preventDefault(); });
    b.addEventListener("mousedown", function(e){ e.preventDefault(); });
    ripple(b, function(){
      if (b.dataset.cmd) exec(b.dataset.cmd);
      else if (b.dataset.size) exec("fontSize", b.dataset.size);
      else if (b.dataset.color) exec("foreColor", b.dataset.color);
      else if (b.dataset.list) toggleLine(b.dataset.list);
      else toggleLine("check");
    });
  });

  /* 체크 상자를 누르면 켜고 끈다 (상자는 줄 왼쪽 여백에 그려져 있다) */
  ed.addEventListener("click", function(e){
    var line = e.target.closest ? e.target.closest(".mk") : null;
    if (!line || !ed.contains(line)) return;
    if (e.clientX - line.getBoundingClientRect().left > 26) return;
    line.setAttribute("data-on", line.getAttribute("data-on") === "1" ? "0" : "1");
    changed();
  });
  function special(b){ return !!b && (b.classList.contains("mk") || b.classList.contains("bl")); }
  /* 줄바꿈과 지우기는 beforeinput으로 받는다 — 폰 자판은 keydown에 어떤 키인지 알려 주지 않는다(229). */
  ed.addEventListener("beforeinput", function(e){
    var sel = inEd(), blk = sel ? topBlock(ed, sel.anchorNode) : null;
    if (e.inputType === "insertParagraph"){
      /* 빈 체크 줄 · 머리표 줄에서 Enter는 그 줄에서 나오는 것이다 — 표시가 지워지고 보통 줄이 된다 */
      if (special(blk) && !(blk.textContent || "").trim()){
        e.preventDefault();
        plain(blk);
        changed(); states();
        return;
      }
      /* 새 줄은 윗줄의 종류를 잇는다(브라우저가 속성을 그대로 베낀다). 체크만은 꺼진 채로 시작한다. */
      setTimeout(function(){
        var s2 = inEd(), nb = s2 ? topBlock(ed, s2.anchorNode) : null;
        if (nb && nb !== blk && nb.classList.contains("mk") && !(nb.textContent || "").trim()) nb.setAttribute("data-on", "0");
        /* 브라우저가 속성을 베끼지 않았으면 직접 잇는다 */
        if (nb && nb !== blk && special(blk) && !special(nb) && !(nb.textContent || "").trim() && blk.nextSibling === nb){
          if (blk.classList.contains("mk")){ nb.classList.add("mk"); nb.setAttribute("data-on", "0"); }
          else { nb.classList.add("bl"); nb.setAttribute("data-b", blk.getAttribute("data-b")); }
        }
        states();
      }, 0);
    }
    if (e.inputType === "deleteContentBackward" && special(blk) && sel.isCollapsed){
      var r = document.createRange();
      r.selectNodeContents(blk); r.setEnd(sel.anchorNode, sel.anchorOffset);
      if (!r.toString()){
        e.preventDefault();
        plain(blk);
        changed(); states();
      }
    }
  });
  /* 붙여 넣는 것은 글자만 — 남의 모양과 꼬리표를 들이지 않는다 */
  ed.addEventListener("paste", function(e){
    var t = e.clipboardData ? e.clipboardData.getData("text/plain") : "";
    e.preventDefault();
    if (t) document.execCommand("insertText", false, t);
  });
  ed.addEventListener("input", emptyMark);
  ed.addEventListener("focus", function(){
    try{ document.execCommand("defaultParagraphSeparator", false, "div"); }catch(e){}
  });
  function onSel(){
    if (!ed.isConnected){ document.removeEventListener("selectionchange", onSel); return; }
    var sel = inEd();
    if (sel) saved = sel.getRangeAt(0).cloneRange();
    states();
  }
  document.addEventListener("selectionchange", onSel);
  emptyMark();

  return {
    node: wrap,
    field: ed,
    html: function(){ return cleanRich(ed); },
    focus: function(){
      ed.focus();
      var r = document.createRange(); r.selectNodeContents(ed); r.collapse(false);
      var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    }
  };
}
