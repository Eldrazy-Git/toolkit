// Dépôt GitHub PARTAGÉ : plusieurs petits projets (pages HTML autonomes…) dans UN dépôt GitHub,
// un dossier par projet. Chaque projet garde son propre historique Git local (retour arrière,
// sauvegardes avant Claude) : seul l'envoi / la récupération passent par le dépôt partagé.
//
// projet.json > git.partage = { remote: "<adresse du dépôt>", dossier: "<dossier dans le dépôt>" }
//
// Fonctionnement (commandes « de plomberie » de Git, aucun fichier copié à la main) :
// - une copie « bare » du dépôt partagé dans donnees/depots-partages/<nom>.git (cache, recréé
//   au besoin : rien d'important n'y est gardé) ;
// - Push : le dernier commit du projet est importé dans le cache, puis un commit du dépôt
//   partagé est fabriqué en remplaçant SEULEMENT le dossier du projet (mktree + commit-tree),
//   et envoyé. Les dossiers des autres projets ne sont jamais touchés ;
// - Pull : le contenu du dossier sur GitHub devient un nouveau commit du projet (avance
//   simple, jamais de fusion automatique) ;
// - refs/toolkit/partage (dans le dépôt du projet) = dernier commit synchronisé : permet de
//   savoir qui a changé (ce PC, GitHub, ou les deux).
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const chemins = require('./chemins');
const git = require('./git');
const github = require('./github');
const { existe, lireJson, ecrireJson } = require('./fichiers');

const REF_SYNCHRO = 'refs/toolkit/partage';
const VIDE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'; // arbre vide de Git

function dossierCaches() {
  return path.join(chemins.donnees, 'depots-partages');
}

// Nom du cache d'après l'adresse (ex. github.com/moi/pages-html -> moi-pages-html.git).
function cacheDe(remote) {
  const nom = String(remote).replace(/\.git$/i, '').replace(/^.*?[:/]([^/:]+\/[^/]+)$/, '$1')
    .replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'depot';
  return path.join(dossierCaches(), `${nom}.git`);
}

