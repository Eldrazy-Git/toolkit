// Exécution des outils HTML dans Toolkit.
//
// Chaque outil est servi par le protocole interne « toolkit-outil://<hote>/... » :
// - <hote> est stable (dérivé de l'identifiant du projet), donc l'origine de la page ne
//   change jamais et localStorage / IndexedDB sont conservés d'une session à l'autre ;
// - chaque outil a sa propre partition persistante « persist:outil-<hote> »
//   (stockée dans donnees/electron/Partitions/) : les outils ne voient pas les données
//   des autres ;
// - la racine servie est le dossier du projet : les chemins relatifs, fetch(), les
//   modules ES fonctionnent comme sur un vrai site. Rien n'est servi hors de ce dossier.
//
// Les outils s'affichent dans des balises <webview> de l'interface. Leurs réglages de
// sécurité sont imposés ici (will-attach-webview), quoi que demande l'interface.
'use strict';

const { app, protocol, session, net, shell, webContents, BrowserWindow } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const chemins = require('./chemins');
const projets = require('./projets');
const journal = require('./journal');
const pontClaude = require('./pont-claude');

const SCHEMA = 'toolkit-outil';
const PREFIXE_PARTITION = 'persist:outil-';
// Page vide servie sur l'origine d'un outil (utilisée pendant l'import de données).
const CHEMIN_PAGE_VIDE = '/__toolkit__/vide.html';
const PREFIXE_APERCU = 'apercu-';

// hote -> { racine, entree, nom, projetId }
const registre = new Map();
const sessionsConfigurees = new Set();

// À appeler AVANT « ready » : rend le protocole équivalent à https (stockage, fetch, modules).
function enregistrerSchema() {
  protocol.registerSchemesAsPrivileged([{
    scheme: SCHEMA,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      codeCache: true,
      allowServiceWorkers: true,
    },
  }]);
}

// --- Identité d'un outil -------------------------------------------------------------

function slug(texte) {
  return texte.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'outil';
}

// L'outil principal d'un projet ne dépend que de l'identifiant du projet (changer son
// point d'entrée ne perd pas les données). Un outil lié dépend aussi de son chemin.
// Attention : renommer le dossier du projet change l'hôte, donc le stockage
// (d'où les boutons Exporter / Importer).
function calculerHote(projetId, outilLie) {
  const cle = outilLie ? `${projetId}\n${outilLie}` : projetId;
  const empreinte = crypto.createHash('sha1').update(cle).digest('hex').slice(0, 8);
  const nom = outilLie ? `${projetId}-${path.posix.basename(path.posix.dirname(outilLie)) || 'lie'}` : projetId;
  return `${slug(nom)}-${empreinte}`;
}

function estHtml(chemin) {
  return /\.html?$/i.test(chemin || '');
}

// --- Service des fichiers ---------------------------------------------------------------

