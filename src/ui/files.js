/* Files people attach — mostly PDFs.
 *
 * A file is far too big for a document, and too big for one request too, so it
 * is cut into pieces and each piece is stored on its own (`<id>.0`, `<id>.1` …),
 * the same way a photo is. What the document keeps is small: the id, how many
 * pieces, the size, the type and the name.
 *
 * A file opens here, inside the page: a PDF is drawn page by page (pdf.js, which
 * is only fetched the first time someone opens one), a picture is shown as it
 * is, plain text is read out. Anything else can only be saved to the device.
 */
import { el, esc, icon, ripple, uid } from "./dom.js";
import { Store } from "./store.js";
import { showOverlay, closeTop } from "./sheet.js";

export var FILE_MAX = 10 * 1024 * 1024;
var PART = 510000;              /* bytes in one piece — 680,000 letters once encoded, well under one request */
var LIB = "vendor/pdfjs/";
var mem = {};                   /* id → Blob, for as long as the page lives */
var loading = {};

/* ---------- this device's own copy ----------
   A file that was opened once should not be fetched again on a slow connection. */
var dbp = null;
function idb(){
  if (dbp) return dbp;
  dbp = new Promise(function(resolve){
    try{
      var req = indexedDB.open("bemtrip.files", 1);
      req.onupgradeneeded = function(){ req.result.createObjectStore("f"); };
      req.onsuccess = function(){ resolve(req.result); };
      req.onerror = function(){ resolve(null); };
      req.onblocked = function(){ resolve(null); };
    }catch(e){ resolve(null); }
  });
  return dbp;
}
function kept(mode, run){
  return idb().then(function(db){
    if (!db) return null;
    return new Promise(function(resolve){
      try{
        var tx = db.transaction("f", mode);
        var rq = run(tx.objectStore("f"));
        tx.oncomplete = function(){ resolve(rq.result === undefined ? true : rq.result); };
        tx.onerror = tx.onabort = function(){ resolve(null); };
      }catch(e){ resolve(null); }
    });
  });
}

