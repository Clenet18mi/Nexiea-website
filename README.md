# Site NEXIEA : outil de développement commercial

## Parcours
- **Entreprise (principal)** : Accueil / Services -> Demande de projet (3 étapes, `contact.html`) -> `/api/lead` -> CRM (webhook) -> business development.
- **Étudiant (secondaire, discret)** : lien « Rejoindre NEXIEA » (en-tête, pied de page) -> `devenir-consultant.html` ou `rejoindre-equipe.html` -> `/api/lead` -> vivier de consultants.

## Lancer en local
1. `npm i -g vercel` puis `vercel dev` (sert les pages et la fonction `api/lead.js`). Sans CRM configuré, les leads sont affichés dans la console (hors production).
2. Tests de l'API : `npm test` (Node 18+, aucune dépendance).

## Déployer (Vercel)
Importer le dossier, définir les variables de `.env.example` (`CRM_WEBHOOK_URL`, `CRM_WEBHOOK_SECRET`, `ALLOWED_ORIGINS`). En production, l'API refuse de fonctionner si elles manquent.

## Brancher le CRM
Chaque lead est envoyé en JSON au webhook : `{ id, receivedAt, type: entreprise|consultant|equipe, priority (entreprise), page, attribution{utm_*, ref}, fields{...} }`.
Compatible Zapier, Make, n8n, ou tout CRM acceptant un webhook (HubSpot, Pipedrive...). L'en-tête `X-Nexiea-Signature` (HMAC-SHA256 hex du corps brut) permet de vérifier l'origine.
Priorité (chaud / tiède / froid) : budget + délai + email non gratuit, règle dans `api/lead.js` (`priority`), à ajuster avec le développement commercial.

## Mesure
Événements poussés dans `window.dataLayer` : `cta_project`, `cta_join`, `service_select`, `form_step`, `generate_lead`. Pour ajouter un outil d'analyse, autoriser son domaine dans la CSP de `vercel.json`.

## Sécurité : points pour l'audit
- Aucune dépendance npm ni script tiers. CSP stricte, HSTS, nosniff, Referrer-Policy, Permissions-Policy (`vercel.json`). Pas de style ni de script inline.
- API : méthode et type de contenu contrôlés, origine vérifiée, listes blanches pour les champs à choix, longueurs bornées, caractères de contrôle retirés, consentement obligatoire, champ piège et délai minimum, signature HMAC vers le CRM, erreurs génériques, pas de données personnelles dans les logs de production.
- Limite connue : le limiteur de débit est en mémoire (par instance serverless). Pour une protection durable, utiliser Vercel KV/Upstash ou le pare-feu Vercel.
- À vérifier : secrets uniquement dans les variables d'environnement, CAPTCHA (Turnstile/hCaptcha) si du spam apparaît, conservation et droits RGPD côté CRM.

## À compléter avant mise en ligne
`legal.html` (mentions légales et confidentialité, marqué [À COMPLÉTER]), le domaine dans `sitemap.xml`, la validation des textes par Sara, la rémunération/avantages éventuels côté consultants.