// Nom du dossier dans le dépôt partagé : simple, sans « / ».
function verifierDossier(dossier) {
  const d = String(dossier || '').trim();
  if (!d || d === '.' || d === '..' || /[\\/:*?"<>|]/.test(d) || d.startsWith('.')) {
    throw new Error('Nom de dossier invalide dans le dépôt partagé (pas de / \\ : * ? " < > |, ni de point au début).');
  }
  return d;
}

// Une opération à la fois par dépôt partagé (deux projets envoyés en même temps se gêneraient).
const verrous = new Map();
function sousVerrou(cache, fonction) {
  const precedent = verrous.get(cache) || Promise.resolve();
  const suivant = precedent.catch(() => {}).then(fonction);
  verrous.set(cache, suivant.catch(() => {}));
  return suivant;
}

async function lire(dossier, args) {
  const r = await git.git(dossier, args);
  return r.code === 0 ? r.sortie.trim() : null;
}

async function verifier(dossier, args, action) {
  const r = await git.git(dossier, args);
  if (r.code !== 0) throw new Error(`${action} a échoué : ${(r.erreur || r.sortie).trim().split('\n').pop()}`);
  return r.sortie.trim();
}

// Crée le cache (clone « bare ») s'il n'existe pas encore. Réseau.
async function assurerCache(remote) {
  const cache = cacheDe(remote);
  if (await existe(path.join(cache, 'HEAD'))) return cache;
  await fs.mkdir(dossierCaches(), { recursive: true });
  await fs.rm(cache, { recursive: true, force: true });
  const r = await git.gitReseau(dossierCaches(), ['clone', '--bare', '--quiet', remote, cache]);
  if (r.code !== 0) {
    await fs.rm(cache, { recursive: true, force: true });
    throw new Error(git.messageErreurReseau(r, 'L\'accès au dépôt partagé'));
  }
  await verifier(cache, ['config', 'remote.origin.url', remote], 'La préparation du dépôt partagé');
  return cache;
}

// Met à jour le cache depuis GitHub (refs/distant/<branche>). Réseau.
async function actualiser(remote) {
  const cache = await assurerCache(remote);
  const r = await git.gitReseau(cache, ['fetch', '--prune', '--quiet', 'origin', '+refs/heads/*:refs/distant/*']);
  if (r.code !== 0) throw new Error(git.messageErreurReseau(r, 'La lecture du dépôt partagé'));
  return cache;
}

// Branche du dépôt partagé : main, sinon master, sinon la première ; null = dépôt vide.
async function branche(cache) {
  const liste = (await lire(cache, ['for-each-ref', '--format=%(refname:strip=2)', 'refs/distant/'])) || '';
  const noms = liste.split('\n').filter(Boolean);
  return noms.find((n) => n === 'main') || noms.find((n) => n === 'master') || noms[0] || null;
}

// Arbre (contenu) du dossier du projet sur GitHub, d'après le cache ; null = absent.
async function arbreDistant(cache, nomBranche, dossier) {
  if (!cache || !nomBranche) return null;
  return lire(cache, ['rev-parse', '--verify', '--quiet', `refs/distant/${nomBranche}:${dossier}`]);
}

// État local (sans réseau) d'un projet relié à un dépôt partagé, au format de git.etatDepot :
// { amont, enAvance, enRetard, remote, urlWeb, partage }.
async function etat(dossierProjet, partage, etatLocal) {
  const cache = cacheDe(partage.remote);
  const cacheExiste = await existe(path.join(cache, 'HEAD'));
  const nomBranche = cacheExiste ? await branche(cache) : null;
  const distant = await arbreDistant(cacheExiste ? cache : null, nomBranche, partage.dossier);
  const local = etatLocal.aucunCommit ? VIDE : await lire(dossierProjet, ['rev-parse', 'HEAD^{tree}']);
  const synchro = await lire(dossierProjet, ['rev-parse', '--verify', '--quiet', `${REF_SYNCHRO}^{tree}`]);

  let enAvance = 0;
  if (synchro && local !== synchro && local !== distant) {
    enAvance = Number(await lire(dossierProjet, ['rev-list', '--count', `${REF_SYNCHRO}..HEAD`])) || 1;
  }
  const web = git.urlWeb(partage.remote);
  return {
    remote: partage.remote,
    urlWeb: web ? `${web}/tree/${nomBranche || 'main'}/${encodeURIComponent(partage.dossier)}` : null,
    // Jamais synchronisé = « jamais envoyé » pour l'interface (amont absent).
    amont: synchro ? 'partage' : null,
    enAvance,
    enRetard: distant && distant !== synchro && distant !== local ? 1 : 0,
    partage: { remote: partage.remote, dossier: partage.dossier },
  };
}

// Push : remplace le dossier du projet dans le dépôt partagé par le dernier commit du projet.
async function pousser(dossierProjet, partage, nomProjet) {
  const dossier = verifierDossier(partage.dossier);
  const cache = cacheDe(partage.remote);
  return sousVerrou(cache, async () => {
    const local = await lire(dossierProjet, ['rev-parse', '--verify', '--quiet', 'HEAD^{tree}']);
    if (!local) throw new Error('Il n\'y a encore rien à envoyer : fais d\'abord un « Commit ».');
    const synchro = await lire(dossierProjet, ['rev-parse', '--verify', '--quiet', `${REF_SYNCHRO}^{tree}`]);

    for (let essai = 0; essai < 2; essai++) {
      await actualiser(partage.remote);
      const nomBranche = (await branche(cache)) || 'main';
      const parent = await lire(cache, ['rev-parse', '--verify', '--quiet', `refs/distant/${nomBranche}`]);
      const distant = await arbreDistant(cache, parent ? nomBranche : null, dossier);
      if (distant === local) break; // déjà identique sur GitHub
      if (distant && distant !== synchro) {
        throw new Error(synchro
          ? `Le dossier « ${dossier} » a changé sur GitHub depuis ta dernière synchronisation (depuis un autre PC ?). Clique d'abord sur « Pull », puis réessaie.`
          : `Le dépôt partagé contient déjà un dossier « ${dossier} » qui n'est pas celui de ce projet.`);
      }

      // Contenu du projet importé dans le cache, puis nouvel arbre racine = celui du dépôt
      // partagé avec le dossier du projet remplacé (ou ajouté).
      await verifier(cache, ['fetch', '--quiet', '--no-tags', dossierProjet, `+HEAD:refs/toolkit/projets/${dossier}`], 'La préparation de l\'envoi');
      const entrees = parent ? (await verifier(cache, ['ls-tree', '-z', parent], 'La lecture du dépôt partagé')).split('\0').filter(Boolean) : [];
      const garder = entrees.filter((e) => e.slice(e.indexOf('\t') + 1) !== dossier);
      garder.push(`040000 tree ${local}\t${dossier}`);
      const mktree = await git.git(cache, ['mktree', '-z'], { entree: `${garder.join('\0')}\0` });
      if (mktree.code !== 0) throw new Error('La préparation de l\'envoi a échoué (mktree).');
      const arbre = mktree.sortie.trim();
      const message = (await lire(dossierProjet, ['log', '-1', '--format=%s'])) || 'Mise à jour';
      const commit = await verifier(cache, ['commit-tree', arbre, ...(parent ? ['-p', parent] : []), '-m', `${nomProjet} : ${message}`],
        'La préparation de l\'envoi');

      const r = await git.gitReseau(cache, ['push', '--quiet', 'origin', `${commit}:refs/heads/${nomBranche}`]);
      if (r.code === 0) {
        await git.git(cache, ['update-ref', `refs/distant/${nomBranche}`, commit]);
        break;
      }
      // Un autre envoi est passé entre-temps (autre projet, autre PC) : on recommence une fois.
      if (essai === 0 && /\[rejected\]|non-fast-forward|fetch first/i.test(`${r.erreur}\n${r.sortie}`)) continue;
      throw new Error(git.messageErreurReseau(r, 'L\'envoi (Push)'));
    }
    const n = synchro ? Number(await lire(dossierProjet, ['rev-list', '--count', `${REF_SYNCHRO}..HEAD`])) : null;
    await verifier(dossierProjet, ['update-ref', REF_SYNCHRO, 'HEAD'], 'L\'enregistrement de la synchronisation');
    return { envoyes: n };
  });
}

// Pull : le contenu du dossier sur GitHub devient un nouveau commit du projet (avance simple).
async function recuperer(dossierProjet, partage) {
  const dossier = verifierDossier(partage.dossier);
  const cache = cacheDe(partage.remote);
  return sousVerrou(cache, async () => {
    await actualiser(partage.remote);
    const nomBranche = await branche(cache);
    const distant = await arbreDistant(cache, nomBranche, dossier);
    if (!distant) return { message: 'Rien à récupérer : ce projet n\'est pas encore sur GitHub.' };
    const head = await lire(dossierProjet, ['rev-parse', '--verify', '--quiet', 'HEAD']);
    const local = head ? await lire(dossierProjet, ['rev-parse', 'HEAD^{tree}']) : VIDE;
    const synchro = await lire(dossierProjet, ['rev-parse', '--verify', '--quiet', `${REF_SYNCHRO}^{tree}`]);
    if (distant === local) {
      if (head) await git.git(dossierProjet, ['update-ref', REF_SYNCHRO, 'HEAD']);
      return { message: 'Déjà à jour : rien de nouveau sur GitHub.' };
    }
    if (synchro && local !== synchro) {
      throw new Error('Ce projet a des changements ici ET sur GitHub (depuis un autre PC ?) : Toolkit ne les fusionne pas automatiquement. '
        + 'Ouvre « Modifier avec Claude » et demande-lui de t\'aider à réunir les deux versions.');
    }
    if (!synchro && head) {
      throw new Error(`Le dossier « ${dossier} » du dépôt partagé et ce projet n'ont jamais été synchronisés : Toolkit ne sait pas lequel garder.`);
    }

    // Commit « reçu » fabriqué dans le cache (parent = HEAD du projet), puis importé dans le
    // projet : seuls les fichiers de ce dossier voyagent, pas les autres projets du dépôt.
    if (head) await verifier(cache, ['fetch', '--quiet', '--no-tags', dossierProjet, `+HEAD:refs/toolkit/projets/${dossier}`], 'La récupération');
    const auteur = (await lire(cache, ['log', '-1', '--format=%s', `refs/distant/${nomBranche}`, '--', dossier])) || 'Changements récupérés';
    const recu = await verifier(cache, ['commit-tree', distant, ...(head ? ['-p', head] : []), '-m', `Récupéré depuis GitHub : ${auteur}`], 'La récupération');
    await verifier(cache, ['update-ref', `refs/toolkit/recu/${dossier}`, recu], 'La récupération');
    await verifier(dossierProjet, ['fetch', '--quiet', '--no-tags', cache, `+refs/toolkit/recu/${dossier}:refs/toolkit/recu`], 'La récupération');
    const r = await git.git(dossierProjet, ['merge', '--ff-only', '--quiet', 'refs/toolkit/recu']);
    if (r.code !== 0) throw new Error(git.messageErreurReseau(r, 'La récupération (Pull)'));
    await git.git(dossierProjet, ['update-ref', REF_SYNCHRO, 'HEAD']);
    await git.git(dossierProjet, ['update-ref', '-d', 'refs/toolkit/recu']);
    const fichiers = (await lire(dossierProjet, ['diff', '--name-only', `${head || VIDE}`, 'HEAD'])) || '';
    const nb = fichiers.split('\n').filter(Boolean).length;
    return { message: `Changements récupérés${nb ? ` (${nb} fichier(s) mis à jour)` : ''}.` };
  });
}

// Liste des dossiers déjà présents dans le dépôt partagé (pour éviter les doublons). Réseau.
async function dossiersDistants(remote) {
  const cache = await actualiser(remote);
  const nomBranche = await branche(cache);
  if (!nomBranche) return [];
  const liste = await lire(cache, ['ls-tree', '-d', '--name-only', `refs/distant/${nomBranche}`]);
  return (liste || '').split('\n').filter(Boolean);
}

// Ne plus synchroniser ce projet (le dossier reste sur GitHub).
async function oublier(dossierProjet) {
  await git.git(dossierProjet, ['update-ref', '-d', REF_SYNCHRO]);
}

// Note (ou retire, partage = null) git.partage dans projet.json, puis commit de la fiche.
async function ecrireDansFiche(dossierProjet, partage, message) {
  const chemin = path.join(dossierProjet, 'projet.json');
  const fiche = await lireJson(chemin);
  const gitFiche = { ...(fiche.git || {}) };
  if (partage) gitFiche.partage = partage;
  else delete gitFiche.partage;
  if (Object.keys(gitFiche).length) fiche.git = gitFiche;
  else delete fiche.git;
  await ecrireJson(chemin, fiche);
  await git.commiterFichiers(dossierProjet, ['projet.json'], message);
}

// Range un projet dans un dépôt partagé et l'envoie aussitôt (panneau Git et assistant d'import).
// choix : { remote } (dépôt partagé existant) ou { nouveau: nom } (dépôt privé créé) ;
// dossierDistant : nom du dossier du projet dans le dépôt. -> { envoyes, url }
async function rejoindre(dossierProjet, choix, dossierDistant, nomProjet) {
  const etatLocal = await git.etatDepot(dossierProjet);
  if (!etatLocal.estDepot) throw new Error('Active d\'abord l\'historique Git.');
  if (etatLocal.remote) throw new Error('Ce projet a déjà son propre dépôt GitHub.');
  if (etatLocal.secretsSuivis.length) {
    throw new Error(`Des fichiers sensibles sont enregistrés dans Git (${etatLocal.secretsSuivis.join(', ')}). Retire-les du suivi avant d'envoyer le projet sur GitHub.`);
  }
  const nomDossier = verifierDossier(dossierDistant);
  let remote = String(choix?.remote || '').trim();
  if (!remote) {
    const nom = String(choix?.nouveau || '').trim();
    if (!/^[A-Za-z0-9._-]+$/.test(nom)) throw new Error('Nom de dépôt invalide : lettres, chiffres, tirets, points et soulignés seulement (ex. pages-html).');
    remote = await github.creerDepotPriveVide(nom, 'Projets simples (un dossier par projet), gérés avec Toolkit.');
  } else if ((await dossiersDistants(remote)).includes(nomDossier)) {
    throw new Error(`Le dépôt partagé contient déjà un dossier « ${nomDossier} » : choisis un autre nom de dossier.`);
  }
  const partage = { remote, dossier: nomDossier };
  await ecrireDansFiche(dossierProjet, partage, 'Envoi sur GitHub dans un dépôt partagé');
  const resultat = await pousser(dossierProjet, partage, nomProjet);
  return { ...resultat, url: git.urlWeb(remote) };
}

module.exports = {
  etat, pousser, recuperer, actualiser, dossiersDistants, oublier, verifierDossier, ecrireDansFiche, rejoindre, REF_SYNCHRO,
};
