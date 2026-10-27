// Publication d'une nouvelle version de Toolkit depuis Toolkit (Réglages > Mises à jour).
// Seulement sur la copie de DÉVELOPPEMENT : dépôt Git dont « origin » est le dépôt de
// package.json > repository, et compte GitHub (gh) qui a le droit d'y écrire.
// Même travail que scripts/publier-version.js, avec en plus le choix du numéro et un
// brouillon des notes de version :
// 1. preparer() ne modifie RIEN : dernière version publiée, commits depuis, numéro conseillé
//    (corrections -> 3ᵉ chiffre, nouveautés -> 2ᵉ chiffre), brouillon des notes ;
// 2. publier() : numéro dans package.json + notes -> commit « Version X » -> installateur
//    -> push -> étiquette vX -> Release GitHub (installateur joint).
// Une publication interrompue (étiquette créée, Release absente) peut être terminée.
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const chemins = require('./chemins');
const journal = require('./journal');
const { environnementPropre } = require('./processus');
const git = require('./git');
const { AIDE_GH } = require('./github');
const { depot, comparerVersions } = require('./mise-a-jour-toolkit');

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;
// Commits qui ne décrivent pas un changement pour l'utilisateur.
const SANS_INTERET = /^(Sauvegarde automatique|Merge |Version \d+\.\d+\.\d+$|Retour )/i;
const CORRECTION = /corrig|correction|répar|repar|réparé|bug|défaut|plantage|\bfix/i;
const ENTRETIEN = /documentation|readme|claude\.md|ménage|menage|nettoyage|commentaire|protocole|^revue/i;

let enCours = false;

// env : variables ajoutées APRÈS le nettoyage (environnementPropre() retire
// ELECTRON_RUN_AS_NODE : sans elle, electron.exe lancerait le script comme une 2ᵉ application
// qui ne se termine jamais, et la publication resterait bloquée).
function lancer(programme, args, { env = {}, delai = 120000 } = {}) {
  return new Promise((resoudre) => {
    execFile(programme, args, {
      cwd: chemins.app, env: { ...environnementPropre(), ...env }, windowsHide: true, maxBuffer: 20 * 1024 * 1024, timeout: delai,
    }, (erreur, sortie, sortieErreur) => resoudre({
      introuvable: erreur?.code === 'ENOENT',
      code: erreur ? (typeof erreur.code === 'number' ? erreur.code : 1) : 0,
      sortie: (sortie || '').trim(),
      erreur: (sortieErreur || '').trim(),
    }));
  });
}

const derniereLigne = (r) => (r.erreur || r.sortie).split('\n').pop();
const nomDepot = (url) => {
  const m = /github\.com[/:]([\w.-]+)\/([\w.-]+?)(\.git)?\/?$/i.exec(url || '');
  return m ? `${m[1]}/${m[2]}`.toLowerCase() : null;
};

// Copie de développement : son « origin » est le dépôt officiel de Toolkit.
async function estDeveloppement() {
  if (!(await git.estDepot(chemins.app))) return false;
  try {
    const { proprietaire, nom } = await depot();
    return nomDepot(await git.urlRemote(chemins.app)) === `${proprietaire}/${nom}`.toLowerCase();
  } catch {
    return false;
  }
}

function incrementer(version, niveau) {
  const [, a, b, c] = VERSION.exec(version).map(Number);
  if (niveau === 'majeure') return `${a + 1}.0.0`;
  if (niveau === 'nouveautes') return `${a}.${b + 1}.0`;
  return `${a}.${b}.${c + 1}`;
}

// Étiquettes vX.Y.Z, de la plus récente à la plus ancienne.
async function etiquettes() {
  const r = await git.git(chemins.app, ['tag', '--list', 'v*']);
  return r.sortie.split('\n').map((t) => t.trim().replace(/^v/, '')).filter((v) => VERSION.test(v))
    .sort((x, y) => comparerVersions(y, x));
}

async function releaseExiste(version) {
  const r = await lancer('gh', ['release', 'view', `v${version}`, '--json', 'tagName']);
  if (r.code === 0) return true;
  if (/release not found|not found/i.test(r.erreur)) return false;
  throw new Error(`Impossible de vérifier les versions publiées sur GitHub : ${derniereLigne(r)}`);
}

const fichierNotes = (version) => path.join(chemins.app, 'docs', 'notes-de-version', `${version}.md`);
async function lireNotes(version) {
  try {
    return await fs.readFile(fichierNotes(version), 'utf8');
  } catch {
    return null;
  }
}

