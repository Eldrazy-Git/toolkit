// Assistant d'import de projets existants (dossier du PC ou dépôt GitHub).
//
// 1. analyser() : parcourt le dossier SANS RIEN MODIFIER, détecte le type de projet et
//    produit un rapport (dossiers à exclure, chemins absolus, liens, fichiers verrouillés,
//    gros fichiers, secrets suivis par Git, outils HTML d'une appli Android…).
// 2. executer() : après confirmation, copie le projet dans projets/, VÉRIFIE la copie
//    (tailles + contenu des fichiers jusqu'à 20 Mo), génère projet.json / CLAUDE.md /
//    .gitignore, Git, puis envoie l'original à la CORBEILLE (jamais de suppression
//    définitive). En cas d'échec de la copie, l'original n'est pas touché.
// Un clone GitHub est fait dans donnees/import-temp/, puis rangé dans projets/ à la fin.
'use strict';

const { shell } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const chemins = require('./chemins');
const { ecrireJson, existe, lireJson } = require('./fichiers');
const { genererClaudeMd, sectionPourClaudeMdExistant } = require('./claude-md');
const git = require('./git');
const github = require('./github');
const journal = require('./journal');

// Dossiers régénérables, toujours proposés à l'exclusion.
const TOUJOURS_EXCLUS = new Set(['node_modules', '.gradle', '.idea', '__pycache__', '.venv', 'venv', '.cxx',
  '.next', '.parcel-cache', '.pytest_cache', '.mypy_cache', '.externalNativeBuild', '.kotlin']);
// Dossiers de résultats de compilation : exclus seulement si le projet a un outil de compilation.
const EXCLUS_SI_COMPILATION = new Set(['build', 'dist', 'out', 'target']);
const FICHIERS_COMPILATION = ['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts',
  'package.json', 'pom.xml', 'pyproject.toml', 'setup.py'];

const EXTENSIONS_TEXTE = /\.(html?|css|m?js|cjs|ts|tsx|jsx|json|py|md|txt|bat|cmd|ps1|xml|ya?ml|toml|ini|cfg|gradle|kts|java|kt|properties|sh|vue|svelte|mcmeta)$/i;
const TAILLE_MAX_ANALYSE_TEXTE = 1024 * 1024;
const TAILLE_MAX_EMPREINTE = 20 * 1024 * 1024;
const TAILLE_GROS_FICHIER = 100 * 1024 * 1024; // limite de GitHub
const { EXPRESSION_SECRETS } = git;

// Analyses en attente de confirmation : id -> { source, mode, ... }
const analyses = new Map();

// --- Outils -------------------------------------------------------------------------------

function tailleLisible(octets) {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 ** 2) return `${(octets / 1024).toFixed(0)} Ko`;
  if (octets < 1024 ** 3) return `${(octets / 1024 ** 2).toFixed(1).replace('.', ',')} Mo`;
  return `${(octets / 1024 ** 3).toFixed(2).replace('.', ',')} Go`;
}

function slug(texte) {
  return texte.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'projet';
}

async function idLibre(base) {
  let id = base;
  for (let n = 2; await existe(path.join(chemins.projets(), id)); n++) id = `${base}-${n}`;
  return id;
}

function relatif(racine, chemin) {
  return path.relative(racine, chemin).split(path.sep).join('/');
}

// Exécute des tâches asynchrones avec un nombre limité en parallèle.
async function parLots(elements, taille, fonction) {
  let i = 0;
  const travailleurs = Array.from({ length: Math.min(taille, elements.length) }, async () => {
    while (i < elements.length) {
      const element = elements[i++];
      await fonction(element);
    }
  });
  await Promise.all(travailleurs);
}

async function empreinte(chemin) {
  return new Promise((resoudre, rejeter) => {
    const h = crypto.createHash('sha1');
    createReadStream(chemin).on('data', (d) => h.update(d)).on('error', rejeter).on('end', () => resoudre(h.digest('hex')));
  });
}

// --- Vérification du dossier source ------------------------------------------------------

function verifierSource(source) {
  const s = path.resolve(source);
  const interdits = [
    path.parse(s).root,
    os.homedir(),
    path.join(os.homedir(), 'Desktop'),
    path.join(os.homedir(), 'Documents'),
    path.join(os.homedir(), 'Downloads'),
    process.env.SystemRoot,
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
  ].filter(Boolean).map((p) => path.resolve(p).toLowerCase());
  if (interdits.includes(s.toLowerCase())) {
    throw new Error('Ce dossier est trop général (disque, dossier personnel, Bureau…). Choisis le dossier du projet lui-même.');
  }
  const racine = chemins.racine.toLowerCase();
  const sl = s.toLowerCase();
  if (sl === racine || sl.startsWith(racine + path.sep)) {
    throw new Error('Ce dossier fait déjà partie de Toolkit.');
  }
  if (racine.startsWith(sl + path.sep)) {
    throw new Error('Ce dossier contient Toolkit lui-même : il ne peut pas être importé.');
  }
  return s;
}

// --- Parcours du dossier -----------------------------------------------------------------

