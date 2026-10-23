'use strict';
const test = require('node:test');
const assert = require('node:assert');
process.env.VERCEL_ENV = 'development';
process.env.CRM_WEBHOOK_URL = 'https://crm.test/hook';
process.env.CRM_WEBHOOK_SECRET = 'secret';
const calls = [];
global.fetch = async (u, o) => { calls.push({ u, o }); return { ok: true }; };
const handler = require('../api/lead.js');

const call = (body, { method = 'POST', headers = {} } = {}) => new Promise((resolve) => {
  const res = { headers: {}, status(c) { this.code = c; return this; }, setHeader(k, v) { this.headers[k] = v; }, json(o) { resolve({ code: this.code, body: o }); } };
  handler({ method, headers: { 'content-type': 'application/json', 'x-real-ip': String(Math.random()), ...headers }, body }, res);
});
const good = () => ({ type: 'entreprise', nom: 'Jean Test', email: 'jean@acme.fr', entreprise: 'Acme', besoin: 'Cybersécurité', message: 'Nous souhaitons auditer notre application web.', delai: 'Sous 1 mois', budget: '3 000 à 7 000 €', consent: true, website: '', ts: Date.now() - 10000 });
test.beforeEach(() => { calls.length = 0; delete process.env.ALLOWED_ORIGINS; });

test('lead valide : transmis au CRM, signé, priorisé', async () => {
  const r = await call(good());
  assert.equal(r.code, 200);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].o.headers['X-Nexiea-Signature']);
  assert.equal(JSON.parse(calls[0].o.body).priority, 'chaud');
});
test('champ piège rempli : ignoré silencieusement', async () => {
  const r = await call({ ...good(), website: 'http://spam' });
  assert.equal(r.code, 200); assert.equal(calls.length, 0);
});
test('envoi trop rapide : ignoré', async () => {
  const r = await call({ ...good(), ts: Date.now() });
  assert.equal(r.code, 200); assert.equal(calls.length, 0);
});
test('email invalide, consentement absent, valeur hors liste : 400', async () => {
  assert.equal((await call({ ...good(), email: 'pas-un-email' })).code, 400);
  assert.equal((await call({ ...good(), consent: false })).code, 400);
  assert.equal((await call({ ...good(), besoin: 'Autre chose' })).code, 400);
});
test('méthode GET : 405', async () => {
  assert.equal((await call(null, { method: 'GET' })).code, 405);
});
test('origine non autorisée : 403', async () => {
  process.env.ALLOWED_ORIGINS = 'https://nexiea.fr';
  assert.equal((await call(good(), { headers: { origin: 'https://evil.example' } })).code, 403);
  assert.equal((await call(good(), { headers: { origin: 'https://nexiea.fr' } })).code, 200);
});
test('limite de débit : 429 au 6e envoi', async () => {
  let last;
  for (let i = 0; i < 6; i++) last = await call(good(), { headers: { 'x-real-ip': 'fixed-ip' } });
  assert.equal(last.code, 429);
});
