// Opérations Git : locales (état, commit, .gitignore) et distantes (push, pull, fetch, clone).
// Utilise la commande « git » installée sur le PC et sa configuration (nom, e-mail).
// Identification auprès de GitHub : pour SES commandes réseau, Toolkit demande à Git
// d'utiliser la connexion de « gh » (gh auth git-credential), sans rien stocker et sans
// modifier la configuration Git de l'utilisateur.
'use strict';

const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { environnementPropre, sortieDe } = require('./processus');
const { existe } = require('./fichiers');

// Fichiers sensibles (clés, mots de passe, keystores).
const EXPRESSION_SECRETS = /(^|\/)(\.env(\..*)?|local\.properties|[^/]*\.(jks|keystore|p12|pfx|pem))$/i;

// Fichiers à ne jamais versionner (secrets, dépendances, fichiers générés).
const GITIGNORE_DEFAUT = [
  '# Secrets : ne jamais versionner',
  '.env',
  '.env.*',
  '*.jks',
  '*.keystore',
  'local.properties',
  '',
  '# Dépendances et fichiers générés',
  'node_modules/',
  '__pycache__/',
  '*.pyc',
  '.venv/',
  'build/',
  'dist/',
  'out/',
  '.gradle/',
  '.idea/',
  '*.log',
  '',
  '# Fichiers système',
  'Thumbs.db',
  'desktop.ini',
  '.DS_Store',
  '',
].join('\n');

// Lance « git <args> » dans un dossier. Renvoie { code, sortie, erreur, delaiDepasse }.
function git(dossier, args, { env = {}, delai = 0 } = {}) {
  return new Promise((resoudre, rejeter) => {
    execFile('git', args, {
      cwd: dossier,
      env: environnementPropre(env),
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024,
      timeout: delai,
    }, (erreur, sortie, sortieErreur) => {
      if (erreur && erreur.code === 'ENOENT') {
        rejeter(new Error('Git est introuvable sur ce PC. Installe-le (dans PowerShell : winget install Git.Git), puis redémarre Toolkit.'));
        return;
      }
      resoudre({
        code: erreur ? (typeof erreur.code === 'number' ? erreur.code : 1) : 0,
        sortie,
        erreur: sortieErreur,
        delaiDepasse: Boolean(erreur?.killed),
      });
    });
  });
}

// --- Commandes réseau ------------------------------------------------------------------------

let ghPresent = null;

async function optionsIdentification() {
  if (ghPresent === null) ghPresent = Boolean(await sortieDe('gh', ['--version']));
  return ghPresent
    ? ['-c', 'credential.https://github.com.helper=', '-c', 'credential.https://github.com.helper=!gh auth git-credential']
    : [];
}

// Commande Git qui contacte un serveur : identification par gh, jamais de question bloquante.
async function gitReseau(dossier, args) {
  return git(dossier, [...(await optionsIdentification()), ...args], { env: { GIT_TERMINAL_PROMPT: '0' }, delai: 120000 });
}

function messageErreurReseau(resultat, action) {
  const texte = `${resultat.erreur}\n${resultat.sortie}`;
  if (resultat.delaiDepasse) return `${action} : GitHub ne répond pas (délai dépassé). Vérifie ta connexion Internet.`;
  if (/Could not resolve host|unable to access|Failed to connect|Connection timed out/i.test(texte)) {
    return `${action} : impossible de joindre GitHub. Vérifie ta connexion Internet.`;
  }
  if (/Repository not found/i.test(texte)) {
    return `${action} : le dépôt distant est introuvable (supprimé, renommé, ou ton compte n'y a pas accès).`;
  }
  if (/Authentication failed|could not read Username|terminal prompts disabled|returned error: 403|Permission denied/i.test(texte)) {
    return `${action} : GitHub refuse l'accès. Vérifie ta connexion dans PowerShell :\n  gh auth status\nSi besoin : gh auth login`;
  }
  if (/\[rejected\]|non-fast-forward|fetch first/i.test(texte)) {
    return `${action} : GitHub contient des changements que tu n'as pas encore ici. Clique d'abord sur « Pull », puis réessaie.`;
  }
  if (/would be overwritten|commit your changes or stash/i.test(texte)) {
    return `${action} : des fichiers modifiés ici seraient écrasés. Fais d'abord un « Commit », puis réessaie.`;
  }
  if (/Not possible to fast-forward|diverg/i.test(texte)) {
    return `${action} : ton projet et GitHub ont chacun des changements différents, il faut les fusionner. `
      + 'Ouvre « Modifier avec Claude » et demande-lui : « récupère les changements de GitHub (git pull) et fusionne-les ».';
  }
  return messageErreur(resultat, action);
}

