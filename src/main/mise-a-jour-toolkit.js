// Mise à jour de Toolkit LUI-MÊME vers une nouvelle version officielle.
//
// Les versions sont les « Releases » GitHub du dépôt indiqué dans package.json
// (« repository ») : étiquette vX.Y.Z, notes de version.
//
// Promesses faites à l'utilisateur :
// - ses projets (projets/) et ses réglages (donnees/) ne sont jamais touchés ;
// - ce qu'il a modifié ou ajouté dans Toolkit (souvent avec Claude) est GARDÉ :
//   fusion à trois versions, fichier par fichier, entre la version officielle installée
//   (« base »), sa version actuelle (« la sienne ») et la nouvelle version officielle :
//     · fichier qu'il n'a pas modifié          -> nouvelle version officielle ;
//     · fichier modifié seulement par lui      -> gardé tel quel ;
//     · modifié des deux côtés                 -> fusion automatique (git merge-file) ;
//       si impossible : SA version est gardée et le fichier est signalé (Claude peut finir) ;
//     · fichier ajouté par lui                 -> jamais touché ;
//     · fichier retiré de la version officielle -> retiré seulement s'il ne l'avait pas modifié ;
// - une sauvegarde Git du dossier app est faite avant : tout reste annulable (Historique).
// Les deux versions officielles téléchargées sont rangées dans app/.mise-a-jour/<version>/
// (ignoré par Git) pour que Claude puisse finir une fusion.
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { net } = require('electron');
const chemins = require('./chemins');
const journal = require('./journal');
const { environnementPropre } = require('./processus');

const VERSION = /^v?(\d+)\.(\d+)\.(\d+)$/;
const IGNORES = new Set(['node_modules', '.git', '.mise-a-jour', 'build', 'dist']);
const DOSSIER_TRAVAIL = () => path.join(chemins.app, '.mise-a-jour');

function lancer(programme, args, { cwd, entree } = {}) {
  return new Promise((resoudre) => {
    const enfant = execFile(programme, args, {
      cwd, env: environnementPropre(), windowsHide: true, maxBuffer: 64 * 1024 * 1024, encoding: 'buffer', timeout: 300000,
    }, (erreur, sortie, sortieErreur) => resoudre({
      code: erreur ? (typeof erreur.code === 'number' ? erreur.code : 1) : 0,
      sortie: sortie || Buffer.alloc(0),
      erreur: (sortieErreur || Buffer.alloc(0)).toString('utf8'),
    }));
    if (entree !== undefined) enfant.stdin.end(entree);
  });
}

function comparerVersions(a, b) {
  const x = VERSION.exec(a);
  const y = VERSION.exec(b);
  if (!x || !y) return 0;
  for (let i = 1; i <= 3; i += 1) if (Number(x[i]) !== Number(y[i])) return Number(x[i]) - Number(y[i]);
  return 0;
}

async function paquetActuel() {
  return JSON.parse(await fs.readFile(path.join(chemins.app, 'package.json'), 'utf8'));
}

// --- Source des versions : Releases GitHub (ou dossier local pour les tests) ------------------

async function depot() {
  const paquet = await paquetActuel();
  const url = typeof paquet.repository === 'string' ? paquet.repository : paquet.repository?.url;
  const m = /github\.com[/:]([\w.-]+)\/([\w.-]+?)(\.git)?\/?$/.exec(url || '');
  if (!m) throw new Error('Aucun dépôt GitHub n\'est indiqué dans package.json (« repository ») : impossible de chercher les nouvelles versions.');
  return { proprietaire: m[1], nom: m[2] };
}

