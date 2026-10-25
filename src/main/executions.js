// Exécution des « actions » de projet.json (boutons qui lancent un script).
//
// - La commande est découpée en arguments, puis chaque {parametre} est remplacé par sa
//   valeur : un fichier ou un texte saisi devient UN argument, quels que soient ses
//   espaces ou caractères spéciaux (aucun shell n'interprète la commande).
// - Le programme (python, node, gradlew…) est cherché dans le dossier du projet puis sur
//   le PC ; s'il manque, le message explique comment l'installer.
// - La sortie (stdout / stderr) est envoyée en direct à l'interface.
'use strict';

const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const chemins = require('./chemins');
const projets = require('./projets');
const activite = require('./activite');
const journal = require('./journal');
const { environnementPropre, sortieDe } = require('./processus');
const java = require('./java');

const DELAI_ENVOI = 30;
const EXTENSIONS_EXECUTABLES = ['.exe', '.cmd', '.bat', '.com'];

// Comment installer les programmes les plus courants.
const INSTALLATION = {
  python: 'Installe Python : dans PowerShell, tape « winget install Python.Python.3.13 », puis redémarre Toolkit.',
  node: 'Installe Node.js : dans PowerShell, tape « winget install OpenJS.NodeJS.LTS », puis redémarre Toolkit.',
  java: 'Installe Java : dans PowerShell, tape « winget install Microsoft.OpenJDK.21 », puis redémarre Toolkit.',
  git: 'Installe Git : dans PowerShell, tape « winget install Git.Git », puis redémarre Toolkit.',
};
// gradlew n'est pas un logiciel à installer mais un fichier fourni avec le projet.
INSTALLATION.gradlew = 'Ce projet ne contient pas « gradlew.bat » (le lanceur Gradle fourni avec les projets '
  + 'Gradle : mods Minecraft, Android). Vérifie que le projet est complet, ou ouvre-le une fois dans '
  + 'Android Studio / IntelliJ, ou demande à Claude d\'ajouter le wrapper Gradle.';
INSTALLATION.python3 = INSTALLATION.python;
INSTALLATION.py = INSTALLATION.python;
INSTALLATION.npm = INSTALLATION.node;
INSTALLATION.npx = INSTALLATION.node;

// id -> { processus, contenu, tampons, minuteur, dossierApres, arrete }
const enCours = new Map();
// id -> dossier à ouvrir après la fin (gardé pour le bouton « Ouvrir le dossier »)
const dossiersApres = new Map();

// --- Découpage et remplacement des paramètres -------------------------------------------

// Découpe une commande en arguments ; les guillemets regroupent un argument avec espaces.
function decouper(commande) {
  const jetons = [];
  let courant = '';
  let dansGuillemets = false;
  let jetonCommence = false;
  for (const c of commande) {
    if (c === '"') {
      dansGuillemets = !dansGuillemets;
      jetonCommence = true;
    } else if (/\s/.test(c) && !dansGuillemets) {
      if (jetonCommence) jetons.push(courant);
      courant = '';
      jetonCommence = false;
    } else {
      courant += c;
      jetonCommence = true;
    }
  }
  if (dansGuillemets) throw new Error('La commande de cette action contient un guillemet non fermé (voir projet.json).');
  if (jetonCommence) jetons.push(courant);
  return jetons;
}

// Valeur d'un paramètre : texte, ou liste de textes pour « fichiers ».
function valeurParametre(parametre, valeurs) {
  const v = valeurs[parametre.id];
  switch (parametre.type) {
    case 'fichiers':
      return Array.isArray(v) ? v.map(String) : [];
    case 'case':
      if (parametre.valeur_si_coche !== undefined) {
        return v ? String(parametre.valeur_si_coche) : String(parametre.valeur_si_decoche ?? '');
      }
      return v ? 'true' : 'false';
    case 'dossier': {
      const texte = String(v ?? '');
      // « D:\ » finirait par un antislash qui fausserait les guillemets : « D:\. » est équivalent.
      return /\\$/.test(texte) ? `${texte}.` : texte;
    }
    default:
      return String(v ?? '');
  }
}

function verifierValeurs(action, valeurs) {
  for (const p of action.parametres) {
    if (!p.obligatoire || p.type === 'case') continue;
    const v = valeurParametre(p, valeurs);
    if (Array.isArray(v) ? v.length === 0 : v.trim() === '') {
      throw new Error(`Le paramètre « ${p.libelle} » est obligatoire.`);
    }
  }
}

