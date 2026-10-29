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
export async function loadPhoto(pid){
  if (photoCache[pid]) return photoCache[pid];
  var data = null;
  try{ data = await Store.blobGet(pid); }catch(e){ data = null; }
  if (data) photoCache[pid] = data;
  return data;
}
export function dropPhoto(pid){
  delete photoCache[pid];
  try{ Store.blobDrop(pid); }catch(e){ /* the attachment is gone either way */ }
}
export function thumb(pid){
  var img = el('<img class="att-thumb" alt="첨부 사진">');
  loadPhoto(pid).then(function(d){ if (d) img.src = d; });
  ripple(img, function(){ openPhoto(pid); });
  return img;
}
export function openPhoto(pid){
  loadPhoto(pid).then(function(d){
    if (!d){ toast("사진을 불러오지 못했어요."); return; }
    var v = el('<div class="photoview"><img src="' + d + '" alt="첨부 사진"></div>');
    ripple(v, function(){ closeTop(v); });
    showOverlay(v);
  });
}