function readBuffer(blob){
  if (blob.arrayBuffer) return blob.arrayBuffer();
  return new Promise(function(resolve, reject){
    var r = new FileReader();
    r.onload = function(){ resolve(r.result); };
    r.onerror = function(){ reject(new Error("read")); };
    r.readAsArrayBuffer(blob);
  });
}
function b64(bytes){
  var s = "", step = 0x8000;
  for (var i = 0; i < bytes.length; i += step) s += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
  return btoa(s);
}
function unb64(str){
  var s = atob(str), out = new Uint8Array(s.length);
  for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
/* several at once, but not all at once */
function pool(count, width, one){
  var next = 0;
  async function worker(){ while (next < count){ var i = next++; await one(i); } }
  var ws = [];
  for (var w = 0; w < Math.min(width, count); w++) ws.push(worker());
  return Promise.all(ws);
}

var MIME = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", txt: "text/plain" };
function extOf(name){
  var m = /\.([A-Za-z0-9]{1,5})$/.exec(name || "");
  return m ? m[1].toLowerCase() : "";
}

/* Stores a file and answers with what the document should remember about it.
   `onProgress(0..1)` is told as the pieces go up. */
export async function storeFile(file, onProgress){
  if (!file.size) throw new Error("empty");
  if (file.size > FILE_MAX) throw new Error("too big");
  var buf = await readBuffer(file);
  var bytes = new Uint8Array(buf);
  var fid = uid("f");
  var mime = file.type || MIME[extOf(file.name)] || "";
  var here = await kept("readwrite", function(s){ return s.put({ buf: buf, mime: mime }, fid); });
  var parts = 0;
  /* a copy with nowhere to send things keeps the file on this device only */
  if (Store.kind === "remote" || !here){
    parts = Math.ceil(bytes.length / PART);
    var done = 0;
    try{
      await pool(parts, 3, async function(i){
        await Store.blobPut(fid + "." + i, b64(bytes.subarray(i * PART, (i + 1) * PART)));
        done++;
        if (onProgress) onProgress(done / parts);
      });
    }catch(e){
      dropFile({ pid: fid, parts: parts });
      throw e;
    }
  }
  mem[fid] = new Blob([buf], { type: mime });
  return { pid: fid, parts: parts, size: bytes.length, mime: mime, title: file.name || "파일" };
}

export function loadFile(f, onProgress){
  var fid = f && f.pid;
  if (!fid) return Promise.resolve(null);
  if (mem[fid]) return Promise.resolve(mem[fid]);
  if (loading[fid]) return loading[fid];
  var p = (async function(){
    var own = await kept("readonly", function(s){ return s.get(fid); });
    if (own && own.buf) return (mem[fid] = new Blob([own.buf], { type: f.mime || own.mime || "" }));
    var n = Number(f.parts) || 0;
    if (!n) return null;
    var chunks = new Array(n), done = 0;
    await pool(n, 4, async function(i){
      var d = await Store.blobGet(fid + "." + i);
      if (d == null) throw new Error("missing");
      chunks[i] = unb64(d);
      done++;
      if (onProgress) onProgress(done / n);
    });
    var blob = new Blob(chunks, { type: f.mime || "" });
    mem[fid] = blob;
    readBuffer(blob).then(function(buf){
      kept("readwrite", function(s){ return s.put({ buf: buf, mime: f.mime || "" }, fid); });
    }).catch(function(){});
    return blob;
  })();
  loading[fid] = p;
  function settle(){ delete loading[fid]; }
  p.then(settle, settle);
  return p.catch(function(){ return null; });
}

export function dropFile(f){
  var fid = f && f.pid;
  if (!fid) return;
  delete mem[fid];
  kept("readwrite", function(s){ return s.delete(fid); });
  for (var i = 0; i < (Number(f.parts) || 0); i++){
    try{ Store.blobDrop(fid + "." + i); }catch(e){ /* the record is gone either way */ }
  }
}

export function fileSize(n){
  n = Number(n) || 0;
  if (!n) return "";
  if (n < 1024) return n + "B";
  if (n < 1048576) return Math.max(1, Math.round(n / 1024)) + "KB";
  return (n / 1048576).toFixed(1).replace(/\.0$/, "") + "MB";
}
/* the few letters that say what it is: PDF · JPG · DOCX */
export function fileExt(f){
  var e = extOf(f && f.title);
  if (e) return e.toUpperCase();
  var m = (f && f.mime) || "";
  if (m === "application/pdf") return "PDF";
  if (/^image\//.test(m)) return m.slice(6).toUpperCase().slice(0, 5);
  return "파일";
}
export function fileKind(f){
  var m = (f && f.mime) || "", e = extOf(f && f.title);
  if (m === "application/pdf" || e === "pdf") return "pdf";
  if (/^image\//.test(m) || /^(png|jpe?g|gif|webp)$/.test(e)) return "image";
  if (/^text\/plain/.test(m) || e === "txt") return "text";
  return "other";
}
/* "PDF · 1.2MB" */
export function fileMeta(f){
  var s = fileSize(f && f.size);
  return fileExt(f) + (s ? " · " + s : "");
}

/* ---------- pdf.js, fetched the first time it is needed ---------- */
var libp = null;
function pdfLib(){
  if (libp) return libp;
  libp = new Promise(function(resolve, reject){
    if (window.pdfjsLib) return resolve(window.pdfjsLib);
    var s = document.createElement("script");
    s.src = LIB + "pdf.min.js";
    s.onload = function(){
      var lib = window.pdfjsLib;
      if (!lib) return reject(new Error("pdf"));
      lib.GlobalWorkerOptions.workerSrc = LIB + "pdf.worker.min.js";
      resolve(lib);
    };
    s.onerror = function(){ libp = null; reject(new Error("pdf")); };
    document.head.appendChild(s);
  });
  return libp;
}

/* ---------- the viewer ----------
   One screen over the page: a bar (close · name · save), the pages, and a small
   pill (smaller · where you are · bigger). Two fingers zoom, a double tap too. */
var ZMAX = 4;
var MAXPX = 5200000;            /* one canvas — phones refuse the very big ones */

export function openFile(f){
  var name = (f && f.title) || "파일";
  var v = el(
    '<div class="fileview" role="dialog" aria-modal="true" aria-label="' + esc(name) + '">' +
      '<div class="fv-bar">' +
        '<button class="icon-btn" type="button" data-x aria-label="닫기">' + icon("x") + '</button>' +
        '<div class="fv-name"><b>' + esc(name) + '</b><small>' + esc(fileMeta(f)) + '</small></div>' +
        '<a class="icon-btn" data-dl aria-label="내려받기" title="내려받기" hidden>' + icon("download") + '</a>' +
      '</div>' +
      '<div class="fv-scroll"><div class="fv-wait"><span class="fv-spin"></span><p>불러오는 중...</p></div></div>' +
      '<div class="fv-tools" hidden>' +
        '<button type="button" data-z="out" aria-label="작게">' + icon("minus") + '</button>' +
        '<span class="fv-pos mono"></span>' +
        '<button type="button" data-z="in" aria-label="크게">' + icon("plus") + '</button>' +
      '</div>' +
    '</div>');
  var scroll = v.querySelector(".fv-scroll");
  var tools = v.querySelector(".fv-tools");
  var pos = v.querySelector(".fv-pos");
  var dl = v.querySelector("[data-dl]");
  var dead = false, url = null, doc = null, task = null, io = null;
  var box = null, pages = [], zoom = 1, settleT = null;

  function close(){
    if (dead) return;
    dead = true;
    clearTimeout(settleT);
    window.removeEventListener("resize", settle);
    if (io) io.disconnect();
    pages.forEach(function(p){ if (p.task) try{ p.task.cancel(); }catch(e){} });
    if (task) try{ task.destroy(); }catch(e){}
    if (url) setTimeout(function(){ URL.revokeObjectURL(url); }, 2000);
    closeTop(v);
  }
  v._shut = close;
  ripple(v.querySelector("[data-x]"), close);

  function say(text, withSave){
    scroll.innerHTML = "";
    tools.hidden = true;
    var card = el('<div class="fv-card">' + icon("file") + '<b>' + esc(name) + '</b><small>' + esc(fileMeta(f)) + '</small>' +
      '<p>' + esc(text) + '</p></div>');
    if (withSave && url){
      var a = el('<a class="btn btn-primary">' + icon("download") + '내려받기</a>');
      a.href = url; a.setAttribute("download", name);
      card.appendChild(a);
    }
    scroll.appendChild(card);
  }

  /* ----- zoom: the pages are as wide as the screen times --z ----- */
  function setZoom(nz, cx, cy){
    if (!box) return;
    nz = Math.max(1, Math.min(ZMAX, nz));
    if (cx == null){ cx = scroll.clientWidth / 2; cy = scroll.clientHeight / 2; }
    var k = nz / zoom;
    var X = scroll.scrollLeft + cx, Y = scroll.scrollTop + cy;
    zoom = nz;
    box.style.setProperty("--z", String(zoom));
    scroll.scrollLeft = X * k - cx;
    scroll.scrollTop = Y * k - cy;
    tools.querySelector('[data-z="out"]').disabled = zoom <= 1.001;
    tools.querySelector('[data-z="in"]').disabled = zoom >= ZMAX - 0.001;
    clearTimeout(settleT);
    settleT = setTimeout(settle, 180);
  }
  /* once the size has stopped changing, draw again at that size */
  function settle(){
    if (dead) return;
    pages.forEach(function(p){ if (p.near) draw(p); });
    where();
  }
  ripple(tools.querySelector('[data-z="out"]'), function(){ setZoom(zoom / 1.4); });
  ripple(tools.querySelector('[data-z="in"]'), function(){ setZoom(zoom * 1.4); });

  var pinch = null;
  function gap(e){
    var a = e.touches[0], b = e.touches[1];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1;
  }
  scroll.addEventListener("touchstart", function(e){
    pinch = e.touches.length === 2 ? { d: gap(e), z: zoom } : null;
  }, { passive: true });
  scroll.addEventListener("touchmove", function(e){
    if (!pinch || e.touches.length !== 2) return;
    e.preventDefault();
    var r = scroll.getBoundingClientRect();
    setZoom(pinch.z * gap(e) / pinch.d,
      (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left,
      (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top);
  }, { passive: false });
  scroll.addEventListener("touchend", function(){ pinch = null; }, { passive: true });
  scroll.addEventListener("touchcancel", function(){ pinch = null; }, { passive: true });
  scroll.addEventListener("gesturestart", function(e){ e.preventDefault(); });
  scroll.addEventListener("wheel", function(e){
    if (!e.ctrlKey || !box) return;
    e.preventDefault();
    var r = scroll.getBoundingClientRect();
    setZoom(zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  scroll.addEventListener("dblclick", function(e){
    if (!box) return;
    var r = scroll.getBoundingClientRect();
    setZoom(zoom > 1.05 ? 1 : 2.2, e.clientX - r.left, e.clientY - r.top);
  });

  /* ----- where you are: the page under the middle of the screen ----- */
  var ticking = false;
  function where(){
    if (!pages.length){ pos.textContent = Math.round(zoom * 100) + "%"; return; }
    var mid = scroll.scrollTop + scroll.clientHeight / 2, at = 0;
    for (var i = 0; i < pages.length; i++){
      if (pages[i].node.offsetTop <= mid) at = i; else break;
    }
    pos.textContent = (at + 1) + " / " + pages.length;
  }
  scroll.addEventListener("scroll", function(){
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function(){ ticking = false; if (!dead) where(); });
  }, { passive: true });

  /* ----- a PDF: one holder per page; only the ones near the screen are drawn ----- */
  function ratio(node, vp){ node.style.aspectRatio = vp.width + " / " + vp.height; }
  async function draw(p){
    if (dead || p.busy) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    var want = Math.round(p.node.clientWidth * dpr);
    if (!want || p.drawn === want) return;
    p.busy = true;
    try{
      var page = p.page || (p.page = await doc.getPage(p.i + 1));
      var base = page.getViewport({ scale: 1 });
      ratio(p.node, base);
      var scale = want / base.width;
      if (base.width * scale * base.height * scale > MAXPX) scale = Math.sqrt(MAXPX / (base.width * base.height));
      var vp = page.getViewport({ scale: scale });
      var c = document.createElement("canvas");
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      p.task = page.render({ canvasContext: c.getContext("2d"), viewport: vp });
      await p.task.promise;
      p.task = null;
      if (!dead && p.near){
        p.node.innerHTML = "";
        p.node.appendChild(c);
        p.drawn = want;
      }
    }catch(e){ p.task = null; }
    p.busy = false;
    if (!dead && p.near && Math.round(p.node.clientWidth * dpr) !== p.drawn && p.drawn) draw(p);
  }
  function clear(p){
    if (p.task) try{ p.task.cancel(); }catch(e){}
    p.node.innerHTML = "";
    p.drawn = 0;
  }
  async function showPdf(blob){
    var lib = await pdfLib();
    var data = new Uint8Array(await readBuffer(blob));
    if (dead) return;
    /* isEvalSupported는 꺼 둔다: 남이 올린 PDF 안의 글꼴이 코드가 되어 돌면 안 된다(이 판의 pdf.js에 알려진 구멍) */
    task = lib.getDocument({ data: data, cMapUrl: LIB + "cmaps/", cMapPacked: true, isEvalSupported: false });
    doc = await task.promise;
    if (dead) return;
    var first = await doc.getPage(1);
    var vp = first.getViewport({ scale: 1 });
    box = el('<div class="fv-pages"></div>');
    for (var i = 0; i < doc.numPages; i++){
      var node = el('<div class="fv-page" data-n="' + (i + 1) + '"></div>');
      ratio(node, vp);
      var p = { i: i, node: node, page: i ? null : first, near: false, drawn: 0, busy: false, task: null };
      node._p = p;
      pages.push(p);
      box.appendChild(node);
    }
    scroll.innerHTML = "";
    scroll.appendChild(box);
    tools.hidden = false;
    setZoom(1);
    where();
    io = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        var q = en.target._p;
        q.near = en.isIntersecting;
        if (q.near) draw(q); else clear(q);
      });
    }, { root: scroll, rootMargin: "100% 100%" });
    pages.forEach(function(q){ io.observe(q.node); });
    window.addEventListener("resize", settle);
  }
  function showImage(){
    box = el('<div class="fv-pages"><img class="fv-img" alt="' + esc(name) + '"></div>');
    var img = box.firstChild;
    img.onerror = function(){ box = null; say("이 기기에서는 볼 수 없는 형식입니다.", true); };
    img.src = url;
    scroll.innerHTML = "";
    scroll.appendChild(box);
    tools.hidden = false;
    setZoom(1);
    where();
  }
  async function showText(blob){
    var text = blob.text ? await blob.text() : new TextDecoder().decode(await readBuffer(blob));
    if (dead) return;
    scroll.innerHTML = "";
    scroll.appendChild(el('<pre class="fv-text">' + esc(text) + '</pre>'));
  }

  showOverlay(v);
  var wait = v.querySelector(".fv-wait p");
  loadFile(f, function(done){ if (wait.isConnected) wait.textContent = "불러오는 중... " + Math.round(done * 100) + "%"; })
    .then(async function(blob){
      if (dead) return;
      if (!blob) return say("파일을 불러오지 못했습니다.");
      url = URL.createObjectURL(blob);
      dl.href = url; dl.setAttribute("download", name); dl.hidden = false;
      var kind = fileKind(f);
      try{
        if (kind === "pdf") await showPdf(blob);
        else if (kind === "image") showImage();
        else if (kind === "text") await showText(blob);
        else say("여기서는 볼 수 없는 형식입니다.", true);
      }catch(e){
        if (dead) return;
        box = null; pages = [];
        say(e && e.name === "PasswordException" ? "암호가 걸린 파일은 여기서 열 수 없습니다."
                                                 : "파일을 열지 못했습니다.", true);
      }
    });
  return v;
}
