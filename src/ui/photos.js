/* Pictures people attach. They are far too big to ride along with the rest,
   so each one is stored on its own and fetched by id. */
import { el, uid, ripple, toast } from "./dom.js";
import { Store } from "./store.js";
import { showOverlay, closeTop } from "./sheet.js";

var photoCache = {};

function compressImage(file, maxSide, quality){
  return new Promise(function(resolve, reject){
    var reader = new FileReader();
    reader.onerror = function(){ reject(new Error("read")); };
    reader.onload = function(){
      var img = new Image();
      img.onerror = function(){ reject(new Error("decode")); };
      img.onload = function(){
        var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        var w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        var c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
/* A photo is far too big for the trip document, so each gets its own record. */
export async function storePhoto(file){
  var data = await compressImage(file, 900, 0.55);
  if (data.length > 180000) data = await compressImage(file, 640, 0.45);
  if (data.length > 230000) throw new Error("too big");
  var pid = uid("p");
  await Store.blobPut(pid, data);
  photoCache[pid] = data;
  return pid;
}
/* ---------- 이 기기의 사본 ----------
   한 번 받은 사진은 기기에 둔다(IndexedDB) — 다음에 열 때는 받지 않고 곧바로 뜬다. 여행지의 느린 연결에서도. */
var dbp = null;
function idb(){
  if (dbp) return dbp;
  dbp = new Promise(function(resolve){
    try{
      var req = indexedDB.open("bemtrip.photos", 1);
      req.onupgradeneeded = function(){ req.result.createObjectStore("p"); };
      req.onsuccess = function(){ resolve(req.result); };
      req.onerror = req.onblocked = function(){ resolve(null); };
    }catch(e){ resolve(null); }
  });
  return dbp;
}
function kept(mode, run){
  return idb().then(function(db){
    if (!db) return null;
    return new Promise(function(resolve){
      try{
        var tx = db.transaction("p", mode), rq = run(tx.objectStore("p"));
        tx.oncomplete = function(){ resolve(rq.result === undefined ? true : rq.result); };
        tx.onerror = tx.onabort = function(){ resolve(null); };
      }catch(e){ resolve(null); }
    });
  });
}
var loading = {};
export function loadPhoto(pid){
  if (photoCache[pid]) return Promise.resolve(photoCache[pid]);
  if (loading[pid]) return loading[pid];
  var p = kept("readonly", function(s){ return s.get(pid); }).then(function(own){
    if (typeof own === "string" && own) return own;
    return Promise.resolve(Store.blobGet(pid)).catch(function(){ return null; }).then(function(d){
      if (d) kept("readwrite", function(s){ return s.put(d, pid); });
      return d || null;
    });
  }).then(function(d){
    if (d) photoCache[pid] = d;
    delete loading[pid];
    return d;
  });
  loading[pid] = p;
  return p;
}
/* 기억에 있으면 기다리지 않고 바로 — 다시 그릴 때 사진이 깜빡이지 않게 */
export function photoNow(pid){ return photoCache[pid] || null; }
export function dropPhoto(pid){
  delete photoCache[pid];
  kept("readwrite", function(s){ return s.delete(pid); });
  try{ Store.blobDrop(pid); }catch(e){ /* the attachment is gone either way */ }
}

/* 사진 자리(img)를 채운다. 기억에 있으면 곧바로, 없으면 물결(.shim)이 흐르다가 도착하면 서서히 떠오른다.
   글자(대체 글)는 화면에 내지 않는다 — 비어 있는 img는 브라우저가 alt를 글자로 그려 버린다. 이름은 aria-label이 말한다.
   `holder`가 있으면 물결은 그쪽(칸)에 깐다. 못 받으면 onLost. */
var BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
export function fillPhoto(img, pid, holder, onLost){
  var box = holder || img;
  var now = photoNow(pid);
  if (now){ img.src = now; return img; }
  img.src = BLANK;
  box.classList.add("shim");
  loadPhoto(pid).then(function(d){
    if (!d){ box.classList.remove("shim"); if (onLost) onLost(); return; }
    img.onload = function(){
      img.onload = null;
      box.classList.remove("shim");
      img.classList.add("photo-in");
    };
    img.src = d;
  });
  return img;
}
export function thumb(pid){
  var img = el('<img class="att-thumb" alt="" role="img" aria-label="첨부 사진">');
  fillPhoto(img, pid);
  ripple(img, function(){ openPhoto(pid); });
  return img;
}
/* 크게 보기: 받기를 기다리지 않고 바로 뜬다 — 도착할 때까지 그 자리에 물결이 흐른다 */
export function openPhoto(pid){
  var v = el('<div class="photoview"><img alt="" role="img" aria-label="첨부 사진"></div>');
  var img = v.firstChild;
  if (!photoNow(pid)) v.classList.add("waiting");
  fillPhoto(img, pid, null, function(){ closeTop(v); toast("사진을 불러오지 못했습니다."); });
  img.addEventListener("load", function(){ if (img.src !== BLANK) v.classList.remove("waiting"); });
  ripple(v, function(){ closeTop(v); });
  showOverlay(v);
}