// Requête à l'API GitHub : d'abord sans compte (dépôt public), sinon avec « gh » connecté
// (dépôt privé de son propriétaire). Renvoie un Buffer.
async function apiGithub(chemin) {
  try {
    const reponse = await net.fetch(`https://api.github.com/${chemin}`, { headers: { 'user-agent': 'Toolkit', accept: 'application/vnd.github+json' } });
    if (reponse.ok) return Buffer.from(await reponse.arrayBuffer());
    if (![403, 404].includes(reponse.status)) throw new Error(`GitHub a répondu ${reponse.status}`);
  } catch (erreur) {
    journal.info(`Mise à jour de Toolkit : ${erreur.message}`);
  }
  const r = await lancer('gh', ['api', chemin]);
  if (r.code !== 0) throw new Error('Impossible de joindre le dépôt GitHub de Toolkit (connexion Internet ? dépôt privé ?).');
  return r.sortie;
}

// Dossier local de test : TOOLKIT_SOURCE_MAJ = dossier contenant releases.json et <tag>.zip.
const sourceLocale = () => process.env.TOOLKIT_SOURCE_MAJ || null;

async function derniereRelease() {
  if (sourceLocale()) {
    const liste = JSON.parse(await fs.readFile(path.join(sourceLocale(), 'releases.json'), 'utf8'));
    return liste.sort((a, b) => comparerVersions(b.tag_name, a.tag_name))[0] || null;
  }
  const { proprietaire, nom } = await depot();
  try {
    return JSON.parse((await apiGithub(`repos/${proprietaire}/${nom}/releases/latest`)).toString('utf8'));
  } catch (erreur) {
    if (/introuvable|404/i.test(erreur.message)) return null;
    throw erreur;
  }
}

// Sources d'une version (étiquette) décompressées dans « destination ».
async function telechargerSources(tag, destination) {
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(destination, { recursive: true });
  const zip = `${destination}.zip`;
  if (sourceLocale()) {
    await fs.copyFile(path.join(sourceLocale(), `${tag}.zip`), zip);
  } else {
    const { proprietaire, nom } = await depot();
    await fs.writeFile(zip, await apiGithub(`repos/${proprietaire}/${nom}/zipball/${tag}`));
  }
  // tar.exe de Windows sait lire les .zip ; le dossier de premier niveau du zip est retiré.
  const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  const r = await lancer(tar, ['-xf', zip, '--strip-components=1', '-C', destination]);
  await fs.rm(zip, { force: true });
  if (r.code !== 0) throw new Error(`Les sources de Toolkit ${tag} n'ont pas pu être décompressées.`);
}

// --- Vérification ----------------------------------------------------------------------------

// { actuelle, derniere: { version, notes, date, url } | null, disponible }
async function verifier() {
  const actuelle = (await paquetActuel()).version;
  const release = await derniereRelease();
  if (!release || !VERSION.test(release.tag_name || '')) return { actuelle, derniere: null, disponible: false };
  const version = release.tag_name.replace(/^v/, '');
  return {
    actuelle,
    derniere: { version, tag: release.tag_name, notes: release.body || '', date: release.published_at || null, url: release.html_url || null },
    disponible: comparerVersions(version, actuelle) > 0,
  };
}

// --- Analyse (rien n'est modifié) ---------------------------------------------------------------