// Taille et nombre de fichiers d'un dossier (plafonné pour rester rapide).
async function mesurer(dossier, plafond = 200000) {
  let taille = 0;
  let fichiers = 0;
  const pile = [dossier];
  while (pile.length && fichiers < plafond) {
    const d = pile.pop();
    let entrees;
    try {
      entrees = await fs.readdir(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entrees) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) pile.push(p);
      else if (e.isFile()) {
        fichiers++;
        try {
          taille += (await fs.stat(p)).size;
        } catch {
          // Fichier disparu : ignoré.
        }
      }
    }
  }
  return { taille, fichiers };
}

// Liste le contenu du projet. exclure(rel, nom) : true pour ne pas descendre dans un dossier.
// Renvoie { dossiers, fichiers: [{ rel, taille }], liens: [{ rel, cible }], exclus: [rel], git }
async function lister(racine, exclure) {
  const resultat = { dossiers: [], fichiers: [], liens: [], exclus: [], aGit: false };
  const pile = [''];
  while (pile.length) {
    const rel = pile.pop();
    let entrees;
    try {
      entrees = await fs.readdir(path.join(racine, rel), { withFileTypes: true });
    } catch (erreur) {
      throw new Error(`Impossible de lire le dossier « ${rel || '.'} » : ${erreur.message}`);
    }
    for (const e of entrees) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      const absolu = path.join(racine, r);
      if (e.isSymbolicLink()) {
        let cible = '';
        try {
          cible = await fs.readlink(absolu);
        } catch {
          // Lien illisible.
        }
        resultat.liens.push({ rel: r, cible });
      } else if (e.isDirectory()) {
        if (r === '.git') resultat.aGit = true;
        if (exclure(r, e.name)) {
          resultat.exclus.push(r);
        } else {
          resultat.dossiers.push(r);
          pile.push(r);
        }
      } else if (e.isFile()) {
        let taille = 0;
        try {
          taille = (await fs.stat(absolu)).size;
        } catch {
          // Fichier disparu entre-temps.
        }
        resultat.fichiers.push({ rel: r, taille });
      }
    }
  }
  return resultat;
}

// --- Détection du type de projet -----------------------------------------------------------

async function lireTexte(racine, rel, max = 300000) {
  try {
    const fichier = path.join(racine, rel);
    if ((await fs.stat(fichier)).size > max) return null;
    return await fs.readFile(fichier, 'utf8');
  } catch {
    return null;
  }
}

function premierParagrapheReadme(texte) {
  if (!texte) return '';
  const paragraphe = texte.split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .find((p) => p && !p.startsWith('#') && !p.startsWith('![') && !p.startsWith('<') && !p.startsWith('[!'));
  return paragraphe ? paragraphe.replace(/\s+/g, ' ').slice(0, 200) : '';
}

