// Okuma Halkası — Firebase ile ortak oturum, cihazda kişiye özel notlar.
const FB_VER = '10.12.2';
const DEFAULT_PEOPLE = ['Adem', 'Devran', 'Engin'];
const COLORS = ['#1d3485', '#0f8f8a', '#d9534f', '#8a5a14', '#5b3f9e', '#2f7d32', '#b04a8c'];

const OWNER = 'kyarslan92@gmail.com';
const S = { books: [], cats: [], quran: null, pass: {}, loading: {}, meta: {}, user: null, authReady: false, denied: false, access: null, people: null, sess: {}, loaded: false, anim: {}, seen: {}, demo: !window.HALKA_FIREBASE, fs: null };
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d } catch (e) { return d } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch (e) { } }
};
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => el.hidden = true, 3200) }

/* ---------- yardımcılar ---------- */
const people = () => S.people || DEFAULT_PEOPLE;
const me = () => { const m = ls.get('halka-me', ''); return people().includes(m) ? m : '' };
const pad3 = n => String(n).padStart(3, '0');
const arDigits = n => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
function getBook(id) {
  let m = /^sure-(\d{3})$/.exec(id);
  if (m && S.quran) { const su = S.quran.surahs[+m[1] - 1]; if (!su) return null; return { id, t: su.t + ' Sûresi', a: "Kur'an-ı Kerim · Arapça", questions: false, quranAr: su.n, q: 'ar', n: su.n, back: '#kuran' } }
  m = /^meal-([a-z0-9]+)-(\d{3})$/.exec(id);
  if (m && S.quran) { const su = S.quran.surahs[+m[2] - 1], ed = S.quran.meals.find(x => x.id === m[1]); if (!su || !ed) return null; return { id, t: su.t + ' Sûresi meali', a: ed.t, file: `content/quran/${m[1]}/${m[2]}.json`, q: 'meal', n: su.n, back: '#mealler-' + m[2] } }
  const b = S.books.find(x => x.id === id); return b ? { ...b, file: `${b.id}.json`, back: '#kat-' + b.cat } : null
}
const BK = () => new Proxy({}, { get: (_, id) => getBook(String(id)) || undefined });
function list(b) { if (!(b in S.pass)) loadBook(b); return S.pass[b] || [] }
async function loadBook(id) {
  if (S.loading[id]) return; const B = getBook(id); if (!B) return;
  if (B.remote && !S.demo && !S.fs) return;                       // Firebase hazır olunca tekrar denenir
  S.loading[id] = true;
  try {
    if (B.remote && !S.demo) {                                   // büyük kitaplar: önce sayı, sonra sadece gereken parça
      const { doc, getDoc } = S.fs, m = await getDoc(doc(S.fs.db, 'content', id));
      const meta = m.exists() ? m.data() : { count: 0, n: 80 }; S.meta[id] = { count: Number(meta.count) || 0, n: Number(meta.n) || 80, got: {} };
      S.pass[id] = new Array(S.meta[id].count); render(); return
    }
    let j;
    if (B.quranAr) { if (!S.quranAr) S.quranAr = fetch('quran-ar.json?v=' + VER).then(r => r.json()); j = { sections: (await S.quranAr)[B.quranAr] || [] } }
    else j = await (await fetch(B.file + '?v=' + VER)).json();
    S.pass[id] = (j.sections || []).map((x, i) => mapSec(B, id, x, i)).sort((a, c) => a.idx - c.idx)
  } catch (e) { console.error(e); S.pass[id] = [] }
  render()
}
const mapSec = (B, id, x, i) => ({ id: id + '-' + (x.idx || i + 1), idx: Number(x.idx) || i + 1, title: x.title ? String(x.title) : '', text: String(x.text || ''),
      ayahs: Array.isArray(x.ayahs) ? x.ayahs.map(a => [Number(a[0]), String(a[1])]) : null, kind: B.q || '',
      items: Array.isArray(x.items) ? x.items.map(it => ({ ar: String(it.ar || ''), tl: String(it.tl || ''), tr: String(it.tr || '') })) : null,
      img: Array.isArray(x.img) ? x.img.map(String).filter(u => /^content\//.test(u)) : [], q: B.questions === false ? [] : Array.isArray(x.q) ? x.q.map(String) : [] });
async function ensureChunk(id, c) {
  const M = S.meta[id]; if (!M || M.got[c] || c < 0 || c * M.n >= M.count) return; M.got[c] = 1;
  try {
    const { doc, getDoc } = S.fs, d = await getDoc(doc(S.fs.db, 'content', id, 'chunks', String(c).padStart(4, '0'))), B = getBook(id);
    const secs = d.exists() && Array.isArray(d.data().sections) ? d.data().sections : [];
    const arr = S.pass[id].slice(); secs.forEach((x, k) => { const i = c * M.n + k; if (i < arr.length) arr[i] = mapSec(B, id, x, i) }); S.pass[id] = arr; render()
  } catch (e) { M.got[c] = 0; console.error(e) }
}
function need(id, i) { const M = S.meta[id]; if (M) { const c = Math.floor(i / M.n); ensureChunk(id, c); if ((i % M.n) > M.n - 5) ensureChunk(id, c + 1) } }
const VER = Date.now();
const sess = b => S.sess[b] || {};
const solo = () => ls.get('halka-mode', 'grup') === 'tek';
const soloPos = () => ls.get('halka-solo-pos', {});
const pos = b => Math.max(0, Number(solo() ? soloPos()[b] : sess(b).pos) || 0);
function setPos(b, n) { n = Math.max(0, n); if (solo()) { const P = soloPos(); P[b] = n; ls.set('halka-solo-pos', P); render(true) } else writeSess(b, { pos: n, reader: null, spin: 0, done: {} }) }
const modeSeg = () => `<div class="seg mode" role="tablist"><button data-mode="grup" class="${solo() ? '' : 'on'}" aria-selected="${!solo()}">👥 Halka ile oku</button><button data-mode="tek" class="${solo() ? 'on' : ''}" aria-selected="${solo()}">👤 Tek başıma oku</button></div>`;
const present = b => { const s = sess(b), all = people(); return Array.isArray(s.present) ? s.present.filter(n => all.includes(n)) : all };
const col = n => { let h = 0; for (const c of String(n)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length] };
const av = n => `<span class="av" style="background:${col(n)}">${esc((String(n)[0] || '?').toLocaleUpperCase('tr'))}</span>`;
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
function assign(b, p) {
  const pr = present(b), r = rng(Number(sess(b).spin) || 1), order = [...pr];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]] }
  const q = p.q || []; return order.map((n, i) => ({ n, q: q.length ? q[i % q.length] : '' }))
}
const notes = () => ls.get('halka-notes', {});
const noteKey = (b, idx) => b + '-' + idx;