// Remplace {id} dans les arguments. Un argument qui n'est que « {fichiers} » devient
// autant d'arguments que de fichiers ; un paramètre vide fait disparaître l'argument.
function remplacer(jetons, action, valeurs) {
  const parId = new Map(action.parametres.map((p) => [p.id, p]));
  const lire = (id) => {
    const p = parId.get(id);
    if (!p) throw new Error(`La commande utilise {${id}}, qui n'est pas un paramètre de l'action (voir projet.json).`);
    return valeurParametre(p, valeurs);
  };
  const resultat = [];
  for (const jeton of jetons) {
    const seul = /^\{(\w+)\}$/.exec(jeton);
    if (seul) {
      const v = lire(seul[1]);
      if (Array.isArray(v)) resultat.push(...v);
      else if (v !== '') resultat.push(v);
    } else {
      resultat.push(jeton.replace(/\{(\w+)\}/g, (_tout, id) => {
        const v = lire(id);
        return Array.isArray(v) ? v.join(' ') : v;
      }));
    }
  }
  return resultat;
}

// --- Recherche du programme ----------------------------------------------------------------

async function fichierExiste(chemin) {
  try {
    return (await fs.stat(chemin)).isFile();
  } catch {
    return false;
  }
}

const cacheProgrammes = new Map();

// Python : « python » peut être un faux raccourci du Microsoft Store qui ne fait rien ;
// on vérifie donc qu'il répond, sinon on essaie le lanceur « py ».
async function trouverPython() {
  for (const nom of ['python', 'py']) {
    const chemin = await trouverSurLePc(nom);
    if (chemin && /Python \d/.test((await sortieDe(chemin, ['--version'])) || '')) return chemin;
  }
  return null;
}

async function trouverSurLePc(nom) {
  const lignes = (await sortieDe('where', [nom]))?.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) || [];
  return lignes.find((l) => EXTENSIONS_EXECUTABLES.includes(path.extname(l).toLowerCase())) || null;
}

// Renvoie le chemin complet du programme, ou lance une erreur explicative.
async function resoudreProgramme(nom, dossier) {
  // 1. Fichier du projet (ex. gradlew → gradlew.bat, ou chemin relatif « outils\x.exe »).
  const local = path.resolve(dossier, nom);
  for (const ext of ['', ...EXTENSIONS_EXECUTABLES]) {
    if ((ext || EXTENSIONS_EXECUTABLES.includes(path.extname(local).toLowerCase())) && await fichierExiste(local + ext)) {
      return local + ext;
    }
  }
  if (/[\\/]/.test(nom)) throw new Error(`Le fichier « ${nom} » est introuvable dans le projet.`);

  // 2. Programme installé sur le PC.
  const cle = nom.toLowerCase();
  if (!cacheProgrammes.has(cle)) {
    const chemin = ['python', 'python3', 'py'].includes(cle) ? await trouverPython() : await trouverSurLePc(nom);
    if (chemin) cacheProgrammes.set(cle, chemin);
    else {
      throw new Error(`Le programme « ${nom} » est introuvable (ni dans le projet, ni sur ce PC).\n${INSTALLATION[cle]
        || 'Vérifie qu\'il est installé, puis redémarre Toolkit.'}`);
    }
  }
  return cacheProgrammes.get(cle);
}

// État des programmes courants (pour les Réglages).
async function detecterProgrammes() {
  const verifier = async (nom, libelle, trouver, args = ['--version']) => {
    const chemin = await trouver();
    const version = chemin ? ((await sortieDe(chemin, args)) || '').trim().split(/\r?\n/)[0] : null;
    return { nom, libelle, chemin, version, installation: INSTALLATION[nom] || null };
  };
  cacheProgrammes.clear();
  const [base, jdks, sdk] = await Promise.all([
    Promise.all([
      verifier('python', 'Python', trouverPython),
      verifier('node', 'Node.js', () => trouverSurLePc('node')),
    ]),
    java.trouverJdks(),
    java.emplacementSdkAndroid(),
  ]);
  // Java (pour compiler les mods et les applications Android) : chaque JDK trouvé.
  const lignesJava = jdks.length
    ? jdks.map((j) => ({ nom: 'java', libelle: `Java ${j.version}${j.source === 'JAVA_HOME' ? ' (JAVA_HOME)' : ''}`, chemin: j.chemin, version: j.source, installation: null }))
    : [{ nom: 'java', libelle: 'Java', chemin: null, version: null, installation: `${INSTALLATION.java} (nécessaire seulement pour compiler les mods Minecraft et les applications Android)` }];
  const ligneSdk = {
    nom: 'android-sdk',
    libelle: 'SDK Android',
    chemin: sdk,
    version: sdk ? 'Trouvé' : null,
    installation: 'Installe Android Studio : il installe le SDK Android (nécessaire seulement pour compiler les applications Android).',
  };
  return [...base, ...lignesJava, ligneSdk];
}

