/* Where anything an experiment saves goes.
 *
 * One shape, wherever it ends up: a flat map of document path to body. A
 * record is a document, so an edit writes one path and two people editing
 * different things never overwrite each other. Each experiment owns the paths
 * under its own id — this file never looks inside them.
 *
 *   RemoteStore  /api/plan, behind a sign-in. The shared one.
 *   LocalStore   this browser only. What you get with no backend.
 */
import { toast } from "./dom.js";

var API = "api/plan";
var LOCAL_KEY = "lab.docs";

/* ---------- this browser only ---------- */
function LocalStore(){
  this.kind = "local";
  this.shared = false;
  this.label = "이 기기에만 저장";
  this.map = {};
  this._t = null;
}
LocalStore.prototype.open = async function(){
  try{
    var raw = JSON.parse(localStorage.getItem(LOCAL_KEY) || "null");
    if (raw && raw.docs) this.map = raw.docs;
  }catch(e){ /* nothing saved yet */ }
};
LocalStore.prototype.write = function(path, body){
  if (body === null) delete this.map[path]; else this.map[path] = body;
  var self = this;
  clearTimeout(this._t);
  this._t = setTimeout(function(){
    try{ localStorage.setItem(LOCAL_KEY, JSON.stringify({ docs: self.map })); }
    catch(e){ /* private mode; it stays in memory */ }
  }, 300);
};
LocalStore.prototype.watch = function(){};
LocalStore.prototype.blobPut = async function(id, data){ localStorage.setItem("lab.blob." + id, data); };
LocalStore.prototype.blobGet = async function(id){ return localStorage.getItem("lab.blob." + id); };
LocalStore.prototype.blobDrop = function(id){ try{ localStorage.removeItem("lab.blob." + id); }catch(e){} };

/* ---------- the shared one ---------- */
function RemoteStore(){
  this.kind = "remote";
  this.shared = true;
  this.label = "함께 쓰는 저장소";
  this.map = {};
  this.rev = 0;
  this.me = null;
  this.ungated = false;   /* the server is not asking anyone to sign in */
  this.pending = {};
  this._t = null;
}
/* "ok" — signed in, loaded · "signin" — there, but nobody is signed in
   · "none" — no backend here at all */
RemoteStore.prototype.probe = async function(){
  var res;
  try{ res = await fetch(API, { cache: "no-store" }); }
  catch(e){ return "none"; }
  if (res.status === 401) return "signin";
  if (!res.ok) return "none";
  var data = null;
  try{ data = await res.json(); }catch(e){ return "none"; }
  if (!data || !data.ok) return "none";
  this.map = data.docs || {};
  this.rev = data.rev || 0;
  this.me = data.me || null;
  this.ungated = !!data.open;
  return "ok";
};
RemoteStore.prototype.write = function(path, body){
  if (body === null) delete this.map[path]; else this.map[path] = body;
  this.pending[path] = body === null ? null : body;
  this.send();
};
RemoteStore.prototype.send = function(){
  var self = this;
  clearTimeout(this._t);
  this._t = setTimeout(function(){ self.flush(); }, 300);
};
RemoteStore.prototype.flush = async function(){
  var all = Object.keys(this.pending);
  if (!all.length) return;
  var writes = {}, self = this;
  all.slice(0, 150).forEach(function(path){
    writes[path] = self.pending[path];
    delete self.pending[path];
  });
  if (Object.keys(this.pending).length) setTimeout(function(){ self.flush(); }, 60);
  try{
    var res = await fetch(API, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ writes: writes })
    });
    if (res.status === 401){ Store.signedOut(); return; }
    if (res.status === 403){ Store.refuse("편집 권한이 없어요. 계획 주인에게 요청해주세요."); return; }
    if (!res.ok) throw new Error("write " + res.status);
    var data = await res.json();
    this.rev = data.rev || this.rev;
  }catch(e){
    Object.assign(this.pending, writes);
    Store.failed();
    var retry = this;
    setTimeout(function(){ retry.send(); }, 4000);
  }
};
RemoteStore.prototype.watch = function(cb){
  var self = this;
  var tick = async function(){
    if (document.hidden) return;
    try{
      var res = await fetch(API + "?rev=" + self.rev, { cache: "no-store" });
      if (res.status === 401){ Store.signedOut(); return; }
      if (!res.ok) return;
      var data = await res.json();
      if (!data.ok) return;
      if (data.me) self.me = data.me;
      self.ungated = !!data.open;
      if (data.unchanged) return;
      self.map = data.docs || {};
      self.rev = data.rev || self.rev;
      cb();
    }catch(e){ /* a poll that fails is the next one's problem */ }
  };
  setInterval(tick, 4000);
  document.addEventListener("visibilitychange", function(){ if (!document.hidden) tick(); });
};
RemoteStore.prototype.blobPut = async function(id, data){
  await fetch(API, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ writes: { ["blobs/" + id]: { data: data } } })
  });
};
RemoteStore.prototype.blobGet = async function(id){
  var res = await fetch(API + "?path=" + encodeURIComponent("blobs/" + id), { cache: "no-store" });
  if (!res.ok) return null;
  var data = await res.json();
  return data.doc ? data.doc.data : null;
};
RemoteStore.prototype.blobDrop = function(id){
  fetch(API, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ writes: { ["blobs/" + id]: null } })
  }).catch(function(){});
};