function rosette(n) {
  const k = Math.max(n, 1), R = 88, r0 = 70, pet = [];
  for (let i = 0; i < k; i++) {
    const a0 = (i / k) * 2 * Math.PI - Math.PI / 2 + 0.06, a1 = ((i + 1) / k) * 2 * Math.PI - Math.PI / 2 - 0.06;
    const p = (a, rr) => `${(100 + rr * Math.cos(a)).toFixed(1)},${(100 + rr * Math.sin(a)).toFixed(1)}`;
    pet.push(`<path d="M${p(a0, r0)} A${r0},${r0} 0 0 1 ${p(a1, r0)} L${p(a1, R)} A${R},${R} 0 0 0 ${p(a0, R)} Z" fill="#3fd2ca"/>`)
  }
  const sq = 'M100,42 L158,100 L100,158 L42,100 Z';
  return `<svg class="rosette" viewBox="0 0 200 200" role="img" aria-label="Halkada ${n} kişi">${pet.join('')}<path d="${sq}" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="2"/><path d="${sq}" transform="rotate(45 100 100)" fill="none" stroke="#3fd2ca" stroke-width="2"/><circle cx="100" cy="100" r="30" fill="#16296b" stroke="#fff" stroke-opacity=".5"/><text x="100" y="98" text-anchor="middle" fill="#fff" font-family="Amiri,serif" font-size="26" font-weight="700">${n}</text><text x="100" y="116" text-anchor="middle" fill="#fff" fill-opacity=".8" font-family="Literata,serif" font-size="11">kişi</text></svg>`
}
function hijri() { try { return new Intl.DateTimeFormat('tr-TR-u-ca-islamic', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()) } catch (e) { return '' } }
function topbar(href, label) { return `<div class="top"><div class="wrap"><a class="back" href="${href}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M15 5l-7 7 7 7"/></svg>${esc(label)}</a></div></div>` }
const demoBar = () => S.demo ? `<div class="demo">Deneme modu: Firebase ayarı girilmediği için kayıtlar sadece bu cihazda tutuluyor.</div>` : '';