// --- Lancement ----------------------------------------------------------------------------

// Pour l'affichage seulement : relatif à Toolkit s'il est dedans, sinon complet.
function cheminLisible(chemin) {
  const relatif = chemins.versRelatif(chemin);
  return relatif.startsWith('..') || path.isAbsolute(relatif) ? chemin : relatif;
}

// Pour l'affichage : la commande telle qu'on la taperait.
function commandeLisible(programme, args) {
  return [programme, ...args].map((a) => (/[\s"]/.test(a) || a === '' ? `"${a.replace(/"/g, '\\"')}"` : a)).join(' ');
}

function envoyer(id, canal, ...args) {
  const e = enCours.get(id);
  if (e && !e.contenu.isDestroyed()) e.contenu.send(canal, id, ...args);
}

function viderTampons(id) {
  const e = enCours.get(id);
  if (!e) return;
  e.minuteur = null;
  for (const flux of ['stdout', 'stderr']) {
    if (e.tampons[flux]) {
      envoyer(id, 'execution:sortie', flux, e.tampons[flux]);
      e.tampons[flux] = '';
    }
  }
}

// Décodage de la sortie : UTF-8, ou à défaut l'encodage Windows d'Europe de l'Ouest.
function decodeur() {
  let utf8 = new TextDecoder('utf-8', { fatal: true });
  const ansi = new TextDecoder('windows-1252');
  return (morceau) => {
    if (utf8) {
      try {
        return utf8.decode(morceau, { stream: true });
      } catch {
        utf8 = null;
      }
    }
    return ansi.decode(morceau);
  };
}

// Lance l'action n° indexAction du projet. contenu : webContents de l'interface.
// Renvoie { commande, dossier } pour l'affichage.
async function lancer(contenu, id, projetId, indexAction, valeurs = {}) {
  if (enCours.has(id)) throw new Error('Cette exécution est déjà en cours.');
  const projet = await projets.chargerProjet(projetId);
  if (!projet) throw new Error('Ce projet n\'existe plus.');
  if (projet.erreur) throw new Error('La fiche projet.json de ce projet est illisible : corrige-la d\'abord.');
  const action = projet.fiche.actions[indexAction];
  if (!action) throw new Error('Cette action n\'existe plus dans projet.json.');

  const dossierProjet = path.join(chemins.projets(), projetId);
  const dossier = path.resolve(dossierProjet, action.dossier || '.');
  if (dossier !== dossierProjet && !dossier.startsWith(dossierProjet + path.sep)) {
    throw new Error('Le champ « dossier » de l\'action doit désigner un dossier du projet.');
  }

  verifierValeurs(action, valeurs);
  const [nomProgramme, ...jetons] = decouper(action.commande);
  if (!nomProgramme) throw new Error('La commande de cette action est vide.');
  const args = remplacer(jetons, action, valeurs);
  const programme = await resoudreProgramme(nomProgramme, dossier);

  let dossierApres = null;
  if (action.ouvrir_dossier_apres) {
    const brut = remplacer([action.ouvrir_dossier_apres], { parametres: action.parametres }, valeurs)[0];
    if (brut) dossierApres = path.resolve(dossierProjet, brut);
  }

  // Gradle (mods Minecraft, Android) : choix du Java et du SDK Android.
  const infos = [];
  let envGradle = {};
  if (/^gradlew(\.bat)?$/i.test(path.basename(programme))) {
    const gradle = await java.environnementGradle(dossierProjet, { android: projet.fiche.type === 'android' });
    envGradle = gradle.env;
    infos.push(...gradle.infos, 'La première compilation peut prendre plusieurs minutes : Gradle télécharge ce dont il a besoin.');
  }

  const env = environnementPropre({ PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', ...envGradle });
  const options = { cwd: dossier, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] };
  let processus;
  if (/\.(cmd|bat)$/i.test(programme)) {
    // Les .bat / .cmd passent obligatoirement par cmd.exe, qui interprète « " » et « % ».
    if (args.some((a) => /["%]/.test(a))) {
      throw new Error('Un paramètre contient « " » ou « % », ce qui n\'est pas possible avec un script .bat ou .cmd.');
    }
    const ligne = [programme, ...args].map((a) => `"${a}"`).join(' ');
    processus = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${ligne}"`], { ...options, windowsVerbatimArguments: true });
  } else {
    processus = spawn(programme, args, options);
  }

  const execution = { processus, contenu, tampons: { stdout: '', stderr: '' }, minuteur: null, dossierApres, arrete: false };
  enCours.set(id, execution);
  activite.debut();
  const debut = Date.now();
  processus.stdin.end(); // un script qui attend une saisie reçoit « fin de saisie » au lieu de bloquer

  for (const flux of ['stdout', 'stderr']) {
    const decoder = decodeur();
    processus[flux].on('data', (morceau) => {
      execution.tampons[flux] += decoder(morceau);
      if (!execution.minuteur) execution.minuteur = setTimeout(() => viderTampons(id), DELAI_ENVOI);
    });
  }

  let termine = false;
  const terminer = (code, erreur) => {
    if (termine) return;
    termine = true;
    clearTimeout(execution.minuteur);
    viderTampons(id);
    let dossierExiste = false;
    let produits = [];
    const finir = () => {
      if (dossierApres) dossiersApres.set(id, { dossier: dossierApres, fichier: produits[0] ? path.join(dossierApres, produits[0]) : null });
      envoyer(id, 'execution:fin', {
        code,
        erreur: erreur || null,
        arrete: execution.arrete,
        duree: Date.now() - debut,
        dossierApres: dossierExiste ? cheminLisible(dossierApres) : null,
        produits,
      });
      enCours.delete(id);
      activite.fin();
    };
    if (!dossierApres) {
      finir();
      return;
    }
    fs.stat(dossierApres)
      .then(async (s) => {
        dossierExiste = s.isDirectory();
        if (dossierExiste && code === 0) produits = await fichiersProduits(dossierApres, debut);
      }, () => {})
      .finally(finir);
  };
  processus.on('error', (erreur) => {
    journal.erreur('Exécution :', erreur);
    terminer(null, `Impossible de lancer le programme : ${erreur.message}`);
  });
  processus.on('close', (code) => terminer(code));

  return { commande: commandeLisible(nomProgramme, args), dossier: cheminLisible(dossier), infos };
}

// Fichiers créés ou modifiés pendant l'exécution dans le dossier de sortie (ex. le .jar du
// mod, l'.apk), le fichier principal en premier (pas les « -sources », « -dev »…).
async function fichiersProduits(dossier, depuis) {
  let entrees;
  try {
    entrees = await fs.readdir(dossier, { withFileTypes: true });
  } catch {
    return [];
  }
  const recents = [];
  for (const e of entrees.filter((x) => x.isFile())) {
    try {
      const infos = await fs.stat(path.join(dossier, e.name));
      if (infos.mtimeMs >= depuis - 2000) recents.push({ nom: e.name, taille: infos.size });
    } catch {
      // Fichier disparu.
    }
  }
  const secondaire = (nom) => /-(sources|dev|javadoc|slim|shadow|all)\.jar$|\.(json|txt|idsig)$/i.test(nom);
  return recents
    .sort((a, b) => secondaire(a.nom) - secondaire(b.nom) || b.taille - a.taille)
    .map((f) => f.nom);
}

// Arrête le programme ET ses sous-programmes (ex. Java lancé par Gradle).
function arreter(id) {
  const e = enCours.get(id);
  if (!e) return;
  e.arrete = true;
  execFile('taskkill', ['/pid', String(e.processus.pid), '/T', '/F'], { windowsHide: true }, (erreur) => {
    if (erreur) e.processus.kill();
  });
}

function arreterTout() {
  for (const id of enCours.keys()) arreter(id);
}

// { dossier, fichier } : dossier de sortie et fichier principal produit (ou null).
function dossierApres(id) {
  return dossiersApres.get(id) || null;
}

function oublier(id) {
  dossiersApres.delete(id);
}

module.exports = { lancer, arreter, arreterTout, dossierApres, oublier, detecterProgrammes, decouper };