async function listerFichiers(racine) {
  const resultat = new Set();
  const parcourir = async (relatif) => {
    let entrees;
    try {
      entrees = await fs.readdir(path.join(racine, relatif), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entrees) {
      if (IGNORES.has(e.name)) continue;
      const r = relatif ? `${relatif}/${e.name}` : e.name;
      if (e.isDirectory()) await parcourir(r);
      else resultat.add(r);
    }
  };
  await parcourir('');
  return resultat;
}

async function lire(fichier) {
  try {
    return await fs.readFile(fichier);
  } catch {
    return null;
  }
}

const estBinaire = (b) => b && b.subarray(0, 8000).includes(0);
// Comparaison qui ignore la différence de fins de ligne (CRLF / LF).
const normaliser = (b) => (b === null ? null : estBinaire(b) ? b.toString('base64') : b.toString('utf8').replace(/\r\n/g, '\n'));
const identiques = (a, b) => normaliser(a) === normaliser(b);

// package.json : la nouvelle version officielle, plus ce que l'utilisateur a ajouté ou changé
// (dépendances, scripts…) par rapport à l'ancienne version officielle.
function fusionnerPaquet(base, sienne, nouvelle) {
  const b = JSON.parse(base.toString('utf8'));
  const s = JSON.parse(sienne.toString('utf8'));
  const n = JSON.parse(nouvelle.toString('utf8'));
  const resultat = { ...n };
  for (const section of ['dependencies', 'devDependencies', 'scripts', 'allowScripts']) {
    const ajouts = {};
    for (const [cle, valeur] of Object.entries(s[section] || {})) {
      const modifieParLui = !(b[section] && cle in b[section]) || JSON.stringify(b[section][cle]) !== JSON.stringify(valeur);
      const inchangeOfficiel = JSON.stringify((b[section] || {})[cle]) === JSON.stringify((n[section] || {})[cle]);
      if (modifieParLui && (inchangeOfficiel || !(n[section] && cle in n[section]))) ajouts[cle] = valeur;
    }
    if (Object.keys(ajouts).length) resultat[section] = { ...(n[section] || {}), ...ajouts };
  }
  return Buffer.from(`${JSON.stringify(resultat, null, 2)}\n`, 'utf8');
}

// Analyse : renvoie le plan (listes de fichiers par décision) et prépare le dossier de travail.
async function analyser() {
  const infos = await verifier();
  if (!infos.disponible) throw new Error('Toolkit est déjà à jour.');
  const travail = path.join(DOSSIER_TRAVAIL(), infos.derniere.version);
  const dossierBase = path.join(travail, 'base');
  const dossierNouveau = path.join(travail, 'nouveau');
  await telechargerSources(`v${infos.actuelle}`, dossierBase).catch(() => {
    throw new Error(`La version installée (${infos.actuelle}) n'existe pas dans les Releases du dépôt : impossible de savoir ce que tu as modifié. Mise à jour annulée par prudence.`);
  });
  await telechargerSources(infos.derniere.tag, dossierNouveau);

  const [base, nouveau] = await Promise.all([listerFichiers(dossierBase), listerFichiers(dossierNouveau)]);
  const plan = { version: infos.derniere.version, actuelle: infos.actuelle, misAJour: [], gardes: [], fusionnes: [], conflits: [], ajoutes: [], retires: [], gardesMalgreRetrait: [], ecritures: {}, suppressions: [] };
  const tous = new Set([...base, ...nouveau]);
  for (const relatif of [...tous].sort()) {
    const [vb, vs, vn] = await Promise.all([
      lire(path.join(dossierBase, relatif)), lire(path.join(chemins.app, relatif)), lire(path.join(dossierNouveau, relatif)),
    ]);
    if (identiques(vs, vn)) continue; // déjà identique à la nouvelle version
    if (vn === null) {
      // Retiré de la version officielle.
      if (vs !== null && identiques(vs, vb)) { plan.retires.push(relatif); plan.suppressions.push(relatif); } else if (vs !== null) plan.gardesMalgreRetrait.push(relatif);
      continue;
    }
    if (vb === null && vs === null) { plan.ajoutes.push(relatif); plan.ecritures[relatif] = vn; continue; }
    if (vs === null) { plan.gardes.push(relatif); continue; } // il l'avait supprimé : son choix est respecté
    if (identiques(vs, vb)) { plan.misAJour.push(relatif); plan.ecritures[relatif] = vn; continue; }
    if (identiques(vn, vb)) { plan.gardes.push(relatif); continue; } // seul l'utilisateur l'a changé
    // Modifié des deux côtés.
    if (relatif === 'package-lock.json') { plan.misAJour.push(relatif); plan.ecritures[relatif] = vn; continue; } // recalculé par npm install
    if (relatif === 'package.json' && vb) {
      try {
        plan.ecritures[relatif] = fusionnerPaquet(vb, vs, vn);
        plan.fusionnes.push(relatif);
        continue;
      } catch { /* JSON invalide : traité comme un conflit */ }
    }
    if (vb === null || estBinaire(vs) || estBinaire(vn)) { plan.conflits.push(relatif); continue; }
    const r = await lancer('git', ['merge-file', '-p', '-L', 'toi', '-L', 'base', '-L', 'officiel',
      path.join(chemins.app, relatif), path.join(dossierBase, relatif), path.join(dossierNouveau, relatif)]);
    if (r.code === 0) { plan.fusionnes.push(relatif); plan.ecritures[relatif] = r.sortie; } else plan.conflits.push(relatif);
  }
  // Les dépendances changent-elles ? (alors npm install, Toolkit fermé)
  const avant = JSON.stringify((await paquetActuel()).dependencies || {});
  const apres = plan.ecritures['package.json'] ? JSON.stringify(JSON.parse(plan.ecritures['package.json'].toString('utf8')).dependencies || {}) : avant;
  plan.dependancesChangees = avant !== apres;
  plan.notes = infos.derniere.notes;
  derniereAnalyse = plan;
  return resume(plan);
}

let derniereAnalyse = null;

function resume(plan) {
  return {
    version: plan.version,
    actuelle: plan.actuelle,
    notes: plan.notes,
    misAJour: plan.misAJour.length + plan.ajoutes.length + plan.retires.length,
    gardes: plan.gardes,
    fusionnes: plan.fusionnes,
    conflits: plan.conflits,
    gardesMalgreRetrait: plan.gardesMalgreRetrait,
    dependancesChangees: plan.dependancesChangees,
  };
}

// --- Application ----------------------------------------------------------------------------------

// Commit dans app/ ; dépôt créé s'il n'existe pas (installation par l'installateur).
async function commit(message) {
  const app = chemins.app;
  if ((await lancer('git', ['rev-parse', '--git-dir'], { cwd: app })).code !== 0) {
    await lancer('git', ['init', '-q', '-b', 'main'], { cwd: app });
  }
  const identite = (await lancer('git', ['config', 'user.name'], { cwd: app })).sortie.toString().trim()
    ? [] : ['-c', 'user.name=Toolkit', '-c', 'user.email=toolkit@toolkit.local'];
  await lancer('git', ['add', '-A'], { cwd: app });
  const r = await lancer('git', [...identite, 'commit', '-q', '-m', message], { cwd: app });
  if (r.code !== 0 && !/nothing to commit|rien à valider/i.test(`${r.erreur}${r.sortie}`)) {
    throw new Error(`La sauvegarde Git a échoué : ${r.erreur.trim().split('\n').pop()}`);
  }
}

// Applique la dernière analyse. Renvoie { conflits, dependancesChangees }.
async function appliquer() {
  const plan = derniereAnalyse;
  if (!plan) throw new Error('Analyse la mise à jour d\'abord.');
  const date = new Date().toLocaleString('fr-FR');
  await commit(`Sauvegarde automatique avant la mise à jour de Toolkit vers ${plan.version} (${date})`);
  for (const [relatif, contenu] of Object.entries(plan.ecritures)) {
    const fichier = path.join(chemins.app, relatif);
    await fs.mkdir(path.dirname(fichier), { recursive: true });
    await fs.writeFile(fichier, contenu);
  }
  for (const relatif of plan.suppressions) await fs.rm(path.join(chemins.app, relatif), { force: true });
  await commit(`Mise à jour de Toolkit ${plan.actuelle} -> ${plan.version} (version officielle, modifications personnelles gardées)`);
  journal.info(`Toolkit mis à jour vers ${plan.version} : ${Object.keys(plan.ecritures).length} fichier(s) écrit(s), ${plan.conflits.length} conflit(s).`);
  derniereAnalyse = null;
  return { version: plan.version, conflits: plan.conflits, dependancesChangees: plan.dependancesChangees };
}

module.exports = { verifier, analyser, appliquer, comparerVersions };
