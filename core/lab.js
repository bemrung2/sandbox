/* The site itself: the door, the home screen, and handing control to whichever
   experiment the address names. It never learns what any of them do. */
import { el, esc, icon, ripple, toast } from "./dom.js";
import { Store } from "./store.js";
import { Theme, themeButton } from "./theme.js";
import { Router } from "./router.js";
import { sheetShell, showOverlay } from "./sheet.js";

var BUILD = "2026.10.27 · r17";
var view = null;
var list = [];

export var Lab = {
  async start(experiments){
    list = experiments;
    Theme.apply();
    view = document.getElementById("view");

    experiments.forEach(function(exp){
      if (!exp.css) return;
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = exp.css;
      document.head.appendChild(link);
    });

    await Store.open();
    Store.onChange = function(){
      if (Store.needSignIn) return paintSignIn();
      var exp = byId(current());
      if (exp && exp.refresh) exp.refresh();
    };

    Router.start(route);
    /* no address to read — pick up where this browser left off */
    if (!location.hash){
      var last = Router.remembered();
      if (last && last !== "/") Router.set(last);
      Router.fire();
    }
  }
};

var openId = null;
function current(){ return openId; }
function byId(id){
  var found = null;
  list.forEach(function(exp){ if (exp.id === id) found = exp; });
  return found;
}

function route(path, segs){
  if (Store.needSignIn) return paintSignIn();
  var exp = byId(segs[0]);
  if (!exp){
    openId = null;
    return paintHome();
  }
  openId = exp.id;
  exp.mount(view, segs.slice(1), {
    go: function(p){ Router.go(p); },
    replace: function(p){ Router.set(p); },
    home: function(){ Router.go("/"); }
  });
}

/* ---------- the door ---------- */
function kakaoMark(){
  return '<svg class="kakao-mark" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path fill="currentColor" d="M12 3.6c-4.7 0-8.5 2.96-8.5 6.6 0 2.33 1.56 4.37 3.9 5.54l-.93 3.43a.3.3 0 0 0 .45.33l4.1-2.7c.32.03.65.04.98.04 4.7 0 8.5-2.95 8.5-6.6S16.7 3.6 12 3.6z"/>' +
    '</svg>';
}

function paintSignIn(){
  var wrap = el(
    '<div class="signin">' +
      '<div class="signin-art" aria-hidden="true">' +
        '<span class="orb orb-a"></span><span class="orb orb-b"></span><span class="orb orb-c"></span>' +
      '</div>' +
      '<div class="signin-main">' +
        '<h1 class="wordmark">BEMLAB</h1>' +
        '<button class="kakao rip" type="button">' + kakaoMark() + '카카오로 로그인</button>' +
      '</div>' +
    '</div>'
  );
  ripple(wrap.querySelector(".kakao"), function(){
    location.href = "api/auth/login?next=" + encodeURIComponent(location.hash || "");
  });
  view.innerHTML = "";
  view.appendChild(wrap);
  window.scrollTo(0, 0);
}

/* ---------- home ---------- */
function paintHome(){
  var wrap = el(
    '<div class="pad">' +
      '<div class="wordmark-row"><h1 class="wordmark">BEMLAB</h1></div>' +
      '<div class="lab-list"></div>' +
    '</div>'
  );
  wrap.querySelector(".wordmark-row").appendChild(themeButton(function(){ paintHome(); }));

  var box = wrap.querySelector(".lab-list");
  list.forEach(function(exp){
    var card = el(
      '<button class="lab-row" type="button">' +
        '<span class="lab-mark">' + icon(exp.icon || "compass") + '</span>' +
        '<span class="lab-text">' +
          '<span class="lab-index mono">' + esc(exp.index || "") + '</span>' +
          '<span class="lab-name">' + esc(exp.name) + '</span>' +
          '<span class="lab-desc">' + esc(exp.summary ? exp.summary() : "") + '</span>' +
        '</span>' + icon("go", "lab-go") +
      '</button>'
    );
    ripple(card, function(){ Router.go("/" + exp.id); });
    box.appendChild(card);
  });
  box.appendChild(el(
    '<div class="lab-row vacant">' +
      '<span class="lab-mark">' + icon("plus") + '</span>' +
      '<span class="lab-text">' +
        '<span class="lab-index mono">EXP ' + String(list.length + 1).padStart(2, "0") + '</span>' +
        '<span class="lab-name">비어 있음</span>' +
        '<span class="lab-desc">다음 실험이 들어갈 자리</span>' +
      '</span>' +
    '</div>'
  ));

  wrap.appendChild(accountRow());
  wrap.appendChild(el('<p class="build-stamp mono">build ' + BUILD + ' · ' + esc(Store.label) +
    (Store.ungated ? ' · 로그인 없이 열림' : '') + '</p>'));

  view.innerHTML = "";
  view.appendChild(wrap);
  window.scrollTo(0, 0);
}

function accountRow(){
  var row = el('<div class="account-row"></div>');
  if (!Store.me) return row;
  if (Store.me.isOwner){
    var who = el('<button class="linkbtn" type="button">' + icon("people") + '멤버</button>');
    ripple(who, openMembers);
    row.appendChild(who);
  }
  var out = el('<button class="linkbtn" type="button">' + icon("logout") +
    esc(Store.me.name || "나") + ' · 로그아웃</button>');
  ripple(out, function(){ location.href = "api/auth/logout"; });
  row.appendChild(out);
  return row;
}

/* ---------- who may edit ---------- */
function openMembers(){
  var sheet = sheetShell("멤버", "카카오로 로그인한 사람들");
  var body = sheet.querySelector(".sheet-body");
  sheet.querySelector(".sheet-foot").remove();
  body.appendChild(el('<p class="card-empty">불러오는 중…</p>'));

  fetch("api/members", { cache: "no-store" }).then(function(res){ return res.json(); }).then(function(data){
    body.innerHTML = "";
    if (!data || !data.ok || !data.members.length){
      body.appendChild(el('<p class="card-empty">아직 아무도 로그인하지 않았어요.</p>'));
      return;
    }
    data.members.forEach(function(m){
      var row = el('<div class="rowline"><span class="rowbody"><b>' + esc(m.name || m.id) +
        (m.isOwner ? ' <span class="badge tag">주인</span>' : '') +
        (m.you && !m.isOwner ? ' <span class="badge">나</span>' : '') + '</b>' +
        '<small>' + (m.canEdit ? "편집 가능" : "보기만") + '</small></span></div>');
      if (!m.isOwner){
        var tog = el('<button class="check" type="button" aria-pressed="' + m.canEdit +
          '" aria-label="편집 허용">' + icon("check") + '</button>');
        ripple(tog, function(){
          var next = !m.canEdit;
          fetch("api/members", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: m.id, canEdit: next })
          }).then(function(res){ return res.json(); }).then(function(out){
            if (!out || !out.ok){ toast("바꾸지 못했어요."); return; }
            m.canEdit = next;
            tog.setAttribute("aria-pressed", String(next));
            row.querySelector("small").textContent = next ? "편집 가능" : "보기만";
            toast((m.name || "") + (next ? " 편집을 열었어요" : " 보기만 가능해요"));
          }).catch(function(){ toast("바꾸지 못했어요."); });
        });
        row.insertBefore(tog, row.firstChild);
      }
      body.appendChild(row);
    });
  }).catch(function(){
    body.innerHTML = "";
    body.appendChild(el('<p class="card-empty">멤버를 불러오지 못했어요.</p>'));
  });

  showOverlay(sheet);
}
