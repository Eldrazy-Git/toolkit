// Java et SDK Android pour la compilation Gradle (mods Minecraft, applications Android).
//
// Gradle a besoin d'un JDK. Toolkit :
// - lit la version de Java demandée par le projet (build.gradle : toolchain, VERSION_21…) ;
// - garde le JAVA_HOME de l'utilisateur s'il convient ;
// - sinon prend le plus petit JDK installé qui convient (Program Files, ~/.jdks, Android Studio…).
// Pour Android, le SDK est indiqué par ANDROID_HOME s'il n'est pas déjà configuré.
// Rien n'est enregistré : tout est détecté à chaque compilation.
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { sortieDe } = require('./processus');

const env = (nom) => process.env[nom] || '';

const INSTALLER_JAVA = (version) => `Installe Java ${version} : dans PowerShell, tape « winget install Microsoft.OpenJDK.${version} », puis redémarre Toolkit.`;

async function existe(chemin) {
  try {
    await fs.access(chemin);
    return true;
  } catch {
    return false;
  }
}

// Version principale d'un JDK (8, 17, 21…) d'après son fichier « release », ou null.
async function versionJdk(dossier) {
  try {
    const release = await fs.readFile(path.join(dossier, 'release'), 'utf8');
    const v = /JAVA_VERSION="([^"]+)"/.exec(release)?.[1];
    if (!v) return null;
    const [premier, second] = v.split('.').map(Number);
    return premier === 1 ? second : premier;
  } catch {
    return null;
  }
}

async function sousDossiers(dossier) {
  try {
    return (await fs.readdir(dossier, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => path.join(dossier, e.name));
  } catch {
    return [];
  }
}

// Tous les JDK trouvés : [{ chemin, version, source }]
async function trouverJdks() {
  const candidats = [];
  if (env('JAVA_HOME')) candidats.push({ chemin: env('JAVA_HOME'), source: 'JAVA_HOME' });
  const where = (await sortieDe('where', ['java']))?.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) || [];
  for (const exe of where) candidats.push({ chemin: path.dirname(path.dirname(exe)), source: 'PATH' });
  const racines = ['Java', 'Eclipse Adoptium', 'Microsoft', 'Zulu', 'Amazon Corretto', 'BellSoft', 'Semeru', 'OpenJDK']
    .flatMap((n) => [path.join(env('ProgramFiles'), n), path.join(env('ProgramFiles(x86)'), n)]);
  racines.push(path.join(os.homedir(), '.jdks'));
  for (const racine of racines) {
    for (const d of await sousDossiers(racine)) candidats.push({ chemin: d, source: path.basename(racine) });
  }
  // Java fourni avec Android Studio
  for (const d of [path.join(env('ProgramFiles'), 'Android', 'Android Studio', 'jbr'),
    path.join(env('LOCALAPPDATA'), 'Programs', 'Android Studio', 'jbr')]) {
    candidats.push({ chemin: d, source: 'Android Studio' });
  }

  const vus = new Set();
  const jdks = [];
  for (const c of candidats) {
    const cle = path.resolve(c.chemin).toLowerCase();
    if (vus.has(cle)) continue;
    vus.add(cle);
    if (!(await existe(path.join(c.chemin, 'bin', 'java.exe')))) continue;
    const version = await versionJdk(c.chemin);
    if (version) jdks.push({ chemin: path.resolve(c.chemin), version, source: c.source });
  }
  return jdks.sort((a, b) => a.version - b.version);
}