// Vérifications communes : copie de dev, gh connecté avec droit d'écriture, tout est commité,
// rien de nouveau sur GitHub qui manquerait ici.
async function verifierPrerequis() {
  if (!(await estDeveloppement())) throw new Error('Publier une version n\'est possible que depuis la copie de développement de Toolkit (reliée à son dépôt GitHub).');
  const { proprietaire, nom } = await depot();
  const droits = await lancer('gh', ['api', `repos/${proprietaire}/${nom}`, '--jq', '.permissions.push']);
  if (droits.introuvable) throw new Error(`GitHub CLI (gh) est introuvable.\n${AIDE_GH}`);
  if (droits.code !== 0) throw new Error('GitHub n\'est pas connecté : Réglages > Comptes > Se connecter à GitHub.');
  if (droits.sortie !== 'true') throw new Error(`Le compte GitHub connecté n'a pas le droit de publier sur ${proprietaire}/${nom}.`);
  if (await git.aDesModifications(chemins.app)) {
    throw new Error('Des modifications de Toolkit ne sont pas dans un commit : panneau Git et GitHub > ligne Toolkit > Commit, puis réessaie.');
  }
  await git.verifierEnLigne(chemins.app);
  const etat = await git.etatDepot(chemins.app);
  if (etat.enRetard > 0) throw new Error(`GitHub contient ${etat.enRetard} commit(s) absent(s) ici : récupère-les d'abord (Pull), puis réessaie.`);
}

