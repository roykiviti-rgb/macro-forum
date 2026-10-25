import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, setDoc, deleteDoc, onSnapshot, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// ---------- small helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
function svgEl(markup) { const t = document.createElement("template"); t.innerHTML = markup.trim(); return t.content.firstChild; }
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" stroke-linejoin="round"/></svg>';
const GOOGLE = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const IMG_ID = /^img[a-z0-9]{6,40}$/;
function oneLine(s, n) { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
function hash(s) { let x = 0; for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) | 0; return Math.abs(x); }

const fmtDay = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short", year: "numeric" });
const fmtFull = new Intl.DateTimeFormat("he-IL", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
function fmtShort(ts) {
  if (!ts) return "";
  const d = Date.now() - ts;
  if (d < 60e3) return "עכשיו";
  if (d < 3600e3) return "לפני " + Math.floor(d / 60e3) + " דק׳";
  return fmtDay.format(ts);
}
function fmtLong(ts) { return ts ? fmtFull.format(ts) : ""; }
function replyText(n) { return n === 0 ? "אין תגובות" : n === 1 ? "תגובה אחת" : n + " תגובות"; }
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// ---------- question types ----------
// A discussion's `ref` says which question it is about: {type, ...the fields of that type}.
const YEARS = range(2010, new Date().getFullYear() + 1).reverse();
const MOEDS = ["א", "ב", "ג"];
const TYPES = {
  exam:    { label: "מבחן",        fields: ["year", "moed", "q"] },
  lc:      { label: "מרכז למידה",  fields: ["num", "q"] },
  ex:      { label: "תרגיל",       fields: ["num", "q"] },
  general: { label: "שאלה כללית",  fields: [] },
};
const TYPE_ORDER = ["exam", "lc", "ex", "general"];
function fieldSpec(type, f) {
  switch (f) {
    case "year": return { label: "שנה", all: "כל השנים", values: YEARS, fmt: v => String(v), cmp: (a, b) => b - a };
    case "moed": return { label: "מועד", all: "כל המועדים", values: MOEDS, fmt: v => "מועד " + v + "׳", cmp: (a, b) => MOEDS.indexOf(a) - MOEDS.indexOf(b) };
    case "num": return type === "lc"
      ? { label: "מרכז למידה", all: "כל מרכזי הלמידה", values: range(1, 12), fmt: v => "מרכז למידה " + v, cmp: (a, b) => a - b }
      : { label: "תרגיל", all: "כל התרגילים", values: range(1, 10), fmt: v => "תרגיל " + v, cmp: (a, b) => a - b };
    case "q": return { label: "שאלה", all: "כל השאלות", values: range(1, 10), fmt: v => "שאלה " + v, cmp: (a, b) => a - b };
  }
}
function validField(f, v) {
  if (f === "moed") return MOEDS.includes(v) ? v : null;
  const n = Number(v);
  if (v === "" || v == null || !Number.isInteger(n)) return null;
  if (f === "year") return n >= 1990 && n <= 2100 ? n : null;
  return n >= 1 && n <= 30 ? n : null;
}
// full ref from any {type, year, moed, num, q} (strings or numbers); null when anything is missing
function toRef(p) {
  if (!p || typeof p !== "object" || !TYPES[p.type]) return null;
  const r = { type: p.type };
  for (const f of TYPES[p.type].fields) { const v = validField(f, p[f]); if (v == null) return null; r[f] = v; }
  return r;
}
const refOf = x => toRef(x && x.ref);
function refLabel(r) {
  if (!r) return "";
  if (r.type === "exam") return `מבחן ${r.year} · מועד ${r.moed}׳ · שאלה ${r.q}`;
  if (r.type === "lc") return `מרכז למידה ${r.num} · שאלה ${r.q}`;
  if (r.type === "ex") return `תרגיל ${r.num} · שאלה ${r.q}`;
  return "שאלה כללית";
}
const sameRef = (a, b) => !!a && !!b && a.type === b.type && a.type !== "general" && TYPES[a.type].fields.every(f => a[f] === b[f]);
const discussionsOn = r => S.discussions.filter(d => sameRef(refOf(d), r));
const emptyPick = () => ({ type: "", year: "", moed: "", num: "", q: "" });

// free-text filter: every typed word must appear, with or without a one-letter Hebrew prefix
const FINAL = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
function normText(s) { return String(s || "").toLowerCase().replace(/[֑-ׇ]/g, "").replace(/[״“”]/g, '"').replace(/[׳‘’`]/g, "'").replace(/[ךםןףץ]/g, c => FINAL[c]); }
const textCache = new WeakMap();
function textMatches(d, q) {
  const words = normText(q).split(/[^a-z0-9א-ת"']+/).filter(w => w.length > 1);
  if (!words.length) return true;
  let t = textCache.get(d);
  if (t == null) { t = normText(d.subject + " " + d.body); textCache.set(d, t); }
  return words.every(w => t.includes(w) || (w.length >= 4 && "והבלמשכ".includes(w[0]) && t.includes(w.slice(1))));
}

// ---------- state ----------
const S = {
  db: null, auth: null,
  auth_state: "pending", // pending | in | out | unconfigured
  me: { id: null, name: "", photo: "", isAdmin: false },
  staff: new Set(),
  discussions: [], postsBy: new Map(), loadedD: false, dbError: null,
  drafts: [], starred: new Set(),
  view: "list", threadId: null,
  f: { ...emptyPick(), text: "" },
  dupe: null,
  compose: { pick: emptyPick(), draftId: null, linkedTo: null, atts: [] },
  reply: { atts: [], fromDraft: null },
};
let unsubs = [];
const byId = id => S.discussions.find(d => d.id === id);
const signedIn = () => S.auth_state === "in";
const canPost = signedIn;
function activity(d) {
  const ps = S.postsBy.get(d.id) || [];
  const last = ps[ps.length - 1] || d;
  return { replies: ps.length, lastAt: last.createdAt, last };
}

// ---------- people ----------
function avatarFallback(seed) {
  const hue = hash(seed || "anon") % 360;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><rect width='40' height='40' rx='20' fill='hsl(${hue} 28% 58%)'/><circle cx='20' cy='16' r='7' fill='white' fill-opacity='.92'/><path d='M7 35c2-8 8-11 13-11s11 3 13 11' fill='white' fill-opacity='.92'/></svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}
const staffBadge = uid => uid && S.staff.has(uid) ? h("span", { class: "staff", text: "צוות הקורס" }) : null;
const safePhoto = u => typeof u === "string" && /^https:\/\//.test(u) ? u : "";
// item = a discussion or post: carries authorId, authorName, authorPhoto, createdAt
function personEl(item, long) {
  const img = h("img", { class: "av", alt: "", width: 34, height: 34, referrerpolicy: "no-referrer", src: safePhoto(item.authorPhoto) || avatarFallback(item.authorId) });
  img.addEventListener("error", () => { img.src = avatarFallback(item.authorId); }, { once: true });
  return h("div", { class: "person" }, img,
    h("div", { class: "txt" },
      h("span", { class: "nm" }, item.authorName || "משתתף/ת", staffBadge(item.authorId)),
      h("span", { class: "dt", text: long ? fmtLong(item.createdAt) : fmtShort(item.createdAt) })));
}

// ---------- rendering ----------
let renderQueued = false;
function renderAll() { if (renderQueued) return; renderQueued = true; queueMicrotask(() => { renderQueued = false; doRender(); }); }
function doRender() {
  renderHeader();
  if (S.view === "list") { renderFilters(); renderList(); }
  else if (S.view === "thread") renderThread();
  else renderComposeState();
  if (!$("#drafts").hidden) renderDrafts();
}
function googleBtn(label) {
  const b = h("button", { class: "btn gbtn", type: "button", onclick: login });
  b.append(svgEl(GOOGLE), document.createTextNode(label));
  return b;
}
function renderHeader() {
  const me = $("#me");
  if (signedIn()) {
    const img = h("img", { alt: "", referrerpolicy: "no-referrer", src: safePhoto(S.me.photo) || avatarFallback(S.me.id) });
    me.replaceChildren(img, h("span", { text: S.me.name || "מחובר/ת" }), staffBadge(S.me.id), h("button", { class: "btn link", type: "button", onclick: () => signOut(S.auth), text: "התנתקות" }));
    me.hidden = false;
  } else if (S.auth_state === "out") {
    me.replaceChildren(googleBtn("התחברות"));
    me.hidden = false;
  } else me.hidden = true;
  const n = S.drafts.length, c = $("#drafts-count");
  c.textContent = String(n); c.hidden = n === 0;
  $("#new-btn").hidden = !signedIn();
  $("#drafts-btn").hidden = !signedIn();
}
function loadingEl(text) { return h("div", { class: "loading" }, h("span", { class: "spin", "aria-hidden": "true" }), h("span", { text })); }
function refTag(r, clickable) {
  if (!r) return null;
  const cls = "tag t-" + r.type;
  if (!clickable) return h("span", { class: cls, text: refLabel(r) });
  return h("button", { type: "button", class: cls, title: r.type === "general" ? "כל השאלות הכלליות" : "כל הדיונים על השאלה הזו", onclick: () => showRef(r), text: refLabel(r) });
}
function starBtn(id) {
  const on = S.starred.has(id);
  const b = h("button", { type: "button", class: "star" + (on ? " on" : ""), "aria-pressed": on ? "true" : "false", "aria-label": on ? "הסרת הכוכב" : "סימון בכוכב", title: on ? "מסומן בכוכב" : "סימון בכוכב", onclick: e => { e.stopPropagation(); toggleStar(id); } });
  b.append(svgEl(STAR));
  return b;
}
function fillSelect(sel, items, current) {
  sel.replaceChildren(...items.map(([v, label]) => h("option", { value: String(v), text: label })));
  sel.value = current;
}

// filters list only values that have discussions, with counts, given the other chosen filters
function countsFor(field) {
  const m = new Map();
  for (const d of S.discussions) {
    const r = refOf(d); if (!r) continue;
    if (field !== "type") {
      if (r.type !== S.f.type) continue;
      if (TYPES[r.type].fields.some(k => k !== field && S.f[k] && String(r[k]) !== S.f[k])) continue;
    }
    const key = String(r[field]);
    m.set(key, (m.get(key) || 0) + 1);
  }
  return m;
}
function renderFilters() {
  const tc = countsFor("type");
  if (S.f.type && !tc.has(S.f.type)) tc.set(S.f.type, 0);
  fillSelect($("#f-type"), [["", "כל הסוגים"], ...TYPE_ORDER.filter(t => tc.has(t)).map(t => [t, `${TYPES[t].label} (${tc.get(t)})`])], S.f.type);
  const box = $("#f-fields");
  const fields = S.f.type ? TYPES[S.f.type].fields : [];
  if (box.dataset.type !== S.f.type) {
    box.dataset.type = S.f.type;
    box.replaceChildren(...fields.map(f => {
      const sel = h("select", { id: "f-" + f, onchange: () => { S.f[f] = sel.value; renderAll(); } });
      return h("label", { class: "sel" }, fieldSpec(S.f.type, f).label, sel);
    }));
  }
  for (const f of fields) {
    const spec = fieldSpec(S.f.type, f);
    const counts = countsFor(f);
    if (S.f[f] && !counts.has(S.f[f])) counts.set(S.f[f], 0);
    const vals = [...counts.keys()].map(v => f === "moed" ? v : Number(v)).sort(spec.cmp);
    fillSelect($("#f-" + f), [["", spec.all], ...vals.map(v => [v, `${spec.fmt(v)} (${counts.get(String(v))})`])], S.f[f]);
  }
  if ($("#f-text").value !== S.f.text) $("#f-text").value = S.f.text;
  $("#f-clear").hidden = !(S.f.type || S.f.text);
}
function filtered() {
  return S.discussions.filter(d => {
    if (S.f.type) {
      const r = refOf(d);
      if (!r || r.type !== S.f.type) return false;
      if (TYPES[r.type].fields.some(k => S.f[k] && String(r[k]) !== S.f[k])) return false;
    }
    return textMatches(d, S.f.text);
  });
}
const chosenRef = () => toRef(S.f);
function renderList() {
  const box = $("#list");
  box.replaceChildren();
  $("#filters").hidden = !signedIn() || !S.discussions.length;
  if (S.auth_state === "unconfigured") {
    box.append(h("div", { class: "gate" }, h("h2", { class: "h2", text: "האתר עוד לא מחובר ל-Firebase" }), h("p", { text: "צריך להעתיק את הגדרות הפרויקט ל-firebase-config.js. ההוראות נמצאות ב-README של הריפו." })));
    return;
  }
  if (S.auth_state === "pending") { box.append(loadingEl("טוענים…")); return; }
  if (S.auth_state === "out") {
    box.append(h("div", { class: "gate" },
      h("h2", { class: "h2", text: "התחברו כדי לראות את הדיונים" }),
      h("p", { text: "הפורום פתוח לסטודנטים של הקורס. ההתחברות היא עם חשבון Google, והשם והתמונה שלכם יופיעו ליד ההודעות שתכתבו." }),
      googleBtn("התחברות עם Google")));
    return;
  }
  if (!S.loadedD && !S.dbError) { box.append(loadingEl("טוענים את הדיונים…")); return; }
  if (S.dbError) { box.append(h("div", { class: "empty" }, h("h2", { class: "h2", text: "לא הצלחנו לטעון את הדיונים" }), h("p", { text: "רעננו את העמוד. אם זה חוזר, ייתכן שאין לחשבון הזה הרשאה לפורום." }))); return; }
  if (!S.discussions.length) {
    box.append(h("div", { class: "empty" },
      h("h2", { class: "h2", text: "עוד אין דיונים" }),
      h("p", { text: "הדיון הראשון שייפתח יופיע כאן. כל דיון משויך לשאלה במבחן, במרכז למידה או בתרגיל, כך שקל למצוא אם כבר שאלו עליה." }),
      h("button", { class: "btn primary", type: "button", onclick: () => openCompose(), text: "פתיחת הדיון הראשון" })));
    return;
  }
  const ref = chosenRef();
  const anyFilter = S.f.type || S.f.text;
  const rows = filtered().map(d => ({ d, a: activity(d) }));
  rows.sort((x, y) => (S.starred.has(y.d.id) - S.starred.has(x.d.id)) || (y.a.lastAt - x.a.lastAt));
  const about = ref ? (ref.type === "general" ? " מסוג שאלה כללית" : " על " + refLabel(ref)) : "";
  box.append(h("div", { class: "result-line" },
    h("p", { class: "muted", text: anyFilter ? (rows.length === 1 ? "נמצא דיון אחד" : `נמצאו ${rows.length} דיונים`) + ` מתוך ${S.discussions.length}${about}.` : (S.discussions.length === 1 ? "דיון אחד בפורום." : `${S.discussions.length} דיונים בפורום.`) }),
    ref ? h("button", { class: "btn ghost sm", type: "button", onclick: () => composeOn(ref), text: ref.type === "general" ? "פתיחת שאלה כללית" : "פתיחת דיון על השאלה הזו" }) : null));
  if (!rows.length) {
    box.append(h("div", { class: "empty" },
      h("p", { text: ref && ref.type !== "general" ? `עוד אין דיון על ${refLabel(ref)}.` : "אין דיונים שמתאימים לחיפוש." }),
      ref && ref.type !== "general" ? h("button", { class: "btn primary sm", type: "button", onclick: () => composeOn(ref), text: "פתיחת הדיון הראשון על השאלה" }) : null));
    return;
  }
  const table = h("div", { class: "dtable", role: "table", "aria-label": "דיונים" },
    h("div", { class: "drow dhead", role: "row" },
      h("span", { role: "columnheader" }, h("span", { class: "sr", text: "כוכב" })),
      h("span", { role: "columnheader", text: "דיון" }),
      h("span", { role: "columnheader", text: "נפתח על ידי" }),
      h("span", { role: "columnheader", text: "הודעה אחרונה" }),
      h("span", { role: "columnheader", class: "c-rep", text: "תגובות" })));
  for (const { d, a } of rows) {
    table.append(h("div", { class: "drow" + (S.starred.has(d.id) ? " starred" : ""), role: "row" },
      h("div", { class: "c-star", role: "cell" }, starBtn(d.id)),
      h("div", { class: "c-subj", role: "cell" }, refTag(refOf(d), true), h("button", { type: "button", class: "subj", onclick: () => go("thread", d.id), text: d.subject })),
      h("div", { class: "c-who", role: "cell" }, personEl(d)),
      h("div", { class: "c-last", role: "cell" }, personEl(a.last)),
      h("div", { class: "c-rep" + (a.replies === 1 ? " one" : ""), role: "cell", text: String(a.replies) })));
  }
  box.append(table);
}
function showRef(r) {
  S.f = { ...emptyPick(), text: "" };
  S.f.type = r.type;
  for (const f of TYPES[r.type].fields) S.f[f] = String(r[f]);
  go("list");
}
function discCard(d, opts = {}) {
  const a = activity(d);
  return h("div", { class: "dcard" },
    opts.plain ? h("span", { class: "subj plain", text: d.subject }) : h("button", { type: "button", class: "subj", onclick: () => go("thread", d.id), text: d.subject }),
    h("p", { class: "excerpt muted", text: oneLine(d.body, 160) }),
    h("p", { class: "dmeta", text: `${replyText(a.replies)} · פעילות אחרונה ${fmtShort(a.lastAt)}` }),
    opts.actions || null);
}
function bodyEl(text) {
  const box = h("div", { class: "body" });
  for (const para of String(text || "").split(/\n{2,}/)) {
    const p = h("p");
    para.split("\n").forEach((line, i) => {
      if (i) p.append(h("br"));
      const re = /https?:\/\/[^\s<>"']+/g; let last = 0, m;
      while ((m = re.exec(line))) {
        p.append(line.slice(last, m.index), h("a", { href: m[0], target: "_blank", rel: "noopener noreferrer", text: m[0] }));
        last = m.index + m[0].length;
      }
      p.append(line.slice(last));
    });
    box.append(p);
  }
  return box;
}

// images live in their own Firestore documents as compressed JPEG data URLs
const imgCache = new Map();
function imageData(id) {
  if (!imgCache.has(id)) {
    imgCache.set(id, getDoc(doc(S.db, "images", id)).then(s => {
      const v = s.exists() ? s.data().data : null;
      return typeof v === "string" && v.startsWith("data:image/jpeg;base64,") ? v : null;
    }).catch(() => { imgCache.delete(id); return null; }));
  }
  return imgCache.get(id);
}
function imagesEl(ids) {
  const ok = Array.isArray(ids) ? ids.filter(id => typeof id === "string" && IMG_ID.test(id)) : [];
  if (!ok.length) return null;
  return h("div", { class: "imgs" }, ok.map(id => {
    const img = h("img", { alt: "תמונה מצורפת" });
    const btn = h("button", { type: "button", class: "thumb missing", "aria-label": "הגדלת התמונה", onclick: () => { if (img.src) openLightbox(img.src); } }, img);
    imageData(id).then(src => { if (src) { img.src = src; btn.classList.remove("missing"); } });
    return btn;
  }));
}
function confirmBtn(label, fn) {
  const b = h("button", { type: "button", class: "btn link danger sm", text: label });
  let armed = false, t = 0;
  b.addEventListener("click", async () => {
    if (!armed) { armed = true; b.textContent = "בטוח? לחצו שוב"; t = setTimeout(() => { armed = false; b.textContent = label; }, 4000); return; }
    clearTimeout(t); b.disabled = true;
    try { await fn(); } finally { b.disabled = false; armed = false; b.textContent = label; }
  });
  return b;
}
function postEl(it, lead) {
  const mine = !!it.authorId && it.authorId === S.me.id;
  // the author may delete a whole discussion only while nobody else has replied (the rules block deleting others' replies)
  const othersReplied = lead && (S.postsBy.get(it.id) || []).some(p => p.authorId !== S.me.id);
  const del = S.me.isAdmin || (mine && !othersReplied)
    ? confirmBtn(lead ? "מחיקת הדיון" : "מחיקה", () => lead ? deleteDiscussion(it) : deletePost(it)) : null;
  return h("article", { class: "post " + (lead ? "lead" : "reply") },
    h("header", { class: "post-head" }, personEl(it, true), del),
    bodyEl(it.body),
    imagesEl(it.images));
}
function renderThread() {
  const box = $("#thread"), form = $("#reply-form");
  box.replaceChildren();
  const d = byId(S.threadId);
  if (!d) {
    form.hidden = true;
    if (S.auth_state === "out") box.append(h("div", { class: "gate" }, h("h2", { class: "h2", text: "התחברו כדי לראות את הדיון" }), googleBtn("התחברות עם Google")));
    else if (S.auth_state === "pending" || !S.loadedD) box.append(loadingEl("טוענים את הדיון…"));
    else box.append(h("div", { class: "empty" }, h("h2", { class: "h2", text: "הדיון לא נמצא" }), h("p", { text: "ייתכן שהוא נמחק. אפשר לחזור לרשימת הדיונים." })));
    return;
  }
  const posts = S.postsBy.get(d.id) || [];
  const r = refOf(d);
  const others = r ? discussionsOn(r).filter(x => x.id !== d.id).length : 0;
  box.append(h("div", { class: "thread-head" },
    refTag(r, true),
    h("div", { class: "th-title" }, starBtn(d.id), h("h2", { class: "h2", text: d.subject })),
    others ? h("button", { type: "button", class: "btn link sm", onclick: () => showRef(r), text: others === 1 ? "עוד דיון אחד על השאלה הזו" : `עוד ${others} דיונים על השאלה הזו` }) : null));
  for (const dr of S.drafts.filter(x => x.linkedTo === d.id)) {
    box.append(h("div", { class: "draft-note" },
      h("p", null, h("strong", { text: "שמרת כאן טיוטה: " }), "״" + oneLine(dr.subject || dr.body, 80) + "״. אם הדיון הזה לא עונה על השאלה שלך, אפשר להמשיך ממנה."),
      h("div", { class: "row-actions" },
        h("button", { class: "btn primary sm", type: "button", onclick: () => draftToReply(dr), text: "העברה לתגובה בדיון הזה" }),
        h("button", { class: "btn ghost sm", type: "button", onclick: () => openCompose(draftPrefill(dr)), text: "המשך כדיון חדש" }),
        confirmBtn("מחיקת הטיוטה", () => deleteDraft(dr.id)))));
  }
  const list = h("div", { class: "posts" }, postEl(d, true));
  list.append(h("p", { class: "replies-count" + (posts.length ? "" : " muted"), text: posts.length ? replyText(posts.length) : "עוד אין תגובות." }));
  for (const p of posts) list.append(postEl(p, false));
  box.append(list);
  form.hidden = !canPost();
}

// ---------- compose: question picker ----------
function renderTypeSeg() {
  $("#c-type").replaceChildren(...TYPE_ORDER.map(t => {
    const input = h("input", { type: "radio", name: "c-type", id: "c-type-" + t, value: t });
    input.addEventListener("change", () => setPickType(t));
    return h("label", null, input, h("span", { text: TYPES[t].label }));
  }));
}
function setPickType(t) {
  const p = S.compose.pick;
  if (p.type === t) return;
  S.compose.pick = { ...emptyPick(), type: t, q: TYPES[t].fields.includes("q") ? p.q : "" };
  showErr("c", "");
  renderPicks();
  renderExisting();
}
function renderPicks() {
  const p = S.compose.pick, box = $("#c-picks");
  $$("input[name='c-type']").forEach(i => { i.checked = i.value === p.type; });
  const fields = p.type ? TYPES[p.type].fields : [];
  box.replaceChildren(...fields.map(f => {
    const spec = fieldSpec(p.type, f);
    const sel = h("select", { id: "c-" + f, required: true, onchange: () => { S.compose.pick[f] = sel.value; showErr("c", ""); renderExisting(); } });
    fillSelect(sel, [["", "בחירה"], ...spec.values.map(v => [v, spec.fmt(v)])], p[f]);
    return h("label", { class: "sel" }, spec.label, sel);
  }));
}
const composeRef = () => toRef(S.compose.pick);
function missingLabels() {
  const p = S.compose.pick;
  if (!p.type) return ["סוג שאלה"];
  return TYPES[p.type].fields.filter(f => !p[f]).map(f => fieldSpec(p.type, f).label);
}
function joinHe(list) { return list.length < 2 ? list.join("") : list.slice(0, -1).join(", ") + " ו" + list[list.length - 1]; }
function renderExisting() {
  const box = $("#c-existing");
  const p = S.compose.pick;
  const r = composeRef();
  if (!r) {
    box.className = "existing wait";
    box.replaceChildren(h("p", { text: !p.type ? "בחרו על איזו שאלה אתם שואלים." : `בחרו ${joinHe(missingLabels())}, ונראה לכם אם כבר יש דיונים על השאלה.` }));
    return;
  }
  if (r.type === "general") {
    box.className = "existing wait";
    box.replaceChildren(h("p", { text: "שאלה כללית לא משויכת לשאלה מסוימת, ולכן אין בדיקה אם כבר שאלו עליה. כדאי לחפש במילים ברשימת הדיונים לפני שפותחים." }));
    return;
  }
  const ds = discussionsOn(r).map(d => ({ d, a: activity(d) })).sort((x, y) => y.a.lastAt - x.a.lastAt);
  if (!ds.length) {
    box.className = "existing none";
    box.replaceChildren(h("p", { text: `עוד אין דיון על ${refLabel(r)}. הדיון שלכם יהיה הראשון.` }));
    return;
  }
  box.className = "existing some";
  box.replaceChildren(
    h("p", { text: ds.length === 1 ? `כבר יש דיון על ${refLabel(r)}` : `כבר יש ${ds.length} דיונים על ${refLabel(r)}` }),
    h("p", { text: "מומלץ לקרוא אותם לפני שפותחים דיון חדש. מה שכתבתם כאן יישמר עד שתחזרו." }),
    h("ul", null, ds.map(({ d, a }) => h("li", null,
      h("button", { type: "button", class: "subj", onclick: () => go("thread", d.id), text: d.subject }),
      h("span", { class: "muted", text: " · " + replyText(a.replies) })))));
}
function renderComposeState() {
  $("#c-draftnote").hidden = !S.compose.draftId;
  $("#c-post").disabled = !canPost();
  renderExisting();
}
function renderDrafts() {
  const box = $("#drafts-list");
  box.replaceChildren();
  if (!S.drafts.length) { box.append(h("p", { class: "muted", text: "אין טיוטות שמורות. כשכבר יש דיון על השאלה שבחרתם, אפשר לשמור את מה שכתבתם כטיוטה ולחזור אליו מכאן." })); return; }
  for (const dr of S.drafts) {
    const linked = dr.linkedTo ? byId(dr.linkedTo) : null;
    box.append(h("div", { class: "draft" },
      h("div", { class: "draft-main" },
        refTag(toRef(dr.pick), false),
        h("strong", { text: dr.subject || "(בלי נושא)" }),
        h("span", { class: "muted", text: "נשמרה " + fmtShort(dr.updatedAt) + (linked ? " · ליד הדיון ״" + oneLine(linked.subject, 48) + "״" : "") }),
        dr.body ? h("p", { class: "draft-body", text: oneLine(dr.body, 150) }) : null),
      h("div", { class: "row-actions" },
        h("button", { class: "btn primary sm", type: "button", onclick: () => { closeOverlay("drafts"); openCompose(draftPrefill(dr)); }, text: "המשך עריכה" }),
        linked ? h("button", { class: "btn ghost sm", type: "button", onclick: () => { closeOverlay("drafts"); go("thread", linked.id); }, text: "לדיון הקשור" }) : null,
        confirmBtn("מחיקה", () => deleteDraft(dr.id)))));
  }
}

// ---------- navigation ----------
let hashSkip = null;
function setView(view, id) {
  if (view === "thread" && id !== S.threadId) resetReply();
  S.view = view;
  if (view === "thread") S.threadId = id;
  for (const v of ["list", "thread", "compose"]) $("#view-" + v).hidden = v !== view;
  window.scrollTo(0, 0);
  renderAll();
}
function go(view, id) {
  if (view === "compose" && !signedIn()) view = "list";
  const target = view === "list" ? "" : view === "compose" ? "new" : "d-" + id;
  setView(view, id);
  if (location.hash.replace(/^#/, "") !== target) { hashSkip = target; location.hash = target; }
}
function routeFromHash() {
  let t = "";
  try { t = decodeURIComponent(location.hash.replace(/^#/, "")); } catch {}
  if (t === "new" && signedIn()) setView("compose");
  else if (/^d-[A-Za-z0-9_-]+$/.test(t)) setView("thread", t.slice(2));
  else setView("list");
}
window.addEventListener("hashchange", () => {
  const t = location.hash.replace(/^#/, "");
  if (t === hashSkip) { hashSkip = null; return; }
  routeFromHash();
});

// ---------- overlays ----------
let lastFocus = null;
function openOverlay(id) { const o = $("#" + id); if (o.hidden) { lastFocus = document.activeElement; o.hidden = false; } }
function closeOverlay(id) { const o = $("#" + id); if (!o.hidden) { o.hidden = true; if (lastFocus && lastFocus.isConnected) lastFocus.focus(); } }
function openLightbox(src) { $("#lb-img").src = src; openOverlay("lightbox"); $("#lb-close").focus(); }
let toastT = 0;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 4200); }
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (!$("#lightbox").hidden) closeOverlay("lightbox");
  else if (!$("#drafts").hidden) closeOverlay("drafts");
  else if (S.dupe && S.dupe.state !== "publishing") closeDupe();
});

// ---------- auth ----------
async function login() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try { await signInWithPopup(S.auth, provider); }
  catch (e) {
    const code = e && e.code;
    if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") await signInWithRedirect(S.auth, provider);
    else if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") toast(code === "auth/unauthorized-domain" ? "הדומיין של האתר עוד לא אושר ב-Firebase. ראו את ה-README." : "ההתחברות נכשלה. נסו שוב.");
  }
}
function stopListeners() { for (const u of unsubs) u(); unsubs = []; }
async function onUser(user) {
  stopListeners();
  S.discussions = []; S.postsBy = new Map(); S.loadedD = false; S.dbError = null; S.drafts = []; S.starred = new Set();
  if (!user) {
    S.auth_state = "out";
    S.me = { id: null, name: "", photo: "", isAdmin: false };
    S.staff = new Set();
    resetCompose(); resetReply();
    if (S.view === "compose") go("list"); else renderAll();
    return;
  }
  S.auth_state = "in";
  S.me = { id: user.uid, name: user.displayName || user.email || "", photo: user.photoURL || "", isAdmin: false };
  // the admins list doubles as the course staff list; older rules only let people read their own entry
  unsubs.push(onSnapshot(collection(S.db, "admins"), snap => {
    S.staff = new Set(snap.docs.map(d => d.id));
    S.me.isAdmin = S.staff.has(user.uid);
    renderAll();
  }, () => {
    getDoc(doc(S.db, "admins", user.uid)).then(s => { S.me.isAdmin = s.exists(); S.staff = new Set(s.exists() ? [user.uid] : []); renderAll(); }).catch(() => {});
  }));
  startDb();
  routeFromHash();
}

// ---------- data ----------
function startDb() {
  const fail = e => { S.dbError = (e && e.code) || "unavailable"; renderAll(); };
  unsubs.push(onSnapshot(query(collection(S.db, "discussions"), orderBy("createdAt", "desc"), limit(1000)), snap => {
    S.discussions = snap.docs.map(d => ({ ...d.data(), id: d.id })).filter(d => typeof d.subject === "string");
    S.loadedD = true; renderAll();
  }, fail));
  unsubs.push(onSnapshot(query(collection(S.db, "posts"), orderBy("createdAt", "desc"), limit(1000)), snap => {
    const posts = snap.docs.map(d => ({ ...d.data(), id: d.id })).filter(p => typeof p.discussionId === "string").reverse();
    const by = new Map();
    for (const p of posts) { if (!by.has(p.discussionId)) by.set(p.discussionId, []); by.get(p.discussionId).push(p); }
    S.postsBy = by; renderAll();
  }, fail));
  unsubs.push(onSnapshot(collection(S.db, "users", S.me.id, "drafts"), snap => {
    S.drafts = snap.docs.map(d => ({ ...d.data(), id: d.id })).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    renderAll();
  }, () => {}));
  unsubs.push(onSnapshot(doc(S.db, "users", S.me.id, "prefs", "main"), snap => {
    const v = snap.exists() ? snap.data() : null;
    S.starred = new Set(v && Array.isArray(v.starred) ? v.starred : []);
    renderAll();
  }, () => {}));
}
function author() { return { authorId: S.me.id, authorName: S.me.name, authorPhoto: S.me.photo || "" }; }
function writeErr(e) {
  const c = e && e.code;
  if (c === "permission-denied") return "אין לך הרשאה לשמור את זה.";
  if (c === "resource-exhausted") return "הפורום הגיע למגבלת השימוש היומית. נסו שוב מחר.";
  if (c === "unavailable") return "אין חיבור לשרת. בדקו את האינטרנט ונסו שוב.";
  return "השמירה נכשלה. נסו שוב.";
}
async function saveDraft(d) {
  const draft = { pick: { ...emptyPick(), ...(d.pick || {}) }, subject: d.subject || "", body: d.body || "", images: d.images || [], linkedTo: d.linkedTo || null, updatedAt: Date.now() };
  await setDoc(doc(S.db, "users", S.me.id, "drafts", d.id || newId("draft")), draft);
}
async function deleteDraft(id) { try { await deleteDoc(doc(S.db, "users", S.me.id, "drafts", id)); } catch (e) { toast(writeErr(e)); } }
async function toggleStar(id) {
  const s = new Set(S.starred);
  if (s.has(id)) s.delete(id); else s.add(id);
  S.starred = s; renderAll();
  try { await setDoc(doc(S.db, "users", S.me.id, "prefs", "main"), { starred: [...s] }); } catch (e) { toast(writeErr(e)); }
}
async function deleteImages(ids) {
  for (const id of ids || []) { try { await deleteDoc(doc(S.db, "images", id)); } catch { /* someone else's image */ } }
}
async function deleteDiscussion(d) {
  try {
    for (const p of S.postsBy.get(d.id) || []) { await deleteImages(p.images); await deleteDoc(doc(S.db, "posts", p.id)); }
    await deleteImages(d.images);
    await deleteDoc(doc(S.db, "discussions", d.id));
    go("list"); toast("הדיון נמחק");
  } catch (e) { toast(writeErr(e)); }
}
async function deletePost(p) {
  try { await deleteImages(p.images); await deleteDoc(doc(S.db, "posts", p.id)); toast("התגובה נמחקה"); } catch (e) { toast(writeErr(e)); }
}

// ---------- images ----------
const MAX_ATTS = 6;
const MAX_DATA = 900000; // a Firestore document holds up to 1 MiB
const readyIds = atts => atts.filter(a => a.id).map(a => a.id);
async function compress(file) {
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  for (const side of [1600, 1200, 900, 700]) {
    const scale = Math.min(1, side / Math.max(bmp.width, bmp.height));
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    for (const q of [0.85, 0.7, 0.55]) {
      const data = canvas.toDataURL("image/jpeg", q);
      if (data.length <= MAX_DATA) return data;
    }
  }
  throw new Error("too_large");
}
function addFiles(files, which) {
  const target = which === "c" ? S.compose : S.reply;
  const imgs = [...(files || [])].filter(f => f && /^image\//.test(f.type));
  for (const f of imgs) {
    if (target.atts.length >= MAX_ATTS) { toast("אפשר לצרף עד " + MAX_ATTS + " תמונות"); break; }
    const att = { key: newId("a"), url: "", status: "uploading", id: null };
    target.atts.push(att);
    uploadAtt(f, att, which);
  }
  renderThumbs(which);
}
async function uploadAtt(file, att, which) {
  try {
    const data = await compress(file);
    att.url = data;
    renderThumbs(which);
    const id = newId("img");
    await setDoc(doc(S.db, "images", id), { data, authorId: S.me.id, createdAt: Date.now() });
    imgCache.set(id, Promise.resolve(data));
    att.id = id; att.status = "ready";
  } catch { att.status = "error"; }
  renderThumbs(which);
}
function renderThumbs(which) {
  const target = which === "c" ? S.compose : S.reply;
  $("#" + which + "-thumbs").replaceChildren(...target.atts.map(a => {
    const label = a.status === "uploading" ? "מעלה…" : a.status === "error" ? "ההעלאה נכשלה" : "";
    return h("figure", { class: "att" + (a.status === "error" ? " bad" : "") },
      a.url ? h("img", { src: a.url, alt: "תמונה מצורפת" }) : null,
      label ? h("figcaption", { text: label }) : null,
      h("button", { type: "button", class: "att-x", "aria-label": "הסרת התמונה", onclick: () => { target.atts = target.atts.filter(x => x !== a); renderThumbs(which); }, text: "×" }));
  }));
}
function attsFromIds(ids) {
  return (Array.isArray(ids) ? ids : []).filter(id => typeof id === "string" && IMG_ID.test(id)).map(id => {
    const att = { key: newId("a"), id, url: "", status: "ready" };
    imageData(id).then(src => { if (src) { att.url = src; renderThumbs("c"); renderThumbs("r"); } });
    return att;
  });
}
function bindImages(which, pasteTargets) {
  const drop = $("#" + which + "-drop"), input = $("#" + which + "-file");
  $("#" + which + "-pick").addEventListener("click", () => input.click());
  input.addEventListener("change", () => { addFiles(input.files, which); input.value = ""; });
  drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("over"); addFiles(e.dataTransfer && e.dataTransfer.files, which); });
  for (const el of pasteTargets) el.addEventListener("paste", e => {
    const files = e.clipboardData && e.clipboardData.files;
    if (files && files.length) {
      if (!e.clipboardData.getData("text/plain")) e.preventDefault();
      addFiles(files, which);
    }
  });
}

// ---------- compose ----------
function showErr(which, msg) { const e = $("#" + which + "-err"); e.textContent = msg || ""; e.hidden = !msg; }
function setPick(pick) {
  S.compose.pick = emptyPick();
  if (pick && TYPES[pick.type]) {
    S.compose.pick.type = pick.type;
    for (const f of TYPES[pick.type].fields) if (pick[f] != null && pick[f] !== "") S.compose.pick[f] = String(pick[f]);
  }
  renderPicks();
}
function resetCompose() {
  S.compose.atts = []; S.compose.draftId = null; S.compose.linkedTo = null;
  setPick(null);
  $("#c-subject").value = ""; $("#c-body").value = "";
  showErr("c", "");
  renderThumbs("c");
}
function resetReply() {
  S.reply.atts = []; S.reply.fromDraft = null;
  $("#r-body").value = ""; showErr("r", "");
  renderThumbs("r");
}
function draftPrefill(dr) { return { pick: dr.pick, subject: dr.subject, body: dr.body, images: dr.images, draftId: dr.id, linkedTo: dr.linkedTo }; }
function firstMissing() {
  const p = S.compose.pick;
  if (!p.type) return $("#c-type input");
  const f = TYPES[p.type].fields.find(k => !p[k]);
  return f ? $("#c-" + f) : null;
}
function openCompose(pre) {
  if (pre) {
    resetCompose();
    setPick(pre.pick || null);
    $("#c-subject").value = pre.subject || "";
    $("#c-body").value = pre.body || "";
    S.compose.atts = attsFromIds(pre.images);
    S.compose.draftId = pre.draftId || null;
    S.compose.linkedTo = pre.linkedTo || null;
    renderThumbs("c");
  }
  go("compose");
  setTimeout(() => { const t = firstMissing() || (!$("#c-subject").value ? $("#c-subject") : $("#c-body")); if (t) t.focus(); }, 0);
}
// opens the form on a question without wiping what was already typed
function composeOn(r) {
  if (r && !S.compose.pick.type) setPick(r);
  openCompose();
}
function composeValues() {
  return { ref: composeRef(), pick: { ...S.compose.pick }, subject: $("#c-subject").value.trim(), body: $("#c-body").value.trim() };
}
async function onComposeSubmit(e) {
  e.preventDefault();
  const v = composeValues();
  if (!v.ref) { showErr("c", "צריך לבחור " + joinHe(missingLabels()) + "."); const t = firstMissing(); if (t) t.focus(); return; }
  if (!v.subject || !v.body) { showErr("c", !v.subject ? "חסר נושא לדיון." : "חסר תוכן להודעה."); $(!v.subject ? "#c-subject" : "#c-body").focus(); return; }
  if (S.compose.atts.some(a => a.status === "uploading")) { showErr("c", "רגע, התמונות עדיין עולות."); return; }
  showErr("c", "");
  const existing = discussionsOn(v.ref);
  if (!existing.length) { await publishDiscussion(v); return; }
  openDupe({ state: "results", values: v, ids: existing.map(d => d.id) });
}
async function publishDiscussion(v) {
  const id = newId("d");
  try {
    await setDoc(doc(S.db, "discussions", id), { ref: v.ref, subject: v.subject, body: v.body, images: readyIds(S.compose.atts), ...author(), createdAt: Date.now() });
  } catch (e) { closeDupe(); showErr("c", writeErr(e)); return; }
  const draftId = S.compose.draftId;
  resetCompose();
  closeDupe();
  if (draftId) deleteDraft(draftId);
  go("thread", id);
  toast("הדיון פורסם");
}
async function draftAndGo(targetId) {
  const v = S.dupe.values;
  try { await saveDraft({ id: S.compose.draftId, pick: v.pick, subject: v.subject, body: v.body, images: readyIds(S.compose.atts), linkedTo: targetId }); }
  catch (e) { toast(writeErr(e)); return; }
  resetCompose(); closeDupe();
  go("thread", targetId);
  toast("הטיוטה נשמרה. היא מחכה לך ב׳הטיוטות שלי׳.");
}
function openDupe(st) { S.dupe = st; openOverlay("dupe"); renderDupe(); }
function closeDupe() { S.dupe = null; closeOverlay("dupe"); }
function renderDupe() {
  const st = S.dupe, sh = $("#dupe-sheet");
  if (!st) return;
  sh.replaceChildren();
  if (st.state === "publishing") {
    sh.append(h("div", { class: "checking" }, h("span", { class: "spin", "aria-hidden": "true" }), h("h3", { id: "dupe-title", text: "מפרסמים…" })));
    return;
  }
  const ds = st.ids.map(byId).filter(Boolean).map(d => ({ d, a: activity(d) })).sort((x, y) => y.a.lastAt - x.a.lastAt);
  const n = ds.length;
  sh.append(
    h("div", { style: "display:grid;gap:6px;justify-items:start" },
      refTag(st.values.ref, false),
      h("h3", { id: "dupe-title", text: n === 1 ? "כבר יש דיון על השאלה הזו" : `כבר יש ${n} דיונים על השאלה הזו` }),
      h("p", { class: "muted", text: "כדאי לבדוק אם התשובה כבר שם. אפשר לשמור את מה שכתבתם כטיוטה, לעבור לדיון ולחזור לטיוטה אם צריך." })),
    h("div", { class: "dcards" }, ds.map(({ d }) => discCard(d, {
      plain: true,
      actions: h("div", { class: "row-actions", style: "margin-top:6px" }, h("button", { class: "btn primary sm", type: "button", onclick: () => draftAndGo(d.id), text: "שמירת טיוטה ומעבר לדיון" })),
    }))),
    h("div", { class: "sheet-actions" },
      h("button", { class: "btn ghost", type: "button", onclick: async () => { const v = S.dupe.values; openDupe({ state: "publishing" }); await publishDiscussion(v); }, text: "לפתוח דיון חדש בכל זאת" }),
      h("button", { class: "btn link", type: "button", onclick: closeDupe, text: "חזרה לעריכה" })));
  const first = sh.querySelector(".btn.primary"); if (first) first.focus();
}
async function onSaveDraft() {
  const v = composeValues();
  if (!v.pick.type && !v.subject && !v.body && !S.compose.atts.length) { showErr("c", "אין עדיין מה לשמור."); return; }
  if (S.compose.atts.some(a => a.status === "uploading")) { showErr("c", "רגע, התמונות עדיין עולות."); return; }
  try { await saveDraft({ id: S.compose.draftId, pick: v.pick, subject: v.subject, body: v.body, images: readyIds(S.compose.atts), linkedTo: S.compose.linkedTo }); }
  catch (e) { showErr("c", writeErr(e)); return; }
  resetCompose(); go("list");
  toast("הטיוטה נשמרה.");
}

// ---------- replies ----------
function draftToReply(dr) {
  resetReply();
  $("#r-body").value = [dr.subject, dr.body].filter(Boolean).join("\n\n");
  S.reply.atts = attsFromIds(dr.images);
  S.reply.fromDraft = dr.id;
  renderThumbs("r");
  const f = $("#reply-form");
  f.hidden = false;
  f.scrollIntoView({ behavior: "smooth", block: "start" });
  $("#r-body").focus({ preventScroll: true });
}
async function onReply(e) {
  e.preventDefault();
  const body = $("#r-body").value.trim();
  if (!body && !readyIds(S.reply.atts).length) { showErr("r", "כתבו תגובה או צרפו תמונה."); return; }
  if (S.reply.atts.some(a => a.status === "uploading")) { showErr("r", "רגע, התמונות עדיין עולות."); return; }
  const btn = $("#r-send"); btn.disabled = true;
  try {
    await setDoc(doc(S.db, "posts", newId("p")), { discussionId: S.threadId, body, images: readyIds(S.reply.atts), ...author(), createdAt: Date.now() });
    const dr = S.reply.fromDraft;
    resetReply();
    if (dr) await deleteDraft(dr);
    toast("התגובה נשלחה");
  } catch (err) { showErr("r", writeErr(err)); }
  finally { btn.disabled = false; }
}

// ---------- wiring ----------
function bindStatic() {
  renderTypeSeg();
  renderPicks();
  $$("[data-go='list']").forEach(b => b.addEventListener("click", () => go("list")));
  $("#new-btn").addEventListener("click", () => composeOn(chosenRef()));
  $("#drafts-btn").addEventListener("click", () => { openOverlay("drafts"); renderDrafts(); $("#drafts-close").focus(); });
  $("#drafts-close").addEventListener("click", () => closeOverlay("drafts"));
  $("#drafts").addEventListener("click", e => { if (e.target.id === "drafts") closeOverlay("drafts"); });
  $("#lightbox").addEventListener("click", e => { if (e.target.id === "lightbox" || e.target.id === "lb-close") closeOverlay("lightbox"); });
  $("#f-type").addEventListener("change", () => { S.f = { ...emptyPick(), type: $("#f-type").value, text: S.f.text }; renderAll(); });
  $("#f-text").addEventListener("input", () => { S.f.text = $("#f-text").value; renderAll(); });
  $("#filters").addEventListener("submit", e => e.preventDefault());
  $("#f-clear").addEventListener("click", () => { S.f = { ...emptyPick(), text: "" }; renderAll(); });
  $("#compose-form").addEventListener("submit", onComposeSubmit);
  $("#c-cancel").addEventListener("click", () => { resetCompose(); go("list"); });
  $("#c-save").addEventListener("click", onSaveDraft);
  $("#reply-form").addEventListener("submit", onReply);
  bindImages("c", [$("#c-subject"), $("#c-body")]);
  bindImages("r", [$("#r-body")]);
}

function boot() {
  bindStatic();
  routeFromHash();
  if (!firebaseConfig || !firebaseConfig.apiKey || /PASTE/.test(firebaseConfig.apiKey)) { S.auth_state = "unconfigured"; renderAll(); return; }
  const app = initializeApp(firebaseConfig);
  S.auth = getAuth(app);
  S.db = getFirestore(app);
  onAuthStateChanged(S.auth, onUser);
}
boot();