// Version minimale de Java demandée par les fichiers Gradle du projet (ou null).
async function versionRequise(dossier) {
  const fichiers = ['build.gradle', 'build.gradle.kts', 'gradle.properties',
    path.join('app', 'build.gradle'), path.join('app', 'build.gradle.kts')];
  const versions = [];
  for (const f of fichiers) {
    let texte;
    try {
      texte = await fs.readFile(path.join(dossier, f), 'utf8');
    } catch {
      continue;
    }
    const motifs = [
      /JavaLanguageVersion\.of\(\s*(\d+)\s*\)/g,
      /jvmToolchain\(\s*(\d+)\s*\)/g,
      /JavaVersion\.VERSION_(\d+)(?:_(\d+))?/g,
      /options\.release(?:\.set\()?\s*=?\s*(\d+)/g,
      /(?:source|target)Compatibility\s*=\s*['"]?(\d+)(?:\.(\d+))?/g,
    ];
    for (const motif of motifs) {
      for (const m of texte.matchAll(motif)) {
        const premier = Number(m[1]);
        versions.push(premier === 1 && m[2] ? Number(m[2]) : premier);
      }
    }
  }
  const valides = versions.filter((v) => v >= 8 && v <= 40);
  return valides.length ? Math.max(...valides) : null;
}

// Dossier du SDK Android à utiliser, ou null (déjà configuré, ou introuvable).
async function sdkAndroid(dossier) {
  if (env('ANDROID_HOME') || env('ANDROID_SDK_ROOT')) return null;
  try {
    const local = await fs.readFile(path.join(dossier, 'local.properties'), 'utf8');
    if (/^\s*sdk\.dir\s*=/m.test(local)) return null; // Gradle le lira lui-même
  } catch {
    // Pas de local.properties.
  }
  const defaut = path.join(env('LOCALAPPDATA'), 'Android', 'Sdk');
  return (await existe(defaut)) ? defaut : null;
}

async function emplacementSdkAndroid() {
  if (env('ANDROID_HOME')) return env('ANDROID_HOME');
  if (env('ANDROID_SDK_ROOT')) return env('ANDROID_SDK_ROOT');
  const defaut = path.join(env('LOCALAPPDATA'), 'Android', 'Sdk');
  return (await existe(defaut)) ? defaut : null;
}

// Environnement pour lancer Gradle dans ce dossier. Renvoie { env, infos: [textes] }
// ou lance une erreur explicative si aucun Java ne convient.
async function environnementGradle(dossier, { android = false } = {}) {
  const [jdks, requise] = await Promise.all([trouverJdks(), versionRequise(dossier)]);
  const minimum = requise || (android ? 17 : 8);
  const javaHome = jdks.find((j) => j.source === 'JAVA_HOME');
  const choisi = javaHome && javaHome.version >= minimum ? javaHome : jdks.find((j) => j.version >= minimum);
  if (!choisi) {
    const disponibles = jdks.length ? ` (trouvé : ${jdks.map((j) => `Java ${j.version}`).join(', ')})` : '';
    throw new Error(`Ce projet a besoin de Java ${minimum} ou plus récent, introuvable sur ce PC${disponibles}.\n${INSTALLER_JAVA(minimum >= 21 ? 21 : minimum <= 17 ? 17 : minimum)}`);
  }
  const resultat = {
    env: {
      JAVA_HOME: choisi.chemin,
      PATH: `${path.join(choisi.chemin, 'bin')}${path.delimiter}${env('PATH')}`,
      // Le « démon » Gradle accélère les compilations suivantes ; il s'arrête tout seul
      // après 10 minutes d'inactivité pour ne pas occuper la mémoire.
      GRADLE_OPTS: `${env('GRADLE_OPTS')} -Dorg.gradle.daemon.idletimeout=600000`.trim(),
    },
    infos: [`Java ${choisi.version} (${choisi.source}) : ${choisi.chemin}${requise ? ` — le projet demande Java ${requise}` : ''}`],
  };
  if (android) {
    const sdk = await sdkAndroid(dossier);
    if (sdk) {
      resultat.env.ANDROID_HOME = sdk;
      resultat.infos.push(`SDK Android : ${sdk}`);
    }
  }
  return resultat;
}

module.exports = { trouverJdks, versionRequise, environnementGradle, emplacementSdkAndroid };