// Renvoie { type, technologies, lancer, point_entree, ouvrir_avec, actions, description, outilsHtml, details }
async function detecter(racine, fichiers) {
  const rels = fichiers.map((f) => f.rel).filter((r) => !r.startsWith('.git/'));
  const minuscules = new Set(rels.map((r) => r.toLowerCase()));
  const aRacine = (nom) => minuscules.has(nom.toLowerCase());
  const gradle = ['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'].some(aRacine);
  const gradlew = aRacine('gradlew.bat') || aRacine('gradlew');
  const readme = rels.find((r) => /^readme(\.md|\.txt)?$/i.test(r));
  let description = premierParagrapheReadme(readme ? await lireTexte(racine, readme) : '');

  // Android : Gradle + AndroidManifest.xml dans un module
  const manifestes = rels.filter((r) => /(^|\/)src\/main\/AndroidManifest\.xml$/i.test(r));
  if (gradle && manifestes.length > 0) {
    const manifeste = manifestes.find((m) => m.toLowerCase().startsWith('app/')) || manifestes[0];
    const module = manifeste.split('/src/main/')[0] || 'app';
    const kotlin = rels.some((r) => r.endsWith('.kt'));
    // Outils HTML rangés dans les assets : proposés comme « outils liés ».
    const pagesHtml = rels.filter((r) => /(^|\/)src\/main\/assets\/.+\.html?$/i.test(r));
    const outilsHtml = [];
    for (const page of pagesHtml) {
      const titre = /<title>([^<]{1,80})<\/title>/i.exec((await lireTexte(racine, page, 200000)) || '')?.[1]?.trim();
      const dossierPage = path.posix.basename(path.posix.dirname(page));
      outilsHtml.push({ nom: titre || (dossierPage !== 'assets' ? dossierPage : path.posix.basename(page)), point_entree: page });
    }
    return {
      type: 'android',
      technologies: `Application Android (Gradle, ${kotlin ? 'Kotlin' : 'Java'}). Module principal : \`${module}/\`.`
        + (outilsHtml.length ? ` Contient des outils HTML dans \`${module}/src/main/assets/\`.` : ''),
      lancer: 'Ouvrir et lancer dans Android Studio. APK de debug : `gradlew assembleDebug` '
        + `(fichier dans \`${module}/build/outputs/apk/debug/\`). La version signée (release) se fait `
        + 'uniquement dans Android Studio : ne jamais manipuler la keystore ni ses mots de passe.',
      point_entree: manifeste,
      ouvrir_avec: 'android-studio',
      actions: gradlew ? [{
        nom: 'Compiler l\'APK de debug',
        description: 'Lance « gradlew assembleDebug » et ouvre le dossier de l\'APK.',
        commande: 'gradlew assembleDebug',
        parametres: [],
        ouvrir_dossier_apres: `${module}/build/outputs/apk/debug`,
      }] : [],
      description,
      outilsHtml,
      details: `Android${kotlin ? ' (Kotlin)' : ''}`,
    };
  }

  // Mod Minecraft : Gradle + fichier de description du mod ou plugin de chargeur
  const texteBuild = (await lireTexte(racine, 'build.gradle')) || (await lireTexte(racine, 'build.gradle.kts')) || '';
  const fichierMod = rels.find((r) => /(^|\/)(fabric\.mod\.json|quilt\.mod\.json|META-INF\/(neoforge\.)?mods\.toml|mcmod\.info)$/i.test(r));
  if (gradle && (fichierMod || /fabric-loom|net\.minecraftforge|neoforged|architectury|quilt-loom/i.test(texteBuild))) {
    let chargeur = 'Forge';
    if (/fabric/i.test(fichierMod || '') || /fabric-loom/i.test(texteBuild)) chargeur = 'Fabric';
    else if (/quilt/i.test(fichierMod || '') || /quilt-loom/i.test(texteBuild)) chargeur = 'Quilt';
    else if (/neoforge/i.test(fichierMod || '') || /neoforged/i.test(texteBuild)) chargeur = 'NeoForge';
    if (/architectury/i.test(texteBuild)) chargeur = `Architectury (${chargeur})`;
    if (!description && fichierMod?.endsWith('.json')) {
      try {
        description = JSON.parse((await lireTexte(racine, fichierMod)) || '{}').description || '';
      } catch {
        // Fichier de mod illisible : sans importance ici.
      }
    }
    return {
      type: 'mod-minecraft',
      technologies: `Mod Minecraft pour ${chargeur} (Java, Gradle).`,
      lancer: 'Compiler avec le wrapper Gradle du projet : `gradlew build` ; le .jar est produit dans `build/libs/`.',
      point_entree: aRacine('build.gradle') ? 'build.gradle' : 'build.gradle.kts',
      ouvrir_avec: 'vscode',
      actions: gradlew ? [{
        nom: 'Compiler le mod',
        description: 'Lance « gradlew build » et ouvre le dossier contenant le .jar.',
        commande: 'gradlew build',
        parametres: [],
        ouvrir_dossier_apres: 'build/libs',
      }] : [],
      description,
      outilsHtml: [],
      details: `Mod Minecraft (${chargeur})`,
      estMod: true,
    };
  }

  // Projet Node.js / web
  if (aRacine('package.json')) {
    let paquet = {};
    try {
      paquet = JSON.parse((await lireTexte(racine, 'package.json')) || '{}');
    } catch {
      // package.json illisible : on garde les valeurs par défaut.
    }
    const dependances = { ...paquet.dependencies, ...paquet.devDependencies };
    const outilWeb = ['vite', 'next', 'react-scripts', '@vue/cli-service', 'parcel', 'webpack', '@sveltejs/kit', 'astro']
      .find((d) => dependances[d]);
    const scripts = paquet.scripts || {};
    const actions = [];
    if (Object.keys(dependances).length > 0) {
      actions.push({ nom: 'Installer les dépendances', description: 'Lance « npm install » (à faire une fois, ou après un changement de package.json).', commande: 'npm install', parametres: [] });
    }
    description ||= paquet.description || '';
    if (outilWeb || scripts.dev) {
      if (scripts.dev) actions.push({ nom: 'Lancer en développement', commande: 'npm run dev', parametres: [] });
      if (scripts.build) actions.push({ nom: 'Construire', commande: 'npm run build', parametres: [], ouvrir_dossier_apres: 'dist' });
      return {
        type: 'autre',
        technologies: `Projet web (Node.js${outilWeb ? `, ${outilWeb}` : ''}).`,
        lancer: 'Installer les dépendances : `npm install`. Développement : `npm run dev`. Construction : `npm run build`.',
        point_entree: aRacine('index.html') ? 'index.html' : 'package.json',
        ouvrir_avec: 'vscode',
        actions,
        description,
        outilsHtml: [],
        details: `Projet web${outilWeb ? ` (${outilWeb})` : ''}`,
      };
    }
    const principal = paquet.main || (aRacine('index.js') ? 'index.js' : null);
    if (scripts.start) actions.push({ nom: 'Lancer', commande: 'npm start', parametres: [] });
    else if (principal) actions.push({ nom: 'Lancer', commande: `node ${principal}`, parametres: [] });
    return {
      type: 'script',
      technologies: 'Script Node.js.',
      lancer: scripts.start ? '`npm start`' : (principal ? `\`node ${principal}\`` : '(à compléter)'),
      point_entree: principal || 'package.json',
      ouvrir_avec: 'vscode',
      actions,
      description,
      outilsHtml: [],
      details: 'Script Node.js',
    };
  }

  // Python
  const pyRacine = rels.filter((r) => !r.includes('/') && r.toLowerCase().endsWith('.py'));
  if (pyRacine.length > 0 || aRacine('requirements.txt') || aRacine('pyproject.toml')) {
    const principal = ['main.py', 'app.py', '__main__.py', 'run.py'].find(aRacine) || pyRacine.sort()[0] || null;
    const actions = [];
    if (principal) actions.push({ nom: 'Lancer', commande: `python ${principal}`, parametres: [] });
    if (aRacine('requirements.txt')) {
      actions.push({ nom: 'Installer les dépendances', description: 'Installe les bibliothèques de requirements.txt.', commande: 'python -m pip install -r requirements.txt', parametres: [] });
    }
    return {
      type: 'script',
      technologies: `Script Python${aRacine('requirements.txt') ? ' (dépendances dans requirements.txt)' : ''}.`,
      lancer: principal ? `\`python ${principal}\`` : '(à compléter)',
      point_entree: principal,
      ouvrir_avec: 'vscode',
      actions,
      description,
      outilsHtml: [],
      details: 'Script Python',
    };
  }

  // Outil HTML autonome
  const pagesRacine = rels.filter((r) => !r.includes('/') && /\.html?$/i.test(r));
  const pageSousDossier = rels.find((r) => /^(src|public|www|docs)\/index\.html?$/i.test(r));
  const page = pagesRacine.find((p) => /^index\.html?$/i.test(p)) || pagesRacine.sort()[0] || pageSousDossier;
  if (page) {
    return {
      type: 'html',
      technologies: 'Outil HTML (HTML, CSS, JavaScript), ouvert dans un onglet de Toolkit.',
      lancer: 'Ouvrir dans Toolkit (double-clic). F5 recharge après une modification.',
      point_entree: page,
      ouvrir_avec: 'vscode',
      actions: [],
      description,
      outilsHtml: [],
      details: 'Outil HTML',
    };
  }

  return {
    type: 'autre',
    technologies: '',
    lancer: '',
    point_entree: readme || null,
    ouvrir_avec: 'explorateur',
    actions: [],
    description,
    outilsHtml: [],
    details: 'Type non reconnu',
  };
}