// Traduit les erreurs Git les plus courantes.
function messageErreur(resultat, action) {
  const texte = `${resultat.erreur}\n${resultat.sortie}`;
  if (/Please tell me who you are|user\.email|user\.name/i.test(texte)) {
    return 'Git ne connaît pas encore ton nom et ton e-mail. Dans PowerShell, tape :\n'
      + 'git config --global user.name "Ton nom"\n'
      + 'git config --global user.email "ton-email@exemple.fr"';
  }
  if (/index\.lock/i.test(texte)) {
    return 'Une autre opération Git est en cours sur ce projet (fichier index.lock). Réessaie dans un instant.';
  }
  return `${action} a échoué : ${(resultat.erreur || resultat.sortie).trim().split('\n')[0]}`;
}

async function gitDisponible() {
  try {
    return (await git(process.cwd(), ['--version'])).code === 0;
  } catch {
    return false;
  }
}

// Le dossier est-il la racine d'un dépôt Git ?
function estDepot(dossier) {
  return existe(path.join(dossier, '.git'));
}

// Crée le dépôt et un .gitignore protégeant les secrets s'il n'en existe pas.
async function initialiser(dossier) {
  const resultat = await git(dossier, ['init', '-b', 'main']);
  if (resultat.code !== 0) throw new Error(messageErreur(resultat, 'L\'initialisation de Git'));
  const gitignore = path.join(dossier, '.gitignore');
  if (!(await existe(gitignore))) await fs.writeFile(gitignore, GITIGNORE_DEFAUT, 'utf8');
}

// Enregistre toutes les modifications dans un commit. Renvoie { commite: bool }.
async function commiterTout(dossier, message) {
  const statut = await git(dossier, ['status', '--porcelain']);
  if (statut.code !== 0) throw new Error(messageErreur(statut, 'La lecture de l\'état Git'));
  if (statut.sortie.trim() === '') return { commite: false };
  const ajout = await git(dossier, ['add', '-A']);
  if (ajout.code !== 0) throw new Error(messageErreur(ajout, 'L\'ajout des fichiers'));
  const commit = await git(dossier, ['commit', '-m', message]);
  if (commit.code !== 0) throw new Error(messageErreur(commit, 'Le commit'));
  return { commite: true };
}

// Commit de quelques fichiers seulement (les autres modifications en cours ne sont pas touchées).
async function commiterFichiers(dossier, fichiers, message) {
  const ajout = await git(dossier, ['add', '--', ...fichiers]);
  if (ajout.code !== 0) throw new Error(messageErreur(ajout, 'L\'ajout des fichiers'));
  const prets = await git(dossier, ['diff', '--cached', '--name-only']);
  if (prets.sortie.trim() === '') return { commite: false };
  const commit = await git(dossier, ['commit', '-m', message, '--', ...fichiers]);
  if (commit.code !== 0) throw new Error(messageErreur(commit, 'Le commit'));
  return { commite: true };
}

// Adresse du dépôt distant « origin », ou null.
async function urlRemote(dossier) {
  const r = await git(dossier, ['remote', 'get-url', 'origin']);
  return r.code === 0 ? r.sortie.trim() || null : null;
}

async function aDesModifications(dossier) {
  const r = await git(dossier, ['status', '--porcelain']);
  return r.code === 0 && r.sortie.trim() !== '';
}