function pageErreur(statut, message) {
  const html = `<!doctype html><meta charset="utf-8"><title>Erreur</title>
<body style="font-family:Segoe UI,sans-serif;background:#1e1e1e;color:#ccc;padding:40px">
<h2 style="color:#f14c4c">${statut === 404 ? 'Fichier introuvable' : 'Accès refusé'}</h2><p>${message}</p></body>`;
  return new Response(html, { status: statut, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

function echapper(texte) {
  return texte.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// partition : celle de la page qui fait la requête (voir configurerSession).
async function repondre(requete, partition) {
  const url = new URL(requete.url);
  if (url.pathname === CHEMIN_PAGE_VIDE) {
    return new Response('<!doctype html><title>Toolkit</title>', { headers: { 'content-type': 'text/html' } });
  }
  const outil = registre.get(url.host);
  if (!outil) return pageErreur(404, 'Cet outil n\'est plus ouvert. Ferme cet onglet et rouvre l\'outil depuis la bibliothèque.');
  // Pont Claude (voir pont-claude.js) : seulement pour l'outil de cette partition.
  if (pontClaude.estCheminPont(url.pathname)) {
    if (partition !== `${PREFIXE_PARTITION}${url.host}`) return new Response('', { status: 403 });
    return pontClaude.repondre(requete, outil, url.host);
  }

  let relatif;
  try {
    relatif = decodeURIComponent(url.pathname);
  } catch {
    return pageErreur(404, 'Adresse invalide.');
  }
  let chemin = path.resolve(outil.racine, `.${relatif}`);
  if (chemin !== outil.racine && !chemin.startsWith(outil.racine + path.sep)) {
    return pageErreur(403, 'Un outil ne peut pas lire de fichier en dehors du dossier de son projet.');
  }
  try {
    if ((await fs.stat(chemin)).isDirectory()) chemin = path.join(chemin, 'index.html');
    await fs.access(chemin);
  } catch {
    return pageErreur(404, `Le fichier <code>${echapper(relatif)}</code> n'existe pas dans le projet.`);
  }
  // net.fetch sur file:// gère les types MIME et les requêtes partielles (audio, vidéo).
  return net.fetch(pathToFileURL(chemin).href);
}

function configurerSession(partition) {
  if (sessionsConfigurees.has(partition)) return;
  const ses = session.fromPartition(partition);
  ses.protocol.handle(SCHEMA, (requete) => repondre(requete, partition).catch((erreur) => {
    journal.erreur('Service d\'un fichier d\'outil :', erreur);
    return pageErreur(404, 'Erreur pendant la lecture du fichier.');
  }));
  // Téléchargements (bouton « Enregistrer » d'un outil) : boîte « Enregistrer sous »
  // proposée dans le dossier Téléchargements.
  ses.on('will-download', (_evenement, element) => {
    element.setSaveDialogOptions({
      defaultPath: path.join(app.getPath('downloads'), element.getFilename()),
    });
  });
  sessionsConfigurees.add(partition);
}

function estSessionOutil(contenu) {
  return [...sessionsConfigurees].some((p) => session.fromPartition(p) === contenu.session);
}

// --- Préparation d'un outil (appelé avant d'ouvrir un onglet) -----------------------------

// outilLie : chemin d'un outil lié (champ point_entree d'une entrée de outils_lies),
// ou rien pour l'outil principal du projet.
async function preparer(projetId, outilLie) {
  const projet = await projets.chargerProjet(projetId);
  if (!projet) throw new Error('Ce projet n\'existe plus.');
  if (projet.erreur) throw new Error('La fiche projet.json de ce projet est illisible : corrige-la d\'abord.');

  const fiche = projet.fiche;
  let entree;
  let nom;
  if (outilLie) {
    // Outil lié, ou page HTML ouverte par une action « fichier » (même stockage d'une fois à l'autre).
    const lie = fiche.outils_lies.find((o) => o.point_entree === outilLie)
      || fiche.actions.filter((a) => a.genre === 'fichier' && a.fichier === outilLie).map((a) => ({ point_entree: a.fichier, nom: a.nom }))[0];
    if (!lie) throw new Error('Cette page n\'est plus déclarée dans projet.json (outil lié ou action).');
    entree = lie.point_entree;
    nom = lie.nom;
  } else {
    entree = fiche.point_entree;
    nom = fiche.nom;
  }
  if (!entree) throw new Error('Ce projet n\'a pas de point d\'entrée : ajoute « point_entree » dans projet.json (par exemple "index.html").');
  if (!estHtml(entree)) throw new Error(`Le point d'entrée « ${entree} » n'est pas une page HTML.`);

  const racine = path.resolve(chemins.projets(), projetId);
  const fichier = path.resolve(racine, entree);
  if (!fichier.startsWith(racine + path.sep)) throw new Error('Le point d\'entrée doit être à l\'intérieur du dossier du projet.');
  try {
    await fs.access(fichier);
  } catch {
    throw new Error(`Le fichier « ${entree} » est introuvable dans le dossier du projet.`);
  }

  const hote = calculerHote(projetId, outilLie);
  const partition = `${PREFIXE_PARTITION}${hote}`;
  registre.set(hote, { racine, entree, nom, projetId });
  configurerSession(partition);

  const cheminUrl = entree.split('/').map(encodeURIComponent).join('/');
  return {
    id: hote,
    nom,
    projetId,
    outilLie: outilLie || null,
    url: `${SCHEMA}://${hote}/${cheminUrl}`,
    partition,
    chemin: `${chemins.versRelatif(racine)}/${entree}`,
  };
}

// Aperçu d'une page HTML dans l'éditeur de code (onglet « Code ») : même service de
// fichiers, racine = dossier ouvert dans l'éditeur, session NON persistante (l'aperçu ne
// garde aucune donnée et ne touche pas à celles de l'outil). Renvoie { racine, partition }.
function preparerApercu(dossier, cle) {
  const racine = path.resolve(dossier);
  const empreinte = crypto.createHash('sha1').update(racine.toLowerCase()).digest('hex').slice(0, 8);
  const hote = `apercu-${slug(cle)}-${empreinte}`;
  registre.set(hote, { racine, entree: '', nom: 'Aperçu' });
  const partition = `${PREFIXE_APERCU}${hote}`;
  configurerSession(partition);
  return { racine: `${SCHEMA}://${hote}/`, partition };
}

// --- Contrôle des <webview> --------------------------------------------------------------

function ouvrirLienExterne(url) {
  if (/^(https?|mailto):/i.test(url)) {
    shell.openExternal(url).catch((erreur) => journal.erreur('Lien externe :', erreur));
  }
}

// Raccourcis de Toolkit qui restent actifs quand un outil a le clavier (mêmes règles que
// renderer/composants/raccourcis.js ; touches choisies dans preferences.raccourcis).
const RACCOURCIS_DANS_OUTILS = {
  palette: 'Ctrl+Shift+P', recherche: 'Ctrl+K', fermerOnglet: 'Ctrl+W', ongletSuivant: 'Ctrl+Tab', ongletPrecedent: 'Ctrl+Shift+Tab', bibliotheque: 'Ctrl+Shift+B',
};

// Disposition du clavier (position -> caractère sans Maj), envoyée par l'interface.
let disposition = {};
function definirDisposition(carte) {
  if (carte && typeof carte === 'object') disposition = carte;
}

// Même règle que renderer/composants/raccourcis.js > nomTouche.
function nomTouche(code, key) {
  if (/^[a-z]$/i.test(key)) return key.toUpperCase();
  const caractere = disposition[code];
  if (/^Digit\d$/.test(code)) return caractere === '-' || caractere === '=' ? caractere : code.slice(-1);
  if (/^Numpad\d$/.test(code)) return code.slice(-1);
  if (code === 'NumpadAdd') return '=';
  if (code === 'NumpadSubtract') return '-';
  if (code === 'Space' || key === ' ') return 'Espace';
  const brut = caractere || (key.length === 1 ? key : null);
  if (brut) return /^[a-z]$/i.test(brut) ? brut.toUpperCase() : brut;
  return key;
}

function combinaison(t) {
  if (['Control', 'Shift', 'Alt', 'Meta', 'AltGraph'].includes(t.key)) return null;
  return [t.control && 'Ctrl', t.alt && 'Alt', t.shift && 'Shift', nomTouche(t.code, t.key)].filter(Boolean).join('+');
}

function raccourciToolkit(touche) {
  const combi = combinaison(touche);
  if (!combi || !(touche.control || touche.alt)) return null;
  const choisis = require('./reglages').obtenir().preferences?.raccourcis || {};
  return Object.keys(RACCOURCIS_DANS_OUTILS).find((id) => (id in choisis ? choisis[id] : RACCOURCIS_DANS_OUTILS[id]) === combi) || null;
}

// À appeler pour la fenêtre principale : sécurise et configure chaque outil affiché.
function attacher(contenuPrincipal) {
  contenuPrincipal.on('will-attach-webview', (evenement, preferences, parametres) => {
    // Réglages imposés : jamais d'accès à Node ni de preload dans un outil.
    delete preferences.preload;
    preferences.nodeIntegration = false;
    preferences.nodeIntegrationInSubFrames = false;
    preferences.contextIsolation = true;
    preferences.sandbox = true;
    preferences.webSecurity = true;
    // Partitions acceptées : celles des outils, et celles (temporaires) des aperçus de l'éditeur.
    const valide = parametres.src?.startsWith(`${SCHEMA}://`)
      && (parametres.partition?.startsWith(PREFIXE_PARTITION) || parametres.partition?.startsWith(PREFIXE_APERCU));
    if (!valide) {
      journal.erreur('Webview refusée :', parametres.src);
      evenement.preventDefault();
    }
  });

  contenuPrincipal.on('did-attach-webview', (_evenement, invite) => {
    // Liens vers Internet : navigateur par défaut. Autres fenêtres : refusées.
    invite.setWindowOpenHandler(({ url }) => {
      ouvrirLienExterne(url);
      return { action: 'deny' };
    });
    invite.on('will-navigate', (evenement, url) => {
      if (!url.startsWith(`${SCHEMA}://`)) {
        evenement.preventDefault();
        ouvrirLienExterne(url);
      }
    });
    // Les touches pressées dans un outil n'arrivent pas jusqu'à l'interface.
    invite.on('before-input-event', (evenement, touche) => {
      if (touche.type !== 'keyDown') return;
      const lettre = touche.key.toLowerCase();
      if (touche.key === 'F12') {
        invite.toggleDevTools();
      } else if (touche.key === 'F5' || (touche.control && lettre === 'r')) {
        invite.reloadIgnoringCache();
      } else if (raccourciToolkit(touche)) {
        contenuPrincipal.send('outils:raccourci', raccourciToolkit(touche));
      } else {
        return;
      }
      evenement.preventDefault();
    });
  });
}

// Retrouve le contenu d'un outil à partir de son identifiant, en vérifiant que c'en est un.
function contenuOutil(idContenu) {
  const contenu = webContents.fromId(idContenu);
  if (!contenu || contenu.isDestroyed() || contenu.getType() !== 'webview' || !estSessionOutil(contenu)) {
    throw new Error('Cet outil n\'est plus ouvert.');
  }
  return contenu;
}

function fenetreDe(contenu) {
  return BrowserWindow.fromWebContents(contenu.hostWebContents) || undefined;
}

module.exports = {
  SCHEMA,
  CHEMIN_PAGE_VIDE,
  enregistrerSchema,
  preparer,
  preparerApercu,
  definirDisposition,
  attacher,
  calculerHote,
  contenuOutil,
  fenetreDe,
};