// --- Analyse des risques -------------------------------------------------------------------

// Fichiers ouverts par un autre programme (ouverture en écriture impossible).
async function fichiersVerrouilles(racine, fichiers) {
  const verrouilles = [];
  const aTester = fichiers.slice(0, 40000);
  await parLots(aTester, 32, async ({ rel }) => {
    const absolu = path.join(racine, rel);
    try {
      const h = await fs.open(absolu, 'r+');
      await h.close();
    } catch (erreur) {
      if (!['EBUSY', 'EPERM', 'EACCES'].includes(erreur.code)) return;
      try {
        // Lecture seule (attribut Windows) : ce n'est pas un verrou.
        const infos = await fs.stat(absolu);
        if ((infos.mode & 0o200) === 0) return;
      } catch {
        return;
      }
      verrouilles.push(rel);
    }
  });
  return verrouilles;
}

// Recherche des chemins absolus dans les fichiers texte.
async function cheminsAbsolus(racine, fichiers) {
  // Séparateurs unifiés (« \ », « \\ » échappé en JSON, « / ») pour reconnaître le chemin sous toutes ses formes.
  const unifier = (texte) => texte.toLowerCase().replace(/\\\\/g, '/').replace(/[\\/]+/g, '/');
  const cible = unifier(racine);
  const versProjet = [];
  const autres = [];
  const absolu = /\b[A-Za-z]:(\\\\|\\|\/)(?:Users|Utilisateurs|Program Files|Documents|Desktop)/i;
  const candidats = fichiers.filter((f) => f.taille <= TAILLE_MAX_ANALYSE_TEXTE && EXTENSIONS_TEXTE.test(f.rel)
    && !f.rel.startsWith('.git/') && !/(^|\/)local\.properties$/i.test(f.rel));
  await parLots(candidats.slice(0, 20000), 16, async ({ rel }) => {
    let texte;
    try {
      texte = await fs.readFile(path.join(racine, rel), 'utf8');
    } catch {
      return;
    }
    const lignes = texte.split(/\r?\n/);
    const numerosProjet = [];
    let autre = false;
    lignes.forEach((ligne, i) => {
      if (unifier(ligne).includes(cible)) numerosProjet.push(i + 1);
      else if (!autre && absolu.test(ligne)) autre = true;
    });
    if (numerosProjet.length) versProjet.push({ fichier: rel, lignes: numerosProjet.slice(0, 10) });
    else if (autre) autres.push(rel);
  });
  return { versProjet, autres };
}