/* ---------- ana menü ---------- */
function home() {
  const P = people(), m = me(), d = new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
  let h = demoBar() + `<div class="hero"><div class="wrap"><div><h1>Okuma Halkası</h1><p>${esc(d)}${hijri() ? ' · ' + esc(hijri()) : ''}</p><p>${P.map(esc).join(', ')}</p>
  <label class="me">Bu telefon:<select id="mesel"><option value="">Seç</option>${P.map(n => `<option${n === m ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label></div>${rosette(P.length)}${modeSeg()}</div></div><div class="wrap">`;
  const active = Object.keys(S.sess).filter(id => sess(id).reader && getBook(id)).slice(0, 4);
  if (active.length && !solo()) h += `<section><h2>Şu an okunanlar</h2><p class="sub">Okuyucusu seçilmiş, devam eden bölümler</p>${active.map(id => `<a class="card" href="#kaynak-${esc(id)}"><div class="row"><span class="chip">${esc(getBook(id).t)}</span><span class="msg">Okuyan: ${esc(sess(id).reader)}</span></div></a>`).join('')}</section>`;
  h += `<section><h2>Başlıklar</h2><p class="sub">${solo() ? 'Tek başına okuyorsun; ilerlemen sadece bu telefonda tutulur.' : 'Herkes aynı yeri açar; kaldığınız bölüm oradadır.'}</p><div class="cats">${S.cats.map((c, i) => `<a class="cat" style="background:${CATCOL[i % CATCOL.length]}" href="${c.id === 'kuran' ? '#kuran' : '#kat-' + esc(c.id)}"><h3>${esc(c.t)}</h3><p>${esc(c.a)}</p></a>`).join('')}</div></section>
  <section><a class="card" href="#notlar"><h3>Notlarım</h3><p class="msg">${Object.keys(notes()).length} not · sadece bu telefonda, kimse göremez</p></a>
  <a class="card" href="#kisiler"><div class="row"><span class="avs">${P.map(av).join('')}</span><h3 style="margin-left:4px">Kullanıcıları yönet</h3></div><p class="msg">Halkaya kişi ekle veya çıkar.</p></a></section>
  <p class="msg" style="margin:24px 0 36px">Okuyucu seçimi ve işaretler herkesin ekranında aynı anda görünür.</p></div>`;
  return h
}

const CATCOL = ['#1d3485', '#0f7f7a', '#7a4a12', '#4d3590'];
const emblem = (ar, c, big) => `<span class="emb${big ? ' big' : ''}" style="background:${/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#1d3485'}" lang="ar">${esc(ar || '')}</span>`;
function catView(c) {
  const C = S.cats.find(x => x.id === c); if (!C) return home();
  const items = S.books.filter(b => b.cat === c);
  let h = topbar('#ana', 'Ana sayfa') + `<div class="wrap"><section><h2>${esc(C.t)}</h2><p class="sub">${esc(C.a)}</p><div class="grid">`;
  for (const b0 of items) {
    const b = b0.alias && getBook(b0.alias) ? { ...b0, id: b0.alias } : b0;
    const L = list(b.id), p = Math.min(pos(b.id), L.length), s = sess(b.id), cur = L[p];
    const st = !(b.id in S.pass) ? 'Yükleniyor…' : !L.length ? 'Metin henüz eklenmedi' : p >= L.length ? 'Tamamlandı' : s.reader && !solo() ? `Okuyan: ${s.reader}` : `${cur ? cur.idx : p + 1}. bölüm sırada`;
    h += `<a class="book" href="#kaynak-${esc(b.id)}">${emblem(b0.ar, b0.c)}<h3>${esc(b.t)}</h3><small>${esc(b.a)}</small><small style="color:var(--lapis2);font-weight:600">${esc(st)}</small>${L.length ? `<small>${p}/${L.length} bölüm</small>` : ''}<div class="bar"><i style="width:${L.length ? Math.round(p / L.length * 100) : 0}%"></i></div></a>`
  }
  if (!items.length) h += `<div class="empty">Bu başlığın içeriği henüz eklenmedi.</div>`;
  return h + `</div></section></div>`
}

function surahList(hrefFor, title, sub, back) {
  if (!S.quran) return topbar(back, 'Geri') + `<div class="wrap"><section><div class="empty">Yükleniyor…</div></section></div>`;
  const qv = (S.qfilter || '').toLocaleLowerCase('tr');
  const rows = S.quran.surahs.filter(x => !qv || x.t.toLocaleLowerCase('tr').includes(qv) || String(x.n) === qv);
  return topbar(back, 'Geri') + `<div class="wrap"><section><h2>${esc(title)}</h2><p class="sub">${esc(sub)}</p><input type="text" id="qfilter" placeholder="Sûre ara (ad ya da numara)" value="${esc(S.qfilter || '')}">
  <div>${rows.map(x => { const id = hrefFor(x), sid = id.replace('#kaynak-', ''), ps = pos(sid);
    return `<a class="srow" href="${id}"><span class="num">${x.n}</span><span><b>${esc(x.t)}</b><small>${x.ayat} âyet · ${x.yer} · ${x.bolum} bölüm${ps ? ` · ${Math.min(ps, x.bolum)} okundu` : ''}</small></span><span class="arn" lang="ar">${esc(x.ar)}</span></a>` }).join('')}</div></section></div>`
}
const quranView = () => surahList(x => '#kaynak-sure-' + pad3(x.n), "Kur'an-ı Kerim", 'Bir sûre seçin. Okuma Arapça açılır; üstteki “Türkçe” ile tefsirlere geçebilirsiniz.', '#ana');
function mealView(arg) {
  if (!S.quran) return surahList(() => '', 'Mealler', '', '#ana');
  if (arg && /^\d{3}$/.test(arg)) { const su = S.quran.surahs[+arg - 1];
    return topbar('#kaynak-sure-' + arg, su ? su.t + ' Sûresi' : 'Geri') + `<div class="wrap"><section><h2>${esc(su ? su.t : '')} Sûresi meali</h2><p class="sub">Okumak istediğiniz meali seçin</p>${S.quran.meals.map(m => `<a class="card" href="#kaynak-meal-${m.id}-${arg}"><h3>${esc(m.t)}</h3></a>`).join('')}</section></div>` }
  if (arg && S.quran.meals.some(m => m.id === arg)) { const m = S.quran.meals.find(x => x.id === arg); return surahList(x => `#kaynak-meal-${arg}-${pad3(x.n)}`, 'Mealler', m.t, '#mealler') }
  return topbar('#ana', 'Ana sayfa') + `<div class="wrap"><section><h2>Mealler</h2><p class="sub">Önce meali, sonra sûreyi seçin</p>${S.quran.meals.map(m => `<a class="card" href="#mealler-${m.id}"><h3>${esc(m.t)}</h3></a>`).join('')}
  <p class="msg">Mealler Tanzil ve qurandatabase arşivlerinden alındı. Hangi baskıyla karşılaştırıldığına dair not için ayarlar dosyasına bakın.</p></section></div>`
}

/* ---------- giriş ---------- */
function loginView() {
  const u = S.user, mode = S.amode || 'giris';
  let h = `<div class="hero"><div class="wrap"><div><h1>Okuma Halkası</h1><p>Yalnızca davet edilen kişiler girebilir.</p></div>${rosette(3)}</div></div><div class="wrap"><section>`;
  if (u && !u.emailVerified) {
    h += `<h2>E-postanı doğrula</h2><p class="sub">${esc(u.email)} adresine bir doğrulama bağlantısı gönderdik. Bağlantıya tıkladıktan sonra aşağıdaki düğmeye bas. Gelmediyse gereksiz (spam) klasörüne bak.</p>
    <button id="vcheck" class="big primary">Doğruladım, devam et</button><button id="vsend" class="small" style="margin-top:10px">Bağlantıyı yeniden gönder</button><button id="logout" class="small" style="margin:10px 0 0 8px">Çıkış yap</button>`
  } else if (u && S.denied) {
    h += `<h2>Erişim izni bekleniyor</h2><p class="sub">${esc(u.email)} adresi henüz halkaya eklenmemiş. Yöneticiye bu e-posta adresini bildir; eklendikten sonra aşağıdaki düğmeye bas.</p>
    <button id="recheck" class="big primary">Tekrar dene</button><button id="logout" class="small" style="margin-top:10px">Çıkış yap</button>`
  } else {
    h += `<h2>${mode === 'kayit' ? 'Hesap oluştur' : 'Giriş yap'}</h2><p class="sub">${mode === 'kayit' ? 'Yöneticinin halkaya eklediği e-posta adresiyle kaydol.' : 'Halkaya eklenen e-posta adresinle giriş yap.'}</p>
    <form id="aform"><input type="text" id="aemail" inputmode="email" autocomplete="email" placeholder="E-posta" style="margin-bottom:8px">
    <input type="password" id="apass" autocomplete="${mode === 'kayit' ? 'new-password' : 'current-password'}" placeholder="Şifre (en az 6 karakter)" style="width:100%;border:1px solid var(--line);border-radius:12px;padding:10px;background:var(--paper);font-size:16px">
    <button class="big primary" type="submit" style="margin-top:12px">${mode === 'kayit' ? 'Kaydol' : 'Giriş yap'}</button></form>
    <p class="msg" id="amsg">${esc(S.amsg || '')}</p>
    <div class="row"><button id="aswitch" class="small">${mode === 'kayit' ? 'Hesabım var, giriş yap' : 'Hesabım yok, kaydol'}</button>${mode === 'giris' ? '<button id="areset" class="small">Şifremi unuttum</button>' : ''}</div>`
  }
  return h + `</section></div>`
}
const AERR = { 'auth/invalid-credential': 'E-posta ya da şifre hatalı.', 'auth/wrong-password': 'Şifre hatalı.', 'auth/user-not-found': 'Bu e-postayla hesap yok; önce kaydol.', 'auth/email-already-in-use': 'Bu e-postayla zaten hesap var; giriş yap.', 'auth/weak-password': 'Şifre en az 6 karakter olmalı.', 'auth/invalid-email': 'E-posta adresi geçersiz.', 'auth/too-many-requests': 'Çok fazla deneme yapıldı; biraz sonra tekrar dene.', 'auth/network-request-failed': 'İnternet bağlantısı yok.' };
const aerr = e => AERR[e && e.code] || 'İşlem yapılamadı. ' + ((e && e.code) || '');

/* ---------- kullanıcılar ---------- */
function usersView() {
  const P = people();
  return topbar('#ana', 'Ana sayfa') + `<div class="wrap"><section><h2>Kullanıcıları yönet</h2><p class="sub">Halkadaki kişiler. Okuyucu seçimi ve sorular bu listeye göre yapılır.</p>
  ${P.map((n, i) => `<div class="urow">${av(n)}<b>${esc(n)}</b><button class="small" data-del="${i}">Çıkar</button><button class="small" data-delok="${i}" hidden style="background:var(--coral);color:#fff;border-color:var(--coral)">Eminim</button></div>`).join('') || '<div class="empty">Listede kimse yok.</div>'}
  <form id="uform" class="row" style="margin-top:14px;flex-wrap:nowrap"><input type="text" id="uname" placeholder="Yeni kişinin adı" maxlength="30" style="margin:0"><button class="primary" type="submit">Ekle</button></form>
  ${isOwner() ? `<h2 style="margin-top:30px">Erişim izni</h2><p class="sub">Uygulamaya yalnızca bu e-posta adresleri girebilir. Arkadaşın bu adresle kaydolup e-postasını doğrulayınca içerik açılır.</p>
  ${(S.access || []).map((e, i) => `<div class="urow"><b style="font-weight:400">${esc(e)}</b><button class="small" data-adel="${i}">Kaldır</button></div>`).join('') || '<div class="empty">Henüz kimse eklenmedi.</div>'}
  <form id="acform" class="row" style="margin-top:10px;flex-wrap:nowrap"><input type="text" id="acmail" inputmode="email" placeholder="arkadas@ornek.com" style="margin:0"><button class="primary" type="submit">Ekle</button></form>
  <p class="msg" style="margin-top:20px"><a href="#yukle">İçerik yükle (yönetici)</a></p>` : ''}
  ${S.user ? `<p class="msg" style="margin-top:24px">Giriş: ${esc(S.user.email)} · <a href="#" id="logout2">Çıkış yap</a></p>` : ''}</section></div>`
}

/* ---------- ortak okuma ekranı ---------- */
function sessionView(b) {
  const B = BK()[b]; if (!B) return home();
  const L = list(b), p = Math.min(pos(b), L.length), cur = L[p], s = sess(b), pr = present(b), all = people(), m = me();
  if (!(b in S.pass)) return topbar(B.back || '#ana', 'Geri') + `<div class="wrap"><section><div class="empty">Yükleniyor…</div></section></div>`;
  let h = topbar(B.back || '#ana', 'Geri') + (B.q === 'ar' ? `<div class="wrap"><div class="seg" role="tablist"><button class="on" aria-selected="true">Arapça</button><button id="totr">Türkçe (tefsir)</button></div>` : '') + `<div class="wrap">${modeSeg()}</div><div class="wrap"><section style="padding-top:6px"><div class="row"><span class="chip">${esc(B.t)}</span><span class="msg">${cur ? cur.idx + '. bölüm' : ''} · ${p}/${L.length}</span><a class="msg" style="margin-left:auto" href="#icerik-${esc(b)}">Tüm bölümler</a></div>${B.q === 'meal' ? `<p class="msg" style="margin:6px 0 0">${esc(B.a)}</p>` : ''}`;
  if (!cur && p < L.length) { need(b, p); return h + `<div class="empty" style="margin-top:16px">Bölüm yükleniyor…</div></section></div>` }
  need(b, p);
  if (!cur) return h + `<div class="empty" style="margin-top:16px">${L.length ? 'Bu kaynağın tüm bölümleri okundu. Allah kabul etsin.' : 'Bu kaynağa henüz metin eklenmedi.'}</div>${p > 0 ? `<button id="prev" class="small" style="margin-top:12px">← Son bölüme geri dön</button>` : ''}</section></div>`;
  if (solo()) {
    h += `<p class="msg" style="margin:8px 0 0">👤 Tek başına okuma · ilerlemen sadece bu telefonda</p>` + body(cur);
    if (B.questions !== false && cur.q && cur.q.length) h += `<div class="step" style="margin-top:22px"><i>?</i>Kendine sor</div><ol class="qa">${cur.q.map(q => `<li>${esc(q)}</li>`).join('')}</ol>`;
    const nk = noteKey(b, cur.idx), mine = (notes()[nk] || {}).t || '';
    h += `<div class="step" style="margin-top:24px"><i>✎</i>Not ekle <span class="msg">(sadece sen görürsün)</span></div><textarea id="note" placeholder="Bu bölümden aklında kalan, sonra dönmek istediğin…">${esc(mine)}</textarea><button id="savenote" class="small" style="margin-top:8px">Notu kaydet</button>`;
    h += `<button id="next" class="big primary" style="margin-top:20px">Okudum, sıradakine geç</button>`;
    return h + `<div class="row" style="margin:26px 0 40px">${p > 0 ? `<button id="prev" class="small">← Önceki bölüme dön</button>` : ''}</div></section></div>`
  }
  const done = s.done && typeof s.done === 'object' ? s.done : {}, allDone = pr.length > 0 && pr.every(n => done[n]);
  const noQ = B.questions === false, st = !s.reader ? 1 : allDone ? 3 : 2, an = S.anim[b];
  const stepH = (k, t) => `<div class="step ${st === k ? 'cur' : ''}"><i>${k}</i>${t}</div>`;
  h += stepH(1, 'Kimler burada?') + `<div class="people">${all.map(n => `<button data-pres="${esc(n)}" class="${pr.includes(n) ? 'on' : 'off'}" aria-pressed="${pr.includes(n)}">${av(n)}${esc(n)}</button>`).join('')}</div>`;
  h += `<div class="slot ${an ? 'spin' : ''}"><small>${s.reader || an ? 'Bugün okuyan' : 'Okuyucu henüz seçilmedi'}</small><b id="slotname">${esc(an ? an.show : (s.reader || '—'))}</b></div>`;
  h += `<button id="pick" class="big ${s.reader ? '' : 'primary'}" ${pr.length ? '' : 'disabled'}>${s.reader ? 'Yeniden rastgele seç' : 'Rastgele okuyucu seç'}</button>`;
  if (s.reader && !an) {
    h += stepH(2, `${esc(s.reader)} okuyor, herkes takip ediyor`) + body(cur);
    h += `<p class="sub" style="margin-top:14px">Okuma bitince herkes kendi adına dokunsun</p><div class="people">${pr.map(n => `<button data-done="${esc(n)}" class="${done[n] ? 'on' : ''}" aria-pressed="${!!done[n]}">${av(n)}${esc(n)} ${done[n] ? '✓' : ''}</button>`).join('')}</div>`;
    if (!allDone) h += `<button id="alldone" class="small">Hepsi tamamladı</button>`;
    if (allDone && !noQ) {
      const qa = assign(b, cur);
      h += stepH(3, 'Herkes kendi sorusunu cevaplasın') + (cur.q && cur.q.length
        ? `<ol class="qa">${qa.map(x => `<li class="${x.n === m ? 'mine' : ''}"><div class="who">${av(x.n)}${esc(x.n)}${x.n === m ? ' (sen)' : ''}</div>${esc(x.q)}</li>`).join('')}</ol>${pr.length > cur.q.length ? `<p class="msg">Kişi sayısı soru sayısından fazla olduğu için bazı sorular tekrar edildi.</p>` : ''}`
        : `<div class="empty">Bu bölüm için soru yok.</div>`);
    }
    const nk = noteKey(b, cur.idx), mine = (notes()[nk] || {}).t || '';
    h += `<div class="step" style="margin-top:24px"><i>✎</i>Not ekle <span class="msg">(sadece sen görürsün)</span></div><textarea id="note" placeholder="Bu bölümden aklında kalan, sonra dönmek istediğin…">${esc(mine)}</textarea><button id="savenote" class="small" style="margin-top:8px">Notu kaydet</button>`;
    if (allDone) h += `<button id="next" class="big primary" style="margin-top:20px">Bölümü bitir, sıradakine geç</button>`;
  }
  h += `<div class="row" style="margin:26px 0 40px">${p > 0 ? `<button id="prev" class="small">← Önceki bölüme dön</button>` : ''}</div></section></div>`;
  return h
}

function contentsView(b) {
  const B = BK()[b]; if (!B) return home();
  const L = list(b), p = pos(b); need(b, p);
  let h = topbar('#kaynak-' + b, B.t) + `<div class="wrap"><section><h2>${esc(B.t)}</h2><p class="sub">${esc(B.a)} · ${L.length} bölüm · ${Math.min(p, L.length)} bölüm okundu</p><div class="list">`;
  L.forEach((x, i) => { h += `<a href="#kaynak-${esc(b)}" data-goto="${i}"><span class="num">${x.idx}</span><span class="t">${i === p ? '<span class="here">Sıradaki bölüm</span>' : ''}<div>${esc(x.title || x.text || (x.items && x.items[0] && x.items[0].tr) || '')}</div></span><span class="${i < p ? 'ok' : 'no'}">${i < p ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M5 12l5 5 9-10"/></svg>' : ''}</span></a>` });
  if (S.meta[b]) h += `<p class="msg">Büyük kitaplarda yalnızca kaldığınız yerin çevresindeki bölümler listelenir.</p>`;
  return h + `</div><p class="msg" style="margin:14px 0 40px">${solo() ? 'Bir bölüme dokunursan sen o bölümden devam edersin (sadece bu telefonda).' : 'Bir bölüme dokunursan halka o bölümden devam eder (herkeste değişir).'}</p></section></div>`
}

function isOwner() { return !!(S.user && S.user.emailVerified && S.user.email === OWNER) }
function uploadView() {
  return topbar('#kisiler', 'Geri') + `<div class="wrap"><section><h2>İçerik yükle</h2><p class="sub">Claude'un hazırladığı kitap dosyalarını (ör. riyaz.json) seçin. Metinler herkese açık sitede değil, yalnızca uygulamanın ortak kaydında (Firebase) tutulur.</p>
  ${S.demo ? '<div class="empty">Önce Firebase ayarı girilmeli.</div>' : `<input type="file" id="upf" accept=".json,application/json" multiple><button id="upgo" class="big primary" style="margin-top:12px">Yükle</button><p class="msg" id="upmsg">${esc(S.upmsg || '')}</p>`}</section></div>`
}
async function uploadFiles(files) {
  const msg = { set textContent(t) { S.upmsg = t; const e = $('#upmsg'); if (e) e.textContent = t } }, { doc, writeBatch } = S.fs, ids = new Set(S.books.map(b => b.id));
  for (const f of files) {
    const id = f.name.replace(/\.json$/i, '');
    if (!ids.has(id)) { msg.textContent = `${f.name}: bilinmeyen kitap adı, atlandı.`; continue }
    let j; try { j = JSON.parse(await f.text()) } catch (e) { msg.textContent = `${f.name}: dosya okunamadı.`; continue }
    const secs = Array.isArray(j.sections) ? j.sections : []; const N = 80, chunks = Math.ceil(secs.length / N);
    for (let k = 0; k < chunks; k += 10) {
      const batch = writeBatch(S.fs.db);
      for (let c = k; c < Math.min(chunks, k + 10); c++) batch.set(doc(S.fs.db, 'content', id, 'chunks', String(c).padStart(4, '0')), { sections: secs.slice(c * N, (c + 1) * N) });
      await batch.commit(); msg.textContent = `${f.name}: ${Math.min(chunks, k + 10)}/${chunks} parça yüklendi…`
    }
    { const batch = writeBatch(S.fs.db); batch.set(doc(S.fs.db, 'content', id), { count: secs.length, n: N, at: Date.now() }); await batch.commit() }
    delete S.pass[id]; delete S.loading[id]; delete S.meta[id]; msg.textContent = `${f.name}: ${secs.length} bölüm yüklendi.`
  }
}

function notesView() {
  const N = notes(), B = BK(), keys = Object.keys(N).sort((a, b) => (N[b].at || 0) - (N[a].at || 0));
  let h = topbar('#ana', 'Ana sayfa') + `<div class="wrap"><section><h2>Notlarım</h2><p class="sub">Notlar sadece bu telefonda saklanır; kimse göremez. Uygulamayı silersen notlar da silinir, bu yüzden ara sıra kopyalayıp saklayabilirsin.</p>`;
  if (!keys.length) h += `<div class="empty">Henüz not yok. Okuma ekranındaki “Not ekle” ile yazabilirsin.</div>`;
  for (const k of keys) { const n = N[k]; h += `<div class="note"><b>${esc((B[n.book] || {}).t || n.book)} · ${esc(n.idx)}. bölüm</b>${esc(n.t)}</div>` }
  if (keys.length) h += `<button id="copynotes" class="small" style="margin-top:10px">Tüm notları kopyala</button>`;
  return h + `</section></div>`
}

function body(x) {
  let h = `<div class="text">${x.title ? `<h3 style="margin-bottom:12px">${esc(x.title)}</h3>` : ''}`;
  if (x.ayahs && x.kind === 'ar') h += `<p class="ayet" dir="rtl" lang="ar">${x.ayahs.map(([n, t]) => `${esc(t)} <span class="no">﴿${arDigits(n)}﴾</span>`).join(' ')}</p>`;
  else if (x.ayahs) h += `<div class="meal">${x.ayahs.map(([n, t]) => `<p><b>${n}.</b> ${esc(t)}</p>`).join('')}</div>`;
  if (x.items) h += x.items.map(it => `<div class="dua">${it.ar ? `<p class="ayet" dir="rtl" lang="ar">${esc(it.ar)}</p>` : ''}${it.tl ? `<p class="okunus">${esc(it.tl)}</p>` : ''}${it.tr ? `<p class="meal1">${esc(it.tr)}</p>` : ''}</div>`).join('');
  if (x.text) h += String(x.text).split(/\n+/).map(t => `<p dir="auto">${esc(t)}</p>`).join('');
  if (x.img.length) h += x.img.map((u, i) => `<img src="${esc(u)}" alt="${esc(x.title || 'Sayfa')} ${i + 1}" loading="lazy" style="display:block;width:100%;height:auto;margin:0 0 12px;border-radius:8px">`).join('');
  return h + `</div>`
}

/* ---------- seçim animasyonu ---------- */
function animate(b, names) {
  if (S.anim[b]) return; const pool = names.length ? names : ['—']; let k = 0; const t0 = Date.now();
  S.anim[b] = { show: pool[0] }; render(true);
  const tick = () => {
    k++; S.anim[b].show = pool[k % pool.length]; const el = $('#slotname'); if (el) el.textContent = S.anim[b].show;
    const dt = Date.now() - t0; if (dt < 2200) setTimeout(tick, 60 + dt / 14); else { delete S.anim[b]; render(true) }
  }; setTimeout(tick, 60)
}

/* ---------- kayıt katmanı (Firebase ya da deneme modu) ---------- */
const store = {
  async setSess(b, full) { if (S.demo) { S.sess[b] = full; ls.set('halka-demo-sess', S.sess); render(true); return } const { doc, setDoc } = S.fs; await setDoc(doc(S.fs.db, 'sessions', b), full) },
  async setDone(b, n, v) { if (S.demo) { const s = sess(b); S.sess[b] = { ...s, done: { ...(s.done || {}), [n]: v } }; ls.set('halka-demo-sess', S.sess); render(true); return } const { doc, updateDoc, FieldPath } = S.fs; await updateDoc(doc(S.fs.db, 'sessions', b), new FieldPath('done', n), v) },
  async setPeople(P) { if (S.demo) { S.people = P; ls.set('halka-demo-people', P); render(true); return } const { doc, setDoc } = S.fs; await setDoc(doc(S.fs.db, 'group', 'people'), { names: P }) }
};
let wq = Promise.resolve();
const enqueue = fn => (wq = wq.then(fn).catch(e => { console.error(e); toast('Kaydedilemedi; internet bağlantını kontrol et.') }));
const full = (b, data) => ({ pos: Math.max(0, Number(sess(b).pos) || 0), present: present(b), reader: sess(b).reader || null, spin: Number(sess(b).spin) || 0, done: sess(b).done || {}, ...data });
function writeSess(b, data) { const f = full(b, data); S.sess = { ...S.sess, [b]: f }; render(true); enqueue(() => store.setSess(b, f)) }

/* ---------- çizim ve olaylar ---------- */
const view = () => (location.hash || '#ana').slice(1);
function render(force) {
  const v = view(), a = document.activeElement;
  if (!force && a && (a.id === 'uname' || a.id === 'note' || a.id === 'qfilter' || a.id === 'acmail')) return;
  const y = window.scrollY; let h;
  if (!S.demo && (!S.authReady)) { $('#app').innerHTML = `<div class="hero"><div class="wrap"><div><h1>Okuma Halkası</h1><p>Yükleniyor…</p></div></div></div>`; return }
  if (!S.demo && (!S.user || !S.user.emailVerified || S.denied)) { if (!force && a && /^(aemail|apass)$/.test(a.id)) return; $('#app').innerHTML = loginView(); bindLogin(); return }
  if (v.startsWith('kaynak-')) h = sessionView(v.slice(7)); else if (v.startsWith('icerik-')) h = contentsView(v.slice(7));
  else if (v === 'kuran') h = quranView(); else if (v === 'mealler' || v.startsWith('mealler-')) h = mealView(v.slice(8));
  else if (v.startsWith('kat-')) h = catView(v.slice(4));
  else if (v === 'kisiler') h = usersView(); else if (v === 'yukle') h = uploadView(); else if (v === 'notlar') h = notesView(); else h = home();
  $('#app').innerHTML = h; window.scrollTo(0, y); bind()
}
function bind() {
  const v = view();
  $('#totr') && ($('#totr').onclick = () => { location.hash = '#kat-tefsirler' });
  const qf = $('#qfilter'); if (qf) qf.oninput = () => { S.qfilter = qf.value; const pos0 = qf.selectionStart; render(true); const n = $('#qfilter'); n.focus(); n.setSelectionRange(pos0, pos0) };
  document.querySelectorAll('[data-mode]').forEach(el => el.onclick = () => { ls.set('halka-mode', el.dataset.mode); render(true) });
  $('#mesel') && ($('#mesel').onchange = e => { ls.set('halka-me', e.target.value); render(true) });
  if (v.startsWith('kaynak-')) {
    const b = v.slice(7), L = list(b), cur = L[Math.min(pos(b), L.length)];
    document.querySelectorAll('[data-pres]').forEach(el => el.onclick = () => { const n = el.dataset.pres, pr = new Set(present(b)); pr.has(n) ? pr.delete(n) : pr.add(n); writeSess(b, { present: people().filter(x => pr.has(x)) }) });
    $('#pick') && ($('#pick').onclick = () => {
      const pr = present(b); if (!pr.length) return; const s = sess(b);
      const cand = pr.length > 1 && s.reader ? pr.filter(n => n !== s.reader) : pr, r = cand[Math.floor(Math.random() * cand.length)], spin = Date.now();
      S.seen[b] = spin; const f = full(b, { reader: r, spin, done: {}, present: pr }); S.sess = { ...S.sess, [b]: f };
      animate(b, pr); enqueue(() => store.setSess(b, f))
    });
    document.querySelectorAll('[data-done]').forEach(el => el.onclick = () => { const n = el.dataset.done, val = !(sess(b).done || {})[n]; const s = sess(b); S.sess = { ...S.sess, [b]: { ...s, done: { ...(s.done || {}), [n]: val } } }; render(true); enqueue(() => store.setDone(b, n, val)) });
    $('#alldone') && ($('#alldone').onclick = () => writeSess(b, { done: Object.fromEntries(present(b).map(n => [n, true])) }));
    $('#next') && ($('#next').onclick = () => { setPos(b, pos(b) + 1); window.scrollTo(0, 0) });
    $('#prev') && ($('#prev').onclick = () => setPos(b, pos(b) - 1));
    $('#savenote') && cur && ($('#savenote').onclick = () => {
      const t = ($('#note').value || '').trim(), N = notes(), k = noteKey(b, cur.idx);
      if (t) N[k] = { t: t.slice(0, 4000), at: Date.now(), book: b, idx: cur.idx }; else delete N[k];
      ls.set('halka-notes', N); $('#note').blur(); toast(t ? 'Not kaydedildi' : 'Not silindi')
    });
  }
  if (v.startsWith('icerik-')) { const b = v.slice(7); document.querySelectorAll('[data-goto]').forEach(el => el.onclick = () => setPos(b, +el.dataset.goto)) }
  if (v === 'notlar' && $('#copynotes')) $('#copynotes').onclick = async () => {
    const N = notes(), B = BK(); const txt = Object.values(N).map(n => `${(B[n.book] || {}).t || n.book} — ${n.idx}. bölüm\n${n.t}`).join('\n\n');
    try { await navigator.clipboard.writeText(txt); toast('Notlar kopyalandı') } catch (e) { toast('Kopyalanamadı') }
  };
  if (v === 'yukle' && $('#upgo')) $('#upgo').onclick = async () => { const f = $('#upf').files; if (!f.length) { toast('Dosya seçin.'); return } $('#upgo').disabled = true; try { await uploadFiles([...f]) } catch (e) { console.error(e); $('#upmsg').textContent = 'Yükleme durdu: ' + (e.code || e.message) } $('#upgo').disabled = false };
  if (v === 'kisiler') {
    $('#logout2') && ($('#logout2').onclick = e => { e.preventDefault(); S.authApi.signOut(S.authApi.auth) });
    document.querySelectorAll('[data-adel]').forEach(el => el.onclick = () => { const L = [...(S.access || [])]; L.splice(+el.dataset.adel, 1); S.access = L; render(true); enqueue(() => S.fs.setDoc(S.fs.doc(S.fs.db, 'group', 'access'), { emails: L })) });
    $('#acform') && ($('#acform').onsubmit = e => { e.preventDefault(); const m = ($('#acmail').value || '').trim().toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m)) { toast('Geçerli bir e-posta yaz.'); return } const L = [...new Set([...(S.access || []), m])]; S.access = L; $('#acmail').value = ''; $('#acmail').blur(); render(true); enqueue(() => S.fs.setDoc(S.fs.doc(S.fs.db, 'group', 'access'), { emails: L })) });
    document.querySelectorAll('[data-del]').forEach(el => el.onclick = () => { el.hidden = true; $(`[data-delok="${el.dataset.del}"]`).hidden = false });
    document.querySelectorAll('[data-delok]').forEach(el => el.onclick = () => { const P = [...people()]; P.splice(+el.dataset.delok, 1); S.people = P; render(true); enqueue(() => store.setPeople(P)) });
    $('#uform').onsubmit = e => {
      e.preventDefault(); const n = $('#uname').value.trim().replace(/\s+/g, ' ').slice(0, 30); if (!n) return;
      if (people().some(x => x.toLocaleLowerCase('tr') === n.toLocaleLowerCase('tr'))) { toast('Bu isim zaten listede.'); return }
      const P = [...people(), n]; S.people = P; $('#uname').value = ''; $('#uname').blur(); render(true); enqueue(() => store.setPeople(P))
    }
  }
}
function bindLogin() {
  const A = S.authApi;
  $('#aswitch') && ($('#aswitch').onclick = () => { S.amode = S.amode === 'kayit' ? 'giris' : 'kayit'; S.amsg = ''; render(true) });
  $('#areset') && ($('#areset').onclick = async () => { const em = ($('#aemail').value || '').trim(); if (!em) { S.amsg = 'Önce e-posta adresini yaz.'; render(true); return } try { await A.sendPasswordResetEmail(A.auth, em); S.amsg = 'Şifre sıfırlama bağlantısı gönderildi.' } catch (e) { S.amsg = aerr(e) } render(true) });
  $('#aform') && ($('#aform').onsubmit = async e => {
    e.preventDefault(); const em = ($('#aemail').value || '').trim().toLowerCase(), pw = $('#apass').value || ''; S.amsg = 'Bekleyin…'; $('#amsg').textContent = S.amsg;
    try { if (S.amode === 'kayit') { const c = await A.createUserWithEmailAndPassword(A.auth, em, pw); await A.sendEmailVerification(c.user) } else await A.signInWithEmailAndPassword(A.auth, em, pw); S.amsg = '' } catch (err) { S.amsg = aerr(err); render(true) }
  });
  $('#vsend') && ($('#vsend').onclick = async () => { try { await A.sendEmailVerification(A.auth.currentUser); toast('Bağlantı tekrar gönderildi') } catch (e) { toast(aerr(e)) } });
  $('#vcheck') && ($('#vcheck').onclick = async () => { await A.auth.currentUser.reload(); await A.auth.currentUser.getIdToken(true); S.user = A.auth.currentUser; if (!S.user.emailVerified) { toast('Henüz doğrulanmamış görünüyor.'); render(true) } else afterLogin() });
  $('#recheck') && ($('#recheck').onclick = () => afterLogin());
  $('#logout') && ($('#logout').onclick = () => A.signOut(A.auth));
}

