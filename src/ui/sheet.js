/* Sheets, dialogs and the form controls they are made of. */
import { el, esc, icon, ripple, safeUrl, toast } from "./dom.js";
import { Store } from "./store.js";

/* 고치는 창은 고칠 수 있는 사람에게만 열린다. 열어놓고 저장할 때 막으면
   적어둔 것이 사라지므로, 열기 전에 묻는다 — 로그인하지 않았다면 그 길로
   로그인 화면으로 간다(Store.deny). */
function mayEdit(){
  if (Store.canEdit()) return true;
  Store.deny();
  return false;
}

/* A weekday name is calendar knowledge; it belongs with the controls. */
var DOW = ["일", "월", "화", "수", "목", "금", "토"];
function dowOf(iso){ return DOW[new Date(iso + "T00:00:00").getDay()]; }

var overlay = null;
function host(){
  return overlay || (overlay = document.getElementById("overlay"));
}
export function closeOverlay(){ host().innerHTML = ""; }
export function showOverlay(node){ host().appendChild(node); }

export function sheetShell(title, sub){
  var s = el(
    '<div class="scrim"><div class="sheet" role="dialog" aria-modal="true">' +
      '<div class="sheet-grip"></div>' +
      '<div class="sheet-head"><div style="flex:1;min-width:0">' +
        '<p class="sheet-title">' + esc(title) + '</p>' +
        (sub ? '<p class="sheet-sub">' + esc(sub) + '</p>' : '') +
      '</div><button class="icon-btn" data-x aria-label="닫기">' + icon("x") + '</button></div>' +
      '<div class="sheet-body"></div>' +
      '<div class="sheet-foot"></div>' +
    '</div></div>'
  );
  ripple(s.querySelector("[data-x]"), closeOverlay);
  s.addEventListener("click", function(e){ if (e.target === s) closeOverlay(); });
  return s;
}

/* Generic record form — used by every 정보 section and 쇼핑 가게. */
export function openFormSheet(opts, rec, onSave, onDelete){
  if (!mayEdit()) return;
  var sheet = sheetShell(opts.title);
  var body = sheet.querySelector(".sheet-body");
  var foot = sheet.querySelector(".sheet-foot");
  var inputs = {};

  opts.fields.forEach(function(f){
    var v = rec ? (rec[f.key] || "") : "";
    var control = f.area
      ? '<textarea id="f-' + f.key + '" placeholder="' + esc(f.placeholder || "") + '">' + esc(v) + '</textarea>'
      : '<input id="f-' + f.key + '" type="' + (f.time ? "time" : "text") + '" placeholder="' +
        esc(f.placeholder || "") + '" value="' + esc(v) + '">';
    var fld = el('<div class="fld"><label for="f-' + f.key + '">' + esc(f.label) + '</label>' + control + '</div>');
    body.appendChild(fld);
    inputs[f.key] = fld.querySelector("#f-" + f.key);
  });

  if (onDelete){
    var del = el('<button class="btn btn-danger" type="button">삭제</button>');
    ripple(del, function(){ closeOverlay(); onDelete(); toast("삭제했어요."); });
    foot.appendChild(del);
  }
  var save = el('<button class="btn btn-primary" type="button">저장</button>');
  ripple(save, function(){
    var out = {};
    for (var i = 0; i < opts.fields.length; i++){
      var f = opts.fields[i];
      var val = inputs[f.key].value.trim();
      if (f.url){
        var u = safeUrl(val);
        if (!u){ inputs[f.key].focus(); toast("http로 시작하는 주소를 넣어주세요."); return; }
        val = u;
      }
      if (f.required && !val){ inputs[f.key].focus(); toast(f.label + "을(를) 적어주세요."); return; }
      out[f.key] = val;
    }
    closeOverlay();
    onSave(out);
    toast(rec ? "수정했어요." : "추가했어요.");
  });
  foot.appendChild(save);

  showOverlay(sheet);
  setTimeout(function(){ inputs[opts.fields[0].key].focus(); }, 60);
}