// Analyse complète. surProgression(texte) : messages pour l'interface.
async function analyserDossier(source, { mode = 'dossier', urlOrigine = null } = {}, surProgression = () => {}) {
  surProgression('Lecture du dossier…');
  const entreesRacine = await fs.readdir(source);
  const aCompilation = FICHIERS_COMPILATION.some((f) => entreesRacine.some((e) => e.toLowerCase() === f));
  const exclure = (rel, nom) => TOUJOURS_EXCLUS.has(nom) || (aCompilation && EXCLUS_SI_COMPILATION.has(nom));
  const liste = await lister(source, exclure);

  surProgression('Détection du type de projet…');
  const detection = await detecter(source, liste.fichiers);
  // Mod Minecraft : le dossier « run » (mondes de test, journaux) se régénère aussi.
  if (detection.estMod && liste.dossiers.includes('run')) {
    liste.exclus.push('run');
    liste.fichiers = liste.fichiers.filter((f) => !f.rel.startsWith('run/'));
    liste.dossiers = liste.dossiers.filter((d) => d !== 'run' && !d.startsWith('run/'));
  }

  surProgression('Mesure des dossiers à exclure…');
  const gitUtilisable = liste.aGit && await git.gitDisponible();
  const exclus = [];
  for (const rel of liste.exclus) {
    const { taille, fichiers } = await mesurer(path.join(source, rel));
    // Un dossier enregistré dans Git n'est pas exclu par défaut : sinon Git le verrait
    // comme supprimé après l'import.
    const suiviParGit = gitUtilisable && (await git.git(source, ['ls-files', '--', rel])).sortie.trim() !== '';
    exclus.push({ chemin: rel, taille, tailleLisible: tailleLisible(taille), fichiers, suiviParGit });
  }

  const risques = [];
  const fichiersHorsGit = liste.fichiers.filter((f) => !f.rel.startsWith('.git/'));

  if (mode === 'dossier') {
    surProgression('Recherche des fichiers ouverts par un autre programme…');
    const verrouilles = await fichiersVerrouilles(source, liste.fichiers);
    if (verrouilles.length) {
      risques.push({
        niveau: 'bloquant',
        titre: `${verrouilles.length} fichier(s) utilisé(s) par un autre programme`,
        detail: 'Ferme les programmes qui utilisent ce projet (Android Studio, VS Code, un terminal ouvert dans ce dossier, le jeu…), puis clique sur « Analyser à nouveau ».',
        elements: verrouilles.slice(0, 20),
      });
    }

    surProgression('Recherche des chemins absolus dans les fichiers…');
    const absolus = await cheminsAbsolus(source, fichiersHorsGit);
    if (absolus.versProjet.length) {
      risques.push({
        niveau: 'attention',
        titre: `${absolus.versProjet.length} fichier(s) contiennent l'emplacement actuel du projet`,
        detail: 'Après le déplacement, ces chemins pointeront vers l\'ancien emplacement. Toolkit ne les modifie pas : après l\'import, demande à Claude de les remplacer par des chemins relatifs.',
        elements: absolus.versProjet.slice(0, 20).map((f) => `${f.fichier} (ligne ${f.lignes.join(', ')})`),
      });
    }
    if (absolus.autres.length) {
      risques.push({
        niveau: 'info',
        titre: `${absolus.autres.length} fichier(s) contiennent d'autres chemins absolus`,
        detail: 'Ces chemins désignent d\'autres emplacements du PC (non concernés par le déplacement). Ils fonctionneront tant que ces emplacements existent.',
        elements: absolus.autres.slice(0, 10),
      });
    }
  }

  if (liste.liens.length) {
    risques.push({
      niveau: 'attention',
      titre: `${liste.liens.length} lien(s) symbolique(s)`,
      detail: 'Ces raccourcis seront recréés tels quels. S\'ils pointent vers un chemin absolu ou hors du projet, ils peuvent ne plus fonctionner après le déplacement.',
      elements: liste.liens.slice(0, 20).map((l) => `${l.rel} → ${l.cible}`),
    });
  }

  const gros = fichiersHorsGit.filter((f) => f.taille > TAILLE_GROS_FICHIER);
  if (gros.length) {
    risques.push({
      niveau: 'attention',
      titre: `${gros.length} fichier(s) de plus de 100 Mo`,
      detail: 'GitHub refuse les fichiers de plus de 100 Mo : il faudra les exclure de Git (.gitignore) avant d\'envoyer le projet sur GitHub.',
      elements: gros.map((f) => `${f.rel} (${tailleLisible(f.taille)})`),
    });
  }

  // Git
  surProgression('Lecture de l\'état Git…');
  const etatGit = { estDepot: liste.aGit, remote: null, modifications: false, secretsSuivis: [] };
  if (liste.aGit && await git.gitDisponible()) {
    etatGit.remote = await git.urlRemote(source);
    etatGit.modifications = await git.aDesModifications(source);
    etatGit.secretsSuivis = await git.fichiersSuivis(source, EXPRESSION_SECRETS);
    if (etatGit.secretsSuivis.length) {
      risques.push({
        niveau: 'attention',
        titre: 'Des fichiers sensibles sont déjà enregistrés dans l\'historique Git',
        detail: 'Ces fichiers (clés, mots de passe, keystore…) sont dans Git. Ne rends JAMAIS ce dépôt public. Demande à Claude de les retirer du suivi Git (ils resteront sur ton disque).',
        elements: etatGit.secretsSuivis,
      });
    }
    if (etatGit.modifications) {
      risques.push({
        niveau: 'info',
        titre: 'Modifications non enregistrées dans Git',
        detail: 'Le projet a des changements pas encore « commités ». Ils seront copiés tels quels, rien n\'est perdu.',
        elements: [],
      });
    }
  }
  const secretsPresents = fichiersHorsGit.filter((f) => EXPRESSION_SECRETS.test(f.rel)).map((f) => f.rel);

  const ficheExistante = await existe(path.join(source, 'projet.json'));
  if (ficheExistante) {
    risques.push({ niveau: 'info', titre: 'Le projet a déjà une fiche projet.json', detail: 'Elle sera conservée telle quelle.', elements: [] });
  }
  if (['android', 'mod-minecraft'].includes(detection.type)) {
    risques.push({
      niveau: 'info',
      titre: 'Fichiers de l\'éditeur à régénérer',
      detail: 'Après l\'import, ouvre le projet une fois dans Android Studio (ou IntelliJ) : il recréera ses fichiers de configuration (.idea, .gradle) au nouvel emplacement.',
      elements: [],
    });
  }
  const tailleTotale = liste.fichiers.reduce((t, f) => t + f.taille, 0);
  const nomDossier = path.basename(source);
  const id = crypto.randomUUID();
  analyses.set(id, { source, mode, urlOrigine, exclusProposes: exclus.map((e) => e.chemin), ficheExistante });

  return {
    id,
    mode,
    source: mode === 'dossier' ? source : urlOrigine,
    proposition: {
      nom: nomDossier,
      idProjet: await idLibre(slug(nomDossier)),
      type: detection.type,
      details: detection.details,
      categorie: '',
      description: detection.description,
      point_entree: detection.point_entree,
      ouvrir_avec: detection.ouvrir_avec,
      technologies: detection.technologies,
      lancer: detection.lancer,
      actions: detection.actions,
      outilsHtml: detection.outilsHtml,
    },
    stats: {
      fichiers: liste.fichiers.length,
      taille: tailleLisible(tailleTotale),
      exclus,
    },
    risques,
    bloquant: risques.some((r) => r.niveau === 'bloquant'),
    git: etatGit,
    secretsPresents,
    ficheExistante,
    claudeMdExistant: await existe(path.join(source, 'CLAUDE.md')),
    github: await github.etat(),
  };
}