// Fichiers versionnés dont le chemin correspond à l'expression donnée.
async function fichiersSuivis(dossier, expression) {
  const r = await git(dossier, ['ls-files', '-z']);
  if (r.code !== 0) return [];
  return r.sortie.split('\0').filter((f) => f && expression.test(f));
}

// Les lignes de .gitignore qui protègent les secrets.
const LIGNES_SENSIBLES = ['.env', '.env.*', '*.jks', '*.keystore', 'local.properties'];

// Crée le .gitignore (complet) ou y ajoute les lignes sensibles manquantes.
// Renvoie la liste des lignes ajoutées (vide si rien à faire).
async function completerGitignore(dossier) {
  const chemin = path.join(dossier, '.gitignore');
  let actuel = null;
  try {
    actuel = await fs.readFile(chemin, 'utf8');
  } catch {
    // Pas de .gitignore.
  }
  if (actuel === null) {
    await fs.writeFile(chemin, GITIGNORE_DEFAUT, 'utf8');
    return LIGNES_SENSIBLES;
  }
  const presentes = new Set(actuel.split(/\r?\n/).map((l) => l.trim()));
  const manquantes = LIGNES_SENSIBLES.filter((l) => !presentes.has(l));
  if (manquantes.length > 0) {
    const fin = actuel.endsWith('\n') || actuel === '' ? '' : '\n';
    await fs.writeFile(chemin, `${actuel}${fin}\n# Ajouté par Toolkit : fichiers sensibles à ne jamais versionner\n${manquantes.join('\n')}\n`, 'utf8');
  }
  return manquantes;
}

// --- État d'un dépôt -------------------------------------------------------------------------

const LIBELLES_CHANGEMENTS = { M: 'modifié', A: 'ajouté', D: 'supprimé', R: 'renommé', C: 'copié', T: 'modifié', U: 'en conflit' };

// Adresse web d'un dépôt à partir de l'adresse Git (https ou ssh), ou null.
function urlWeb(remote) {
  if (!remote) return null;
  const ssh = /^git@([^:]+):(.+?)(\.git)?$/.exec(remote);
  if (ssh) return `https://${ssh[1]}/${ssh[2]}`;
  return /^https?:\/\//i.test(remote) ? remote.replace(/\.git$/, '').replace(/\/\/[^@/]+@/, '//') : null;
}