// Ne modifie rien. Renvoie soit { reprise: version, notes }, soit
// { derniere, commits, versions: { correctif, nouveautes, majeure }, suggestion, raison, notes,
//   notesParNiveau: { correctif, nouveautes, majeure } }.
async function preparer() {
  await verifierPrerequis();
  const tags = await etiquettes();
  const derniere = tags[0];
  if (!derniere) throw new Error('Aucune version n\'a encore été publiée (étiquette vX.Y.Z) : publie la première avec « npm run publier ».');

  // Étiquette sans Release : publication commencée puis interrompue.
  if (!(await releaseExiste(derniere))) {
    const surHead = (await git.git(chemins.app, ['rev-list', '-n', '1', `v${derniere}`])).sortie.trim()
      === (await git.git(chemins.app, ['rev-parse', 'HEAD'])).sortie.trim();
    if (!surHead) throw new Error(`La version ${derniere} a une étiquette mais pas de Release, et des commits ont été faits depuis. Demande à Claude de t'aider à terminer ou retirer cette publication.`);
    return { reprise: derniere, notes: await lireNotes(derniere) };
  }

  const log = await git.git(chemins.app, ['log', '--no-merges', '--format=%s', `v${derniere}..HEAD`]);
  const commits = log.sortie.split('\n').map((s) => s.trim()).filter((s) => s && !SANS_INTERET.test(s))
    .map((s) => s.replace(/\s*\(\d+\.\d+\.\d+\)\s*$/, ''));
  if (!commits.length) throw new Error(`Rien de nouveau depuis la version ${derniere} : fais d'abord des changements (et un commit).`);

  // Fichiers ajoutés et nouvelles bibliothèques depuis la dernière version.
  const diff = await git.git(chemins.app, ['diff', '--name-status', '--no-renames', `v${derniere}..HEAD`]);
  const ajoutes = diff.sortie.split('\n').filter((l) => /^A\t(src|templates)\//.test(l)).map((l) => l.slice(2));
  let nouvellesDependances = [];
  try {
    const avant = JSON.parse((await git.git(chemins.app, ['show', `v${derniere}:package.json`])).sortie).dependencies || {};
    const apres = JSON.parse(await fs.readFile(path.join(chemins.app, 'package.json'), 'utf8')).dependencies || {};
    nouvellesDependances = Object.keys(apres).filter((d) => !(d in avant));
  } catch { /* package.json illisible : on se fie aux commits */ }

  const corrections = commits.filter((c) => CORRECTION.test(c));
  const entretien = commits.filter((c) => !CORRECTION.test(c) && ENTRETIEN.test(c));
  const nouveautes = commits.filter((c) => !corrections.includes(c) && !entretien.includes(c));
  const raisons = [];
  if (nouveautes.length) raisons.push(`${nouveautes.length} nouveauté(s)`);
  if (ajoutes.length) raisons.push(`${ajoutes.length} fichier(s) de code ajouté(s)`);
  if (nouvellesDependances.length) raisons.push(`nouvelle(s) bibliothèque(s) : ${nouvellesDependances.join(', ')}`);
  const suggestion = raisons.length ? 'nouveautes' : 'correctif';
  const raison = raisons.length
    ? `des ajouts (${raisons.join(', ')}) : on augmente le 2ᵉ chiffre.`
    : 'seulement des corrections ou de l\'entretien : on augmente le 3ᵉ chiffre.';

  const versions = { correctif: incrementer(derniere, 'correctif'), nouveautes: incrementer(derniere, 'nouveautes'), majeure: incrementer(derniere, 'majeure') };
  const puces = (liste) => liste.map((c) => `- ${c}`).join('\n');
  const section = (titre, liste) => (liste.length ? `## ${titre}\n\n${puces(liste)}` : null);
  // Un brouillon par niveau : un correctif n'annonce pas de « Nouveautés » (elles passent en
  // « Améliorations »), pour que changer de numéro dans le formulaire n'oblige pas à réécrire.
  const brouillons = {
    correctif: [section('Améliorations', [...nouveautes, ...entretien]), section('Corrections', corrections)],
    nouveautes: [section('Nouveautés', nouveautes), section('Corrections', corrections),
      !nouveautes.length && !corrections.length ? section('Améliorations', entretien) : null],
  };
  brouillons.majeure = brouillons.nouveautes;
  // Notes déjà écrites pour un numéro (publication relancée) : gardées.
  const notesParNiveau = {};
  for (const niveau of Object.keys(versions)) {
    notesParNiveau[niveau] = (await lireNotes(versions[niveau])) || `${brouillons[niveau].filter(Boolean).join('\n\n')}\n`;
  }
  return { derniere, commits, versions, suggestion, raison, notes: notesParNiveau[suggestion], notesParNiveau };
}

// Publie « version » avec ces notes. etape(texte) reçoit l'avancement. Renvoie { version, url }.
async function publier({ version, notes }, etape = () => {}) {
  if (enCours) throw new Error('Une publication est déjà en cours.');
  enCours = true;
  try {
    if (!VERSION.test(version || '')) throw new Error('Numéro de version invalide (forme attendue : 1.16.0).');
    if (!String(notes || '').trim()) throw new Error('Écris au moins une ligne de notes de version.');
    etape('Vérification de GitHub et des changements…');
    await verifierPrerequis();
    const tags = await etiquettes();
    const tag = `v${version}`;
    const reprise = tags.includes(version);
    if (reprise && (tags[0] !== version || await releaseExiste(version))) throw new Error(`La version ${version} est déjà publiée : choisis un autre numéro.`);
    if (!reprise && tags[0] && comparerVersions(version, tags[0]) <= 0) throw new Error(`Le numéro doit être plus grand que la dernière version publiée (${tags[0]}).`);

    if (!reprise) {
      etape(`Numéro ${version} et notes de version enregistrés (commit « Version ${version} »)…`);
      const fichierPaquet = path.join(chemins.app, 'package.json');
      const paquet = await fs.readFile(fichierPaquet, 'utf8');
      await fs.writeFile(fichierPaquet, paquet.replace(/("version"\s*:\s*")[^"]*(")/, `$1${version}$2`), 'utf8');
      await fs.mkdir(path.dirname(fichierNotes(version)), { recursive: true });
      await fs.writeFile(fichierNotes(version), `${String(notes).trim()}\n`, 'utf8');
      await git.commiterTout(chemins.app, `Version ${version}`);
    }

    etape('Fabrication de l\'installateur (environ une minute)…');
    const construction = await lancer(process.execPath, [path.join(chemins.app, 'scripts', 'construire-installateur.js')],
      { env: { ELECTRON_RUN_AS_NODE: '1' }, delai: 600000 });
    journal.info(`Publication ${version} : ${construction.sortie}`);
    if (construction.code !== 0) {
      journal.info(`Publication ${version}, installateur : ${construction.erreur}`);
      throw new Error(`L'installateur n'a pas pu être fabriqué : ${derniereLigne(construction)}. Rien n'a été envoyé sur GitHub ; tu peux réessayer.`);
    }
    const exe = path.join(chemins.app, 'dist', `Installer-Toolkit-${version}.exe`);

    etape('Envoi des commits sur GitHub…');
    await git.pousser(chemins.app);
    if (!reprise) {
      const r = await git.git(chemins.app, ['tag', '-a', tag, '-m', `Toolkit ${version}`]);
      if (r.code !== 0) throw new Error(`L'étiquette ${tag} n'a pas pu être créée : ${derniereLigne(r)}`);
    }
    const envoiTag = await git.gitReseau(chemins.app, ['push', 'origin', tag]);
    if (envoiTag.code !== 0) throw new Error(git.messageErreurReseau(envoiTag, `L'envoi de l'étiquette ${tag}`));

    etape('Création de la Release sur GitHub (envoi de l\'installateur)…');
    const args = ['release', 'create', tag, exe, '--title', `Toolkit ${version}`, '--verify-tag'];
    if (await lireNotes(version)) args.push('--notes-file', fichierNotes(version));
    else args.push('--notes', String(notes).trim());
    const release = await lancer('gh', args, { delai: 600000 });
    if (release.code !== 0) throw new Error(`La Release n'a pas pu être créée : ${derniereLigne(release)}. Relance « Publier une nouvelle version » pour terminer.`);
    journal.info(`Toolkit ${version} publié : ${release.sortie}`);
    return { version, url: release.sortie.split('\n').pop() || null };
  } finally {
    enCours = false;
  }
}

module.exports = { estDeveloppement, preparer, publier };