async function analyser(source, surProgression) {
  const s = verifierSource(source);
  let infos;
  try {
    infos = await fs.stat(s);
  } catch {
    throw new Error('Ce dossier est introuvable.');
  }
  if (!infos.isDirectory()) throw new Error('Choisis un dossier, pas un fichier.');
  return analyserDossier(s, { mode: 'dossier' }, surProgression);
}

// --- Clonage GitHub -------------------------------------------------------------------------

function normaliserUrl(saisie) {
  const s = String(saisie || '').trim();
  if (/^[\w.-]+\/[\w.-]+$/.test(s)) return `https://github.com/${s.replace(/\.git$/, '')}.git`;
  if (/^https:\/\/[^\s]+$/i.test(s) || /^git@[\w.-]+:[\w./-]+$/.test(s)) return s;
  throw new Error('Adresse invalide. Exemples : https://github.com/moi/mon-projet ou moi/mon-projet');
}

async function cloner(saisie, surProgression) {
  const url = normaliserUrl(saisie);
  const nom = url.replace(/\.git$/, '').split(/[/:]/).pop() || 'projet';
  const temporaire = path.join(chemins.donnees, 'import-temp', `${slug(nom)}-${Date.now()}`);
  await fs.mkdir(path.dirname(temporaire), { recursive: true });
  surProgression('Clonage du dépôt…');
  try {
    await git.cloner(url, temporaire, surProgression);
  } catch (erreur) {
    await fs.rm(temporaire, { recursive: true, force: true });
    throw erreur;
  }
  // Le dossier temporaire porte un suffixe : on garde le vrai nom du dépôt.
  const rapport = await analyserDossier(temporaire, { mode: 'clone', urlOrigine: url }, surProgression);
  rapport.proposition.nom = nom;
  rapport.proposition.idProjet = await idLibre(slug(nom));
  return rapport;
}

// --- Exécution de l'import --------------------------------------------------------------------