export function openTextDialog(opts, onSave, onDelete, onCancel){
  if (!mayEdit()) return;
  var field = opts.multiline
    ? '<textarea id="dlg-v" placeholder="' + esc(opts.placeholder || "") + '">' + esc(opts.value || "") + '</textarea>'
    : '<input id="dlg-v" type="text" placeholder="' + esc(opts.placeholder || "") + '" value="' + esc(opts.value || "") + '">';
  var scrim = el('<div class="scrim mid"><div class="dialog" role="dialog" aria-modal="true">' +
    '<h3>' + esc(opts.title) + '</h3><div class="fld">' + field +
    (opts.hint ? '<p class="fld-hint">' + esc(opts.hint) + '</p>' : '') + '</div>' +
    '<div class="dialog-actions">' +
      (onDelete ? '<button class="btn-text danger" data-a="del">삭제</button>' : '') +
      '<span class="spacer"></span>' +
      '<button class="btn-text" data-a="no">취소</button>' +
      '<button class="btn-text go" data-a="ok">' + esc(opts.okLabel || "확인") + '</button>' +
    '</div></div></div>');
  function give(){ closeOverlay(); if (onCancel) onCancel(); }
  scrim.addEventListener("click", function(e){ if (e.target === scrim) give(); });
  var input = scrim.querySelector("#dlg-v");
  scrim.querySelector('[data-a="no"]').addEventListener("click", give);
  if (onDelete) scrim.querySelector('[data-a="del"]').addEventListener("click", function(){ closeOverlay(); onDelete(); });
  scrim.querySelector('[data-a="ok"]').addEventListener("click", function(){
    var v = input.value.trim();
    if (!v){ input.focus(); return; }
    closeOverlay(); onSave(v);
  });
  input.addEventListener("keydown", function(e){ if (e.key === "Enter" && !opts.multiline) scrim.querySelector('[data-a="ok"]').click(); });
  showOverlay(scrim);
  setTimeout(function(){ input.focus(); }, 60);
}

/* Something that cannot be undone asks you to write it out. A tap can happen
   by accident; typing 삭제하기 cannot. */
export function openConfirmDialog(opts, onYes){
  if (!mayEdit()) return;
  var scrim = el('<div class="scrim mid"><div class="dialog" role="dialog" aria-modal="true">' +
    '<h3>' + esc(opts.title) + '</h3>' +
    '<p class="dialog-body">' + esc(opts.body) + '</p>' +
    '<div class="fld"><label for="cfm-v">' + esc(opts.label || opts.phrase) + '</label>' +
    '<input id="cfm-v" type="text" autocomplete="off" autocapitalize="off" ' +
    'spellcheck="false" placeholder="' + esc(opts.phrase) + '"></div>' +
    '<div class="dialog-actions">' +
      '<span class="spacer"></span>' +
      '<button class="btn-text" data-a="no">취소</button>' +
      '<button class="btn-text danger" data-a="ok" disabled>' + esc(opts.okLabel || "삭제") + '</button>' +
    '</div></div></div>');
  var input = scrim.querySelector("#cfm-v");
  var ok = scrim.querySelector('[data-a="ok"]');
  function check(){ ok.disabled = input.value.trim() !== opts.phrase; }
  function done(){
    if (ok.disabled){ input.focus(); toast('"' + opts.phrase + '"를 그대로 적어주세요.'); return; }
    closeOverlay();
    onYes();
  }
  input.addEventListener("input", check);
  input.addEventListener("keydown", function(e){ if (e.key === "Enter") done(); });
  scrim.querySelector('[data-a="no"]').addEventListener("click", closeOverlay);
  ok.addEventListener("click", done);
  scrim.addEventListener("click", function(e){ if (e.target === scrim) closeOverlay(); });
  showOverlay(scrim);
  setTimeout(function(){ input.focus(); }, 60);
}

export function pickerField(o){
  function show(v){
    if (!v) return o.type === "time" ? "--:--" : "----.--.--";
    return o.type === "time" ? v : v.replace(/-/g, ".") + " (" + dowOf(v) + ")";
  }
  var wrap = el(
    '<div class="' + (o.col ? "fld-col" : "fld") + '">' +
      '<label for="' + o.id + '">' + esc(o.label) + '</label>' +
      '<div class="pickbox' + (o.value ? "" : " blank") + '">' +
        '<span class="pickval">' + esc(show(o.value)) + '</span>' +
        '<input id="' + o.id + '" type="' + o.type + '" value="' + esc(o.value || "") + '">' +
      '</div>' +
    '</div>'
  );
  var input = wrap.querySelector("input");
  var box = wrap.querySelector(".pickbox");
  var val = wrap.querySelector(".pickval");
  function sync(){
    val.textContent = show(input.value);
    box.classList.toggle("blank", !input.value);
  }
  input.addEventListener("input", sync);
  input.addEventListener("change", sync);
  return wrap;
}

export function pickGroup(row, options, get, set){
  row.innerHTML = "";
  options.forEach(function(o){
    var b = el('<button class="pick" type="button" aria-pressed="' + (get() === o.key) + '">' + esc(o.label) + '</button>');
    ripple(b, function(){
      set(o.key);
      row.querySelectorAll(".pick").forEach(function(x, i){
        x.setAttribute("aria-pressed", String(options[i].key === get()));
      });
    });
    row.appendChild(b);
  });
}
