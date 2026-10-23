'use strict';
// POST /api/lead : valide, protège et transmet un lead (entreprise, consultant, équipe) au CRM via webhook.
const crypto = require('crypto');

const E = {
  besoin: ['Cybersécurité', 'Data et analyse', 'IA et machine learning', 'Développement web', 'Autre'],
  delai: ['Dès que possible', 'Sous 1 mois', '1 à 3 mois', 'Plus tard', 'Je ne sais pas'],
  budget: ['Moins de 1 000 €', '1 000 à 3 000 €', '3 000 à 7 000 €', 'Plus de 7 000 €', 'À définir ensemble'],
  source: ['Bouche-à-oreille', 'LinkedIn', 'École / étudiants', 'Événement', 'Recherche web', 'Autre'],
  competence: ['Cybersécurité', 'Data et analyse', 'IA et machine learning', 'Développement web', 'Gestion de projet', 'Autre'],
  pole: ['Qualité', 'Développement commercial', 'Communication et marketing', 'Projets et opérations', 'Finance', 'Autre'],
};
const S = (min, max, opt) => ({ k: 's', min, max, opt });
const N = (vals, opt) => ({ k: 'e', vals, opt });
const EM = { k: 'm' };
const U = { k: 'u', opt: true };
const SCHEMAS = {
  entreprise: { nom: S(2, 80), email: EM, entreprise: S(2, 120), telephone: S(5, 30, true), besoin: N(E.besoin), message: S(20, 2000), delai: N(E.delai), budget: N(E.budget), source: N(E.source, true) },
  consultant: { nom: S(2, 80), email: EM, formation: S(2, 120), competence: N(E.competence), lien: U, message: S(20, 1500) },
  equipe: { nom: S(2, 80), email: EM, formation: S(2, 120), pole: N(E.pole), lien: U, message: S(20, 1500) },
};
const FREE = /@(gmail|outlook|hotmail|yahoo|icloud|proton(mail)?|live)\./i;
const hits = new Map(); // limite de débit "best effort" par instance : voir README pour une version durable
const LIMIT = 5;
const WINDOW = 10 * 60 * 1000;

const clean = (v, multiline) => {
  if (typeof v !== 'string') return null;
  let t = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  if (!multiline) t = t.replace(/[\r\n]+/g, ' ');
  return t.trim();
};

function validate(type, body) {
  const schema = SCHEMAS[type];
  if (!schema) return { error: 'type' };
  if (body.consent !== true) return { error: 'consent' };
  const data = {};
  for (const [key, rule] of Object.entries(schema)) {
    const v = clean(body[key], key === 'message');
    if (v === null || v === '') {
      if (rule.opt) continue;
      return { error: key };
    }
    if (rule.k === 's' && (v.length < rule.min || v.length > rule.max)) return { error: key };
    if (rule.k === 'e' && !rule.vals.includes(v)) return { error: key };
    if (rule.k === 'm' && (v.length > 254 || !/^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(v))) return { error: key };
    if (rule.k === 'u') {
      try {
        const u = new URL(v);
        if (!/^https?:$/.test(u.protocol) || v.length > 200) return { error: key };
      } catch {
        return { error: key };
      }
    }
    data[key] = v;
  }
  return { data };
}

// Règle de priorité simple, à ajuster avec le développement commercial.
function priority(d) {
  let p = 0;
  p += { 'Plus de 7 000 €': 3, '3 000 à 7 000 €': 2, '1 000 à 3 000 €': 1, 'À définir ensemble': 1 }[d.budget] || 0;
  p += { 'Dès que possible': 2, 'Sous 1 mois': 2, '1 à 3 mois': 1 }[d.delai] || 0;
  if (!FREE.test(d.email)) p += 1;
  return p >= 5 ? 'chaud' : p >= 3 ? 'tiède' : 'froid';
}

function attribution(a) {
  const o = {};
  if (a && typeof a === 'object') {
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'ref']) {
      const v = clean(a[k]);
      if (v) o[k] = v.slice(0, 200);
    }
  }
  return o;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const fail = (code, msg) => res.status(code).json({ ok: false, error: msg });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(405, 'method');
  }
  const prod = process.env.VERCEL_ENV === 'production';
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (allowed.length) {
    if (!allowed.includes(req.headers.origin)) return fail(403, 'origin');
  } else if (prod) {
    return fail(500, 'config');
  }
  if (!String(req.headers['content-type'] || '').includes('application/json')) return fail(415, 'type');

  const ip = req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW);
  if (recent.length >= LIMIT) return fail(429, 'rate');
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return fail(400, 'json'); }
  }
  if (!body || typeof body !== 'object' || JSON.stringify(body).length > 20000) return fail(400, 'body');

  // Anti-bot : champ piège rempli ou envoi trop rapide -> réponse OK, rien n'est transmis.
  const age = now - Number(body.ts);
  if ((typeof body.website === 'string' && body.website.trim()) || !Number.isFinite(age) || age < 3000) {
    return res.status(200).json({ ok: true });
  }

  const { data, error } = validate(body.type, body);
  if (error) return fail(400, 'invalid_' + error);

  const lead = {
    id: crypto.randomUUID(),
    receivedAt: new Date(now).toISOString(),
    type: body.type,
    page: (clean(body.page) || '').slice(0, 100),
    attribution: attribution(body.attribution),
    fields: data,
  };
  if (body.type === 'entreprise') lead.priority = priority(data);

  const url = process.env.CRM_WEBHOOK_URL;
  if (!url) {
    if (prod) return fail(500, 'config');
    console.log('[lead:dev]', JSON.stringify(lead));
    return res.status(200).json({ ok: true });
  }
  if (!/^https:\/\//.test(url)) return fail(500, 'config');
  try {
    const raw = JSON.stringify(lead);
    const headers = { 'Content-Type': 'application/json' };
    if (process.env.CRM_WEBHOOK_SECRET) {
      headers['X-Nexiea-Signature'] = crypto.createHmac('sha256', process.env.CRM_WEBHOOK_SECRET).update(raw).digest('hex');
    }
    const r = await fetch(url, { method: 'POST', headers, body: raw, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('crm ' + r.status);
  } catch (e) {
    console.error('[lead] CRM error:', e.message);
    return fail(502, 'upstream');
  }
  return res.status(200).json({ ok: true });
};
module.exports.E = E;