async function copierProjet(source, destination, exclus, surProgression) {
  const ensembleExclus = new Set(exclus);
  const liste = await lister(source, (rel) => ensembleExclus.has(rel));
  await fs.mkdir(destination);
  for (const d of liste.dossiers.sort()) await fs.mkdir(path.join(destination, d), { recursive: true });

  let faits = 0;
  const total = liste.fichiers.length;
  let dernierEnvoi = 0;
  const signaler = (texte) => {
    if (Date.now() - dernierEnvoi > 150 || faits === total) {
      dernierEnvoi = Date.now();
      surProgression(texte, faits, total);
    }
  };
  await parLots(liste.fichiers, 8, async ({ rel }) => {
    const de = path.join(source, rel);
    const vers = path.join(destination, rel);
    await fs.copyFile(de, vers, fs.constants.COPYFILE_EXCL);
    const infos = await fs.stat(de);
    await fs.utimes(vers, infos.atime, infos.mtime);
    faits++;
    signaler(`Copie des fichiers… ${faits} / ${total}`);
  });
  for (const lien of liste.liens) {
    const de = path.join(source, lien.rel);
    let estDossier = false;
    try {
      estDossier = (await fs.stat(de)).isDirectory();
    } catch {
      // Lien cassé : recréé comme lien de fichier.
    }
    try {
      await fs.symlink(lien.cible, path.join(destination, lien.rel), estDossier ? 'junction' : 'file');
    } catch (erreur) {
      throw new Error(`Impossible de recréer le lien « ${lien.rel} » (${erreur.code}). Windows demande parfois le « mode développeur » pour cela.`);
    }
  }
  return liste;
}

// Vérifie que chaque fichier copié est identique à l'original.
async function verifierCopie(source, destination, liste, surProgression) {
  let faits = 0;
  const total = liste.fichiers.length;
  let dernierEnvoi = 0;
  const differents = [];
  await parLots(liste.fichiers, 8, async ({ rel }) => {
    const a = path.join(source, rel);
    const b = path.join(destination, rel);
    try {
      const [sa, sb] = await Promise.all([fs.stat(a), fs.stat(b)]);
      if (sa.size !== sb.size || (sa.size <= TAILLE_MAX_EMPREINTE && await empreinte(a) !== await empreinte(b))) differents.push(rel);
    } catch {
      differents.push(rel);
    }
    faits++;
    if (Date.now() - dernierEnvoi > 150 || faits === total) {
      dernierEnvoi = Date.now();
      surProgression(`Vérification de la copie… ${faits} / ${total}`, faits, total);
    }
  });
  if (differents.length) {
    throw new Error(`La copie n'est pas identique à l'original pour ${differents.length} fichier(s) (ex. ${differents[0]}). L'import est annulé ; l'original n'a pas été touché.`);
  }
}