/* ---------- what the rest of the app talks to ---------- */
export var Store = {
  backend: null,
  me: null,
  needSignIn: false,
  onChange: null,
  _warned: false,
  _back: null,

  async open(){
    this.backend = await pick(this);
    this.me = this.backend.me || null;
    if (this.needSignIn) return;
    var self = this;
    this.backend.watch(function(){ if (self.onChange) self.onChange(); });
  },

  get kind(){ return this.backend ? this.backend.kind : "local"; },
  /* nobody was asked to sign in, so nobody is held back */
  get ungated(){ return !!(this.backend && this.backend.ungated); },
  get label(){ return this.backend ? this.backend.label : ""; },
  get map(){ return this.backend ? this.backend.map : {}; },

  /* Signing in is what the shared copy asks for; everywhere else there is
     nobody to be, and everything is editable. */
  canEdit(){
    if (this.kind !== "remote") return true;
    if (this.ungated) return true;
    return !!(this.me && this.me.canEdit);
  },

  write(path, body){
    if (!this.canEdit()){
      this.refuse("편집 권한이 없어요. 계획 주인에게 요청해주세요.");
      return false;
    }
    this.backend.write(path, body);
    return true;
  },

  /* Every path under one prefix, as {path: body}. */
  under(prefix){
    var out = {}, map = this.map;
    Object.keys(map).forEach(function(path){
      if (path.indexOf(prefix) === 0 && map[path]) out[path] = map[path];
    });
    return out;
  },

  blobPut(id, data){ return this.backend.blobPut(id, data); },
  blobGet(id){ return this.backend.blobGet(id); },
  blobDrop(id){ return this.backend.blobDrop(id); },

  signedOut(){
    this.needSignIn = true;
    this.me = null;
    if (this.onChange) this.onChange();
  },

  /* A copy you cannot write to must not look like it saved: the write is
     refused, and the screen goes back to what is actually stored. */
  refuse(why){
    var self = this;
    clearTimeout(this._back);
    this._back = setTimeout(function(){
      toast(why || "지금은 편집할 수 없어요.", true);
      if (self.onChange) self.onChange();
    }, 120);
  },

  failed(){
    if (this._warned) return;
    this._warned = true;
    toast("저장하지 못했어요. 연결을 확인해주세요.");
    var self = this;
    setTimeout(function(){ self._warned = false; }, 8000);
  }
};

async function pick(store){
  if (location.protocol === "http:" || location.protocol === "https:"){
    var remote = new RemoteStore();
    var state = await remote.probe();
    if (state === "ok") return remote;
    if (state === "signin"){ store.needSignIn = true; return remote; }
  }
  var local = new LocalStore();
  await local.open();
  return local;
}