addEventListener('hashchange', () => { render(true); window.scrollTo(0, 0) });

/* ---------- açılış ---------- */
async function loadContent() {
  const j = await (await fetch('books.json?v=' + VER)).json();
  S.cats = j.cats || []; S.books = j.books || [];
  try { S.quran = await (await fetch('quran-index.json?v=' + VER)).json() } catch (e) { S.quran = null }
}
let unsubs = [];
async function startFirebase() {
  const base = `https://www.gstatic.com/firebasejs/${FB_VER}/`;
  const [{ initializeApp }, fs, au] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-firestore.js'), import(base + 'firebase-auth.js')]);
  const app = initializeApp(window.HALKA_FIREBASE);
  const auth = au.getAuth(app); S.authApi = { ...au, auth };
  const db = fs.getFirestore(app); S.fs = { ...fs, db };
  au.onAuthStateChanged(auth, u => { S.user = u; S.authReady = true; S.denied = false; unsubs.forEach(f => f()); unsubs = []; S.sess = {}; S.pass = {}; S.loading = {}; S.meta = {}; if (u && u.emailVerified) afterLogin(); else render(true) });
}
async function afterLogin() {
  const { db, ...fs } = S.fs; S.denied = false;
  try { const a = await fs.getDoc(fs.doc(db, 'group', 'access')); S.access = a.exists() && Array.isArray(a.data().emails) ? a.data().emails.map(String) : [] }
  catch (e) { if (e && e.code === 'permission-denied') { S.denied = true; render(true); return } console.error(e) }
  unsubs.forEach(f => f()); unsubs = [];
  unsubs.push(fs.onSnapshot(fs.collection(db, 'sessions'), snap => {
    const m = {}; snap.forEach(d => { const x = d.data() || {}; m[d.id] = { pos: Number(x.pos) || 0, present: Array.isArray(x.present) ? x.present.map(String) : undefined, reader: x.reader ? String(x.reader) : null, spin: Number(x.spin) || 0, done: x.done && typeof x.done === 'object' ? x.done : {} } });
    const fresh = []; for (const b in m) { const sp = m[b].spin; if (sp && m[b].reader && S.seen[b] !== undefined && S.seen[b] !== sp) fresh.push(b); S.seen[b] = sp }
    S.sess = m; render(); for (const b of fresh) if (view() === 'kaynak-' + b) animate(b, present(b))
  }, e => { console.error(e); if (e.code === 'permission-denied') { S.denied = true; render(true) } }));
  unsubs.push(fs.onSnapshot(fs.doc(db, 'group', 'people'), d => { const x = d.exists() ? d.data() : null; S.people = x && Array.isArray(x.names) ? x.names.map(String).filter(Boolean) : null; render() }, e => console.error(e)));
  render(true)
}
(async () => {
  render(true);
  try { await loadContent() } catch (e) { toast('Metinler yüklenemedi; internet bağlantını kontrol et.') }
  if (S.demo) { S.sess = ls.get('halka-demo-sess', {}); S.people = ls.get('halka-demo-people', null) }
  S.loaded = true; render(true);
  if (!S.demo) { try { await startFirebase() } catch (e) { console.error(e); S.authReady = true; toast('Firebase bağlantısı kurulamadı; internet bağlantını kontrol et.'); render(true) } }
})();