// Déplace le clone temporaire dans projets/. Juste après un clonage, Windows (antivirus,
// indexation) bloque souvent le dossier quelques secondes : on réessaie, puis en dernier
// recours on copie (avec vérification) et on supprime le clone temporaire.
async function rangerClone(temporaire, destination, surProgression) {
  for (let essai = 0; essai < 20; essai++) {
    try {
      await fs.rename(temporaire, destination);
      return;
    } catch (erreur) {
      if (!['EBUSY', 'EPERM', 'EACCES'].includes(erreur.code)) throw erreur;
      surProgression('Le dossier est encore occupé par Windows, nouvel essai…');
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  try {
    const liste = await copierProjet(temporaire, destination, [], surProgression);
    await verifierCopie(temporaire, destination, liste, surProgression);
  } catch (erreur) {
    await fs.rm(destination, { recursive: true, force: true }).catch(() => {});
    throw erreur;
  }
  await fs.rm(temporaire, { recursive: true, force: true }).catch((e) => journal.erreur('Clone temporaire :', e));
}

// choix : { nom, idProjet, type, categorie, description, point_entree, ouvrir_avec, technologies, lancer,
//           actions, outilsLies: [{ nom, point_entree }], exclus: [chemins], garderOriginal,
//           initialiserGit, commiterFiche, creerGithub }
// Renvoie { id, etapes: [textes], avertissements: [textes] }.
async function executer(idAnalyse, choix, surProgression) {
  const analyse = analyses.get(idAnalyse);
  if (!analyse) throw new Error('Cette analyse a expiré : recommence l\'import.');
  const etapes = [];
  const avertissements = [];
  const noter = (texte) => {
    etapes.push(texte);
    surProgression(texte);
  };

  const id = await idLibre(slug(choix.idProjet || choix.nom || path.basename(analyse.source)));
  const destination = path.join(chemins.projets(), id);

  // 1. Copie (dossier) ou rangement du clone
  if (analyse.mode === 'clone') {
    await rangerClone(analyse.source, destination, surProgression);
    noter('Dépôt cloné rangé dans le dossier des projets.');
  } else {
    const exclus = (choix.exclus || []).filter((e) => analyse.exclusProposes.includes(e));
    let liste;
    try {
      liste = await copierProjet(analyse.source, destination, exclus, surProgression);
      noter(`${liste.fichiers.length} fichier(s) copié(s)${exclus.length ? ` (${exclus.length} dossier(s) régénérable(s) exclu(s))` : ''}.`);
      await verifierCopie(analyse.source, destination, liste, surProgression);
      noter('Copie vérifiée : identique à l\'original.');
    } catch (erreur) {
      await fs.rm(destination, { recursive: true, force: true }).catch(() => {});
      throw erreur;
    }
  }
  analyses.delete(idAnalyse);

  // 2. Fiche projet.json (sauf si le projet en avait déjà une)
  const dossierRelatif = chemins.versRelatif(destination);
  const fichiersToolkit = [];
  if (!analyse.ficheExistante) {
    const fiche = {
      schema: 1,
      nom: choix.nom || id,
      description: choix.description || '',
      type: choix.type,
      categorie: choix.categorie || undefined,
      tags: [],
      favori: false,
      point_entree: choix.point_entree || undefined,
      ouvrir_avec: choix.ouvrir_avec || undefined,
      actions: choix.actions || [],
      outils_lies: choix.outilsLies || [],
    };
    await ecrireJson(path.join(destination, 'projet.json'), fiche);
    fichiersToolkit.push('projet.json');
    noter('Fiche projet.json créée.');
  }

  // 3. CLAUDE.md (créé, ou complété sans rien effacer)
  const cheminClaude = path.join(destination, 'CLAUDE.md');
  const infosClaude = { dossierRelatif, technologies: choix.technologies, lancer: choix.lancer };
  if (await existe(cheminClaude)) {
    const actuel = await fs.readFile(cheminClaude, 'utf8');
    const section = sectionPourClaudeMdExistant(actuel, infosClaude);
    if (section) {
      await fs.appendFile(cheminClaude, section, 'utf8');
      fichiersToolkit.push('CLAUDE.md');
      noter('Section « Intégration Toolkit » ajoutée au CLAUDE.md existant.');
    }
  } else {
    const fiche = await lireJson(path.join(destination, 'projet.json')).catch(() => ({ nom: choix.nom }));
    await fs.writeFile(cheminClaude, genererClaudeMd({ fiche: { ...fiche, description: choix.description || fiche.description }, ...infosClaude }), 'utf8');
    fichiersToolkit.push('CLAUDE.md');
    noter('CLAUDE.md créé.');
  }

  // 4. Git : .gitignore protecteur, dépôt, commit des fichiers de Toolkit
  let estDepot = await git.estDepot(destination);
  const gitPresent = await git.gitDisponible();
  if (gitPresent && (estDepot || choix.initialiserGit)) {
    try {
      if (!estDepot) {
        await git.initialiser(destination);
        estDepot = true;
        await git.completerGitignore(destination);
        await git.commiterTout(destination, `Import du projet « ${choix.nom} » dans Toolkit`);
        noter('Historique Git créé (premier commit).');
      } else {
        const ajoutees = await git.completerGitignore(destination);
        if (ajoutees.length) {
          fichiersToolkit.push('.gitignore');
          noter(`.gitignore complété (${ajoutees.join(', ')}).`);
        }
        if (choix.commiterFiche && fichiersToolkit.length) {
          const { commite } = await git.commiterFichiers(destination, fichiersToolkit, 'Ajout de la fiche Toolkit (projet.json, CLAUDE.md)');
          if (commite) noter('Fichiers de Toolkit enregistrés dans Git (commit local).');
        }
      }
    } catch (erreur) {
      avertissements.push(`Git : ${erreur.message}`);
    }
  } else if (!gitPresent && choix.initialiserGit) {
    avertissements.push('Git est introuvable : le projet est importé sans historique Git.');
  }

  // 5. Original à la Corbeille (seulement maintenant que la copie est vérifiée)
  if (analyse.mode === 'dossier') {
    if (choix.garderOriginal) {
      noter('Original conservé à son emplacement (à ta demande).');
    } else {
      surProgression('Envoi de l\'original à la Corbeille…');
      try {
        await shell.trashItem(analyse.source);
        noter('Original envoyé à la Corbeille (récupérable si besoin).');
      } catch (erreur) {
        journal.erreur('Corbeille :', erreur);
        avertissements.push(`L'original n'a pas pu être envoyé à la Corbeille (${erreur.message}). La copie est complète et vérifiée : tu peux supprimer l'original toi-même quand tu veux : ${analyse.source}`);
      }
    }
  }

  // 6. Dépôt GitHub privé (facultatif)
  if (choix.creerGithub && estDepot && !(await git.urlRemote(destination))) {
    surProgression('Création du dépôt GitHub privé…');
    try {
      const url = await github.creerDepotPrive(destination, id, choix.description);
      noter(`Dépôt GitHub privé créé et envoyé : ${url}`);
      const cheminFiche = path.join(destination, 'projet.json');
      const fiche = await lireJson(cheminFiche);
      fiche.git = { ...(fiche.git || {}), remote: url };
      await ecrireJson(cheminFiche, fiche);
      await git.commiterFichiers(destination, ['projet.json'], 'Ajout de l\'adresse du dépôt GitHub dans la fiche');
    } catch (erreur) {
      avertissements.push(`GitHub : ${erreur.message}`);
    }
  }

  return { id, etapes, avertissements };
}

// Abandon : supprime le clone temporaire (créé par Toolkit, sans valeur pour l'utilisateur).
async function abandonner(idAnalyse) {
  const analyse = analyses.get(idAnalyse);
  analyses.delete(idAnalyse);
  if (analyse?.mode === 'clone' && analyse.source.startsWith(path.join(chemins.donnees, 'import-temp'))) {
    await fs.rm(analyse.source, { recursive: true, force: true });
  }
}

module.exports = { analyser, cloner, executer, abandonner };