// État complet d'un dépôt (uniquement des informations locales : pas d'accès réseau).
// enRetard n'est fiable qu'après une vérification en ligne (fetch).
async function etatDepot(dossier) {
  if (!(await estDepot(dossier))) return { estDepot: false };
  const s = await git(dossier, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all']);
  if (s.code !== 0) throw new Error(messageErreur(s, 'La lecture de l\'état Git'));

  const etat = {
    estDepot: true, branche: null, aucunCommit: false, amont: null, enAvance: 0, enRetard: 0,
    modifications: [], nbModifications: 0, secretsNonProteges: [],
  };
  const entrees = s.sortie.split('\0');
  for (let i = 0; i < entrees.length; i++) {
    const ligne = entrees[i];
    if (!ligne) continue;
    if (ligne.startsWith('# branch.head ')) etat.branche = ligne.slice(14);
    else if (ligne.startsWith('# branch.oid ')) etat.aucunCommit = ligne.endsWith('(initial)');
    else if (ligne.startsWith('# branch.upstream ')) etat.amont = ligne.slice(18);
    else if (ligne.startsWith('# branch.ab ')) {
      const [, avance, retard] = /\+(\d+) -(\d+)/.exec(ligne) || [];
      etat.enAvance = Number(avance) || 0;
      etat.enRetard = Number(retard) || 0;
    } else if (!ligne.startsWith('#')) {
      const champs = ligne.split(' ');
      let chemin;
      let code;
      if (champs[0] === '?') {
        chemin = ligne.slice(2);
        code = 'nouveau';
        if (EXPRESSION_SECRETS.test(chemin)) etat.secretsNonProteges.push(chemin);
      } else if (champs[0] === '1') {
        chemin = champs.slice(8).join(' ');
        code = LIBELLES_CHANGEMENTS[champs[1].replace('.', '')[0]] || 'modifié';
      } else if (champs[0] === '2') {
        chemin = champs.slice(9).join(' ');
        code = 'renommé';
        i++; // l'entrée suivante est l'ancien nom
      } else if (champs[0] === 'u') {
        chemin = champs.slice(10).join(' ');
        code = 'en conflit';
      } else {
        continue;
      }
      etat.nbModifications++;
      if (etat.modifications.length < 200) etat.modifications.push({ chemin, etat: code });
    }
  }

  etat.remote = await urlRemote(dossier);
  etat.urlWeb = urlWeb(etat.remote);
  etat.secretsSuivis = await fichiersSuivis(dossier, EXPRESSION_SECRETS);
  etat.dernierCommit = null;
  if (!etat.aucunCommit) {
    const log = await git(dossier, ['log', '-1', '--format=%h%x00%s%x00%ct']);
    if (log.code === 0) {
      const [hash, message, date] = log.sortie.trim().split('\0');
      etat.dernierCommit = { hash, message, date: Number(date) * 1000 };
    }
  }
  return etat;
}

// --- Détail : commits et différences ---------------------------------------------------------

const LIBELLES_ETATS_FICHIERS = { M: 'modifié', A: 'ajouté', D: 'supprimé', R: 'renommé', C: 'copié', T: 'modifié' };
const TAILLE_MAX_DIFF = 300 * 1024;

// Commits à envoyer (sens 'envoyer') ou à récupérer (sens 'recuperer'), 100 au plus :
// [{ hash, message, date, auteur, fichiers: [{ chemin, etat }] }]
async function listerCommits(dossier, sens) {
  const etat = await etatDepot(dossier);
  if (!etat.estDepot || etat.aucunCommit) return [];
  let plage;
  if (sens === 'recuperer') {
    if (!etat.amont) return [];
    plage = ['HEAD..@{u}'];
  } else if (etat.amont) {
    plage = ['@{u}..HEAD'];
  } else {
    // Branche jamais envoyée : tous les commits absents du dépôt distant.
    plage = ['HEAD', '--not', '--remotes'];
  }
  const r = await git(dossier, ['-c', 'core.quotepath=off', 'log', ...plage, '--max-count=100',
    '--format=%x1e%h%x00%s%x00%ct%x00%an', '--name-status']);
  if (r.code !== 0) throw new Error(messageErreur(r, 'La lecture des commits'));
  return r.sortie.split('\x1e').filter((b) => b.trim()).map((bloc) => {
    const [entete, ...lignes] = bloc.split('\n');
    const [hash, message, date, auteur] = entete.split('\0');
    const fichiers = lignes.filter(Boolean).map((l) => {
      const champs = l.split('\t');
      const code = champs[0][0];
      return { etat: LIBELLES_ETATS_FICHIERS[code] || 'modifié', chemin: champs[champs.length - 1] };
    });
    return { hash, message, date: Number(date) * 1000, auteur, fichiers };
  });
}

// Différences d'un fichier : non enregistrées (sans hash) ou apportées par un commit (hash).
// Renvoie { texte, binaire, nouveau, tronque }.
async function differences(dossier, chemin, hash) {
  const relatif = String(chemin || '').replace(/\\/g, '/');
  const racine = path.resolve(dossier);
  const absolu = path.resolve(racine, relatif);
  if (!relatif || !absolu.toLowerCase().startsWith(racine.toLowerCase() + path.sep)) throw new Error('Chemin de fichier invalide.');
  if (hash && !/^[0-9a-f]{4,40}$/i.test(hash)) throw new Error('Commit invalide.');

  let args;
  if (hash) {
    args = ['show', '--format=', '--no-color', hash, '--', relatif];
  } else {
    // Fichier jamais enregistré (nouveau) : tout son contenu est « ajouté ».
    const suivi = await git(dossier, ['ls-files', '--error-unmatch', '--', relatif]);
    const aucunCommit = (await git(dossier, ['rev-parse', '--verify', 'HEAD'])).code !== 0;
    if (suivi.code !== 0 || aucunCommit) {
      let contenu;
      try {
        const infos = await fs.stat(absolu);
        if (infos.isDirectory()) return { texte: '', nouveau: true, binaire: false, tronque: false };
        contenu = await fs.readFile(absolu);
      } catch {
        return { texte: '', nouveau: true, binaire: false, tronque: false };
      }
      if (contenu.subarray(0, 8000).includes(0)) return { texte: '', nouveau: true, binaire: true, tronque: false };
      const texte = contenu.subarray(0, TAILLE_MAX_DIFF).toString('utf8');
      return {
        texte: texte.split('\n').map((l) => `+${l}`).join('\n'),
        nouveau: true,
        binaire: false,
        tronque: contenu.length > TAILLE_MAX_DIFF,
      };
    }
    args = ['diff', 'HEAD', '--no-color', '--', relatif];
  }
  const r = await git(dossier, ['-c', 'core.quotepath=off', ...args]);
  if (r.code !== 0) throw new Error(messageErreur(r, 'La lecture des différences'));
  const binaire = /^Binary files .* differ$/m.test(r.sortie);
  return {
    texte: binaire ? '' : r.sortie.slice(0, TAILLE_MAX_DIFF),
    binaire,
    nouveau: false,
    tronque: r.sortie.length > TAILLE_MAX_DIFF,
  };
}

// --- Historique et retour arrière ------------------------------------------------------------
// Rien n'est jamais réécrit : revenir à une version crée un NOUVEAU commit (annulable), après
// une sauvegarde des modifications en cours.

const MESSAGE_SAUVEGARDE_CLAUDE = 'Sauvegarde automatique avant modification par Claude';

function verifierHash(hash) {
  if (!/^[0-9a-f]{4,40}$/i.test(String(hash || ''))) throw new Error('Version invalide.');
}

function cheminRelatif(dossier, chemin) {
  const relatif = String(chemin || '').replace(/\\/g, '/');
  const racine = path.resolve(dossier);
  const absolu = path.resolve(racine, relatif);
  if (!relatif || !absolu.toLowerCase().startsWith(racine.toLowerCase() + path.sep)) throw new Error('Chemin de fichier invalide.');
  return relatif;
}

function lireNameStatus(lignes) {
  return lignes.filter(Boolean).map((l) => {
    const champs = l.split('\t');
    return { etat: LIBELLES_ETATS_FICHIERS[champs[0][0]] || 'modifié', chemin: champs[champs.length - 1] };
  });
}

// Versions (commits) du projet, de la plus récente à la plus ancienne ; chemin : seulement
// celles qui touchent ce fichier. -> [{ hash, message, date, auteur, sauvegardeClaude, fichiers }]
async function historique(dossier, { chemin = null, maximum = 300 } = {}) {
  if ((await git(dossier, ['rev-parse', '--verify', 'HEAD'])).code !== 0) return [];
  const filtre = chemin ? ['--', cheminRelatif(dossier, chemin)] : [];
  const r = await git(dossier, ['-c', 'core.quotepath=off', 'log', `--max-count=${maximum}`,
    '--format=%x1e%H%x00%s%x00%ct%x00%an', '--name-status', ...filtre]);
  if (r.code !== 0) throw new Error(messageErreur(r, 'La lecture de l\'historique'));
  return r.sortie.split('\x1e').filter((b) => b.trim()).map((bloc) => {
    const [entete, ...lignes] = bloc.split('\n');
    const [hash, message, date, auteur] = entete.split('\0');
    return {
      hash,
      message,
      date: Number(date) * 1000,
      auteur,
      sauvegardeClaude: message.startsWith(MESSAGE_SAUVEGARDE_CLAUDE),
      fichiers: lireNameStatus(lignes),
    };
  });
}

// Fichiers qui diffèrent entre cette version et l'état actuel du dossier.
async function fichiersDifferentsDepuis(dossier, hash) {
  verifierHash(hash);
  const r = await git(dossier, ['-c', 'core.quotepath=off', 'diff', '--name-status', '--no-renames', hash]);
  if (r.code !== 0) throw new Error(messageErreur(r, 'La comparaison'));
  // « ajouté » vu depuis la version : le fichier n'existait pas encore à ce moment-là.
  return lireNameStatus(r.sortie.split('\n'));
}

// Différences d'un fichier entre cette version et maintenant.
async function differencesDepuis(dossier, hash, chemin) {
  verifierHash(hash);
  const relatif = cheminRelatif(dossier, chemin);
  const r = await git(dossier, ['-c', 'core.quotepath=off', 'diff', '--no-color', '--no-renames', hash, '--', relatif]);
  if (r.code !== 0) throw new Error(messageErreur(r, 'La comparaison'));
  const binaire = /^Binary files .* differ$/m.test(r.sortie);
  return { texte: binaire ? '' : r.sortie.slice(0, TAILLE_MAX_DIFF), binaire, nouveau: false, tronque: r.sortie.length > TAILLE_MAX_DIFF };
}

// Remet tout le projet (chemins null) ou certains fichiers comme dans cette version.
// Un fichier absent de cette version est retiré (il reste dans l'historique).
// Renvoie { sauvegarde: bool (modifs en cours enregistrées avant), commite: bool }.
async function restaurer(dossier, hash, chemins = null) {
  verifierHash(hash);
  const date = new Date().toLocaleString('fr-FR');
  const { commite: sauvegarde } = await commiterTout(dossier, `Sauvegarde automatique avant retour en arrière (${date})`);
  const info = await git(dossier, ['log', '-1', '--format=%s%x00%ct', hash]);
  if (info.code !== 0) throw new Error('Cette version est introuvable dans l\'historique.');
  const [message, quand] = info.sortie.trim().split('\0');
  const dateVersion = new Date(Number(quand) * 1000).toLocaleString('fr-FR');

  const cibles = chemins ? chemins.map((c) => cheminRelatif(dossier, c)) : ['.'];
  if (chemins) {
    // Un fichier qui n'existait pas dans cette version : on le retire du suivi et du disque.
    for (const c of cibles) {
      const present = await git(dossier, ['cat-file', '-e', `${hash}:${c}`]);
      if (present.code !== 0) {
        const rm = await git(dossier, ['rm', '-q', '--ignore-unmatch', '--', c]);
        if (rm.code !== 0) throw new Error(messageErreur(rm, 'Le retour en arrière'));
      } else {
        const r = await git(dossier, ['restore', `--source=${hash}`, '--staged', '--worktree', '--', c]);
        if (r.code !== 0) throw new Error(messageErreur(r, 'Le retour en arrière'));
      }
    }
  } else {
    const r = await git(dossier, ['restore', `--source=${hash}`, '--staged', '--worktree', '--', ':/']);
    if (r.code !== 0) throw new Error(messageErreur(r, 'Le retour en arrière'));
  }
  const prets = await git(dossier, ['diff', '--cached', '--name-only']);
  if (prets.sortie.trim() === '') return { sauvegarde, commite: false };
  const titre = chemins
    ? `Retour de ${cibles.length === 1 ? `« ${cibles[0]} »` : `${cibles.length} fichiers`} à la version du ${dateVersion}`
    : `Retour du projet à la version du ${dateVersion}`;
  const commit = await git(dossier, ['commit', '-m', titre, '-m', `Version choisie : « ${message} » (${hash.slice(0, 7)})`]);
  if (commit.code !== 0) throw new Error(messageErreur(commit, 'Le commit du retour en arrière'));
  return { sauvegarde, commite: true };
}

// --- Envoi et récupération -------------------------------------------------------------------

// Envoie les commits sur le dépôt distant (publie la branche si besoin).
async function pousser(dossier) {
  const etat = await etatDepot(dossier);
  if (!etat.estDepot) throw new Error('Ce projet n\'a pas d\'historique Git.');
  if (!etat.remote) throw new Error('Ce projet n\'est relié à aucun dépôt GitHub : crée-en un d\'abord.');
  if (etat.aucunCommit) throw new Error('Il n\'y a encore rien à envoyer : fais d\'abord un « Commit ».');
  const args = etat.amont ? ['push'] : ['push', '-u', 'origin', etat.branche];
  const r = await gitReseau(dossier, args);
  if (r.code !== 0) throw new Error(messageErreurReseau(r, 'L\'envoi (Push)'));
  return { envoyes: etat.amont ? etat.enAvance : null };
}

// Récupère les changements du dépôt distant, seulement s'ils s'ajoutent simplement
// (jamais de fusion automatique).
async function recuperer(dossier) {
  const etat = await etatDepot(dossier);
  if (!etat.estDepot) throw new Error('Ce projet n\'a pas d\'historique Git.');
  if (!etat.remote) throw new Error('Ce projet n\'est relié à aucun dépôt GitHub.');
  const args = etat.amont ? ['pull', '--ff-only'] : ['pull', '--ff-only', 'origin', etat.branche];
  const r = await gitReseau(dossier, args);
  if (r.code !== 0) {
    if (/couldn't find remote ref/i.test(r.erreur)) return { message: 'Rien à récupérer : cette branche n\'existe pas encore sur GitHub.' };
    throw new Error(messageErreurReseau(r, 'La récupération (Pull)'));
  }
  if (/Already up to date|Déjà à jour/i.test(r.sortie)) return { message: 'Déjà à jour : rien de nouveau sur GitHub.' };
  const fichiers = /(\d+) files? changed/.exec(r.sortie)?.[1];
  return { message: `Changements récupérés${fichiers ? ` (${fichiers} fichier(s) mis à jour)` : ''}.` };
}

// Met à jour les informations du dépôt distant (pour savoir s'il y a des choses à récupérer).
async function verifierEnLigne(dossier) {
  const r = await gitReseau(dossier, ['fetch', '--prune', 'origin']);
  if (r.code !== 0) throw new Error(messageErreurReseau(r, 'La vérification en ligne'));
}

// Clone un dépôt ; surProgression(texte) reçoit les messages de git.
async function cloner(url, destination, surProgression) {
  const identification = await optionsIdentification();
  return new Promise((resoudre, rejeter) => {
    const { spawn } = require('node:child_process');
    const processus = spawn('git', [...identification, 'clone', '--progress', url, destination], {
      env: { ...environnementPropre(), GIT_TERMINAL_PROMPT: '0' },
      windowsHide: true,
    });
    let erreurs = '';
    processus.stderr.on('data', (d) => {
      const texte = d.toString();
      erreurs += texte;
      surProgression?.(texte.split(/[\r\n]+/).filter(Boolean).pop() || '');
    });
    processus.on('error', (e) => rejeter(e.code === 'ENOENT'
      ? new Error('Git est introuvable sur ce PC. Installe-le (dans PowerShell : winget install Git.Git), puis redémarre Toolkit.')
      : e));
    processus.on('close', (code) => {
      if (code === 0) resoudre();
      else if (/not found|does not exist|Repository not found/i.test(erreurs)) {
        rejeter(new Error('Ce dépôt est introuvable. Vérifie l\'adresse ; s\'il est privé, connecte-toi avec « gh auth login ».'));
      } else if (/Authentication|could not read Username|Permission denied/i.test(erreurs)) {
        rejeter(new Error('Accès refusé à ce dépôt. S\'il est privé, connecte-toi à GitHub dans PowerShell : gh auth login'));
      } else {
        rejeter(new Error(`Le clonage a échoué : ${erreurs.trim().split('\n').pop()}`));
      }
    });
  });
}

module.exports = {
  GITIGNORE_DEFAUT,
  LIGNES_SENSIBLES,
  EXPRESSION_SECRETS,
  etatDepot,
  listerCommits,
  differences,
  historique,
  fichiersDifferentsDepuis,
  differencesDepuis,
  restaurer,
  pousser,
  recuperer,
  verifierEnLigne,
  gitReseau,
  messageErreurReseau,
  urlWeb,
  git,
  gitDisponible,
  estDepot,
  initialiser,
  commiterTout,
  commiterFichiers,
  urlRemote,
  aDesModifications,
  fichiersSuivis,
  completerGitignore,
  cloner,
};
