'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const track = (e, d = {}) => { (window.dataLayer = window.dataLayer || []).push({ event: e, ...d }); };

// En-tête et menu
const hd = $('header');
addEventListener('scroll', () => hd.classList.toggle('on', scrollY > 8), { passive: true });
const bg = $('.burger'), nv = $('nav.pill');
bg.addEventListener('click', () => { const o = nv.classList.toggle('open'); bg.setAttribute('aria-expanded', o); });
const ind = $('.ind', nv), cu = $('[aria-current]', nv);
const mv = (a) => { ind.style.width = a.offsetWidth + 'px'; ind.style.transform = 'translateX(' + a.offsetLeft + 'px)'; ind.style.opacity = 1; };
$$('a', nv).forEach((a) => a.addEventListener('mouseenter', () => mv(a)));
nv.addEventListener('mouseleave', () => (cu ? mv(cu) : (ind.style.opacity = 0)));
if (cu) { mv(cu); if (document.fonts) document.fonts.ready.then(() => mv(cu)); }

// Sélecteur de services
const tb = $$('.tab');
tb.forEach((k) => k.addEventListener('click', () => {
  tb.forEach((x) => x.setAttribute('aria-selected', x === k));
  $$('.sel .panel').forEach((p) => { p.hidden = p.id !== k.getAttribute('aria-controls'); });
  track('service_select', { label: k.textContent.trim().slice(0, 40) });
}));

// Terminal du hero
const tm = $('#term');
if (tm) {
  const L = [['cm', '$ nexiea brief --besoin "audit de sécurité de notre application web"'], ['ok', '✔ Chef de projet étudiant assigné'], ['ok', '✔ Consultants cybersécurité mobilisés'], ['ok', '✔ Livrable relu par le pôle qualité'], ['', "Livrable : rapport d'audit + plan de remédiation priorisé"]];
  const rm = matchMedia('(prefers-reduced-motion:reduce)').matches;
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  let html = '';
  (async () => {
    for (const [c, s] of L) {
      let line = '';
      for (const ch of s) { line += ch; if (!rm) await new Promise((r) => setTimeout(r, c === 'cm' ? 28 : 9)); tm.innerHTML = html + '<span class="' + c + '">' + esc(line) + '</span><i class="cur"></i>'; }
      html += '<span class="' + c + '">' + esc(s) + '</span>\n';
      if (!rm) await new Promise((r) => setTimeout(r, 320));
    }
    tm.innerHTML = html + '<i class="cur"></i>';
  })();
}

// Attribution (UTM, référent) conservée pour le CRM
try {
  const p = new URLSearchParams(location.search), u = JSON.parse(sessionStorage.getItem('nx_attr') || '{}');
  ['utm_source', 'utm_medium', 'utm_campaign'].forEach((k) => { if (p.get(k)) u[k] = p.get(k).slice(0, 100); });
  if (!u.ref && document.referrer) u.ref = document.referrer.slice(0, 200);
  sessionStorage.setItem('nx_attr', JSON.stringify(u));
} catch (e) { /* stockage indisponible : on continue sans attribution */ }
const attr = () => { try { return JSON.parse(sessionStorage.getItem('nx_attr') || '{}'); } catch (e) { return {}; } };

// Mesure des clics sur les CTA (dataLayer, branchable sur GA4 / Plausible / GTM)
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="contact.html"],a[href^="devenir-consultant"],a[href^="rejoindre-equipe"]');
  if (a) track(a.getAttribute('href').startsWith('contact') ? 'cta_project' : 'cta_join', { label: a.textContent.trim().slice(0, 60) });
});

// Formulaires (demande de projet en 3 étapes, candidatures en 1 étape)
const f = $('form[data-type]');
if (f) {
  const steps = $$('[data-step]', f), prev = $('[data-prev]', f), next = $('[data-next]', f), sub = $('[type=submit]', f), msg = $('#msg');
  let i = 0;
  f.elements.ts.value = Date.now();
  const q = new URLSearchParams(location.search).get('besoin');
  if (q && f.elements.besoin) f.elements.besoin.value = q;
  const show = (k) => {
    i = k;
    steps.forEach((s, j) => { s.hidden = j !== k; });
    if (prev) prev.hidden = k === 0;
    if (next) next.hidden = k === steps.length - 1;
    sub.hidden = k !== steps.length - 1;
    const bar = $('#bar');
    if (bar) { bar.style.width = ((k + 1) / steps.length) * 100 + '%'; $('#stepn').textContent = 'Étape ' + (k + 1) + ' sur ' + steps.length; }
  };
  const ok = () => $$('input,select,textarea', steps[i]).every((el) => el.reportValidity());
  if (next) next.addEventListener('click', () => { if (ok()) { show(i + 1); track('form_step', { step: i + 1 }); } });
  if (prev) prev.addEventListener('click', () => show(i - 1));
  show(0);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!ok()) return;
    const d = Object.fromEntries(new FormData(f));
    d.type = f.dataset.type; d.consent = f.elements.consent.checked; d.page = location.pathname; d.attribution = attr();
    sub.disabled = true; msg.textContent = 'Envoi en cours…';
    try {
      const r = await fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) });
      if (!r.ok) throw new Error(r.status);
      track('generate_lead', { type: d.type });
      f.hidden = true; const dn = $('#done'); dn.hidden = false; dn.focus();
    } catch (err) {
      sub.disabled = false;
      msg.textContent = "Envoi impossible pour le moment. Écrivez-nous à " + f.dataset.to + ".";
    }
  });
}
