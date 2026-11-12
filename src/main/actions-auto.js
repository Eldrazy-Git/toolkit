// Boutons ajoutés automatiquement selon le type de projet :
// - projet Java (Gradle) : « Compiler » (gradlew build -> build/libs) ;
// - Android : « Compiler l'APK de debug » (gradlew assembleDebug -> <module>/build/outputs/apk/debug) ;
// - mod Fabric (plugin fabric-loom dans build.gradle / build.gradle.kts) : « Tester en jeu »
//   (gradlew runClient). « Arrêter » ferme aussi Minecraft : Gradle annule la tâche quand
//   gradlew est arrêté (vérifié, démon Gradle neuf ou déjà lancé).
// Ils sont écrits dans projet.json (donc modifiables). Toolkit retient dans donnees/reglages.json
// (actionsAuto, une clé par bouton) ce qu'il a déjà proposé : un bouton supprimé par
// l'utilisateur n'est pas rajouté.
// Appelé au démarrage (tous les projets), quand un fichier Gradle change à la racine d'un
// projet (projet créé par Claude, fenêtre ouverte) et à l'import (noterProposees).
// La compilation release (signée) reste dans Android Studio : jamais de keystore ici.
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const chemins = require('./chemins');
const projets = require('./projets');
const reglages = require('./reglages');
const journal = require('./journal');
const { lireJson, ecrireJson, existe } = require('./fichiers');

const ACTION_TESTER_EN_JEU = {
  nom: 'Tester en jeu',
  description: 'Lance Minecraft avec le mod pour l\'essayer.',
  commande: 'gradlew runClient',
  parametres: [],
};
// Nom de repli si le projet a déjà une action « Tester en jeu » (avec une autre commande).
const NOM_REPLI_TESTER_EN_JEU = 'Lancer le jeu';

function normaliserCommande(commande) {
  return String(commande || '').toLowerCase().replace(/\.bat\b/g, '').replace(/^\.[\\/]/, '').replace(/\s+/g, ' ').trim();
}

// Mod Fabric : le script Gradle applique le plugin Loom (« fabric-loom » ou « net.fabricmc.fabric-loom »).
function estModFabric(scriptGradle) {
  return /fabric-loom/.test(String(scriptGradle || ''));
}

async function lireScriptGradle(dossier) {
  for (const nom of ['build.gradle', 'build.gradle.kts']) {
    try {
      return await fs.readFile(path.join(dossier, nom), 'utf8');
    } catch {
      // Absent : on essaie l'autre.
    }
  }
  return '';
}

// Module Android principal : le dossier qui contient src/main/AndroidManifest.xml (« app » de préférence).
async function moduleAndroid(dossier) {
  if (await existe(path.join(dossier, 'app', 'src', 'main', 'AndroidManifest.xml'))) return 'app';
  try {
    for (const e of await fs.readdir(dossier, { withFileTypes: true })) {
      if (e.isDirectory() && await existe(path.join(dossier, e.name, 'src', 'main', 'AndroidManifest.xml'))) return e.name;
    }
  } catch {
    // Dossier illisible.
  }
  return null;
}

// [{ cle, action }] : la clé (notée dans reglages.actionsAuto) est propre à chaque bouton.
async function actionsAttendues(dossier, type) {
  if (!(await existe(path.join(dossier, 'gradlew.bat'))) && !(await existe(path.join(dossier, 'gradlew')))) return [];
  if (type === 'android') {
    const module = await moduleAndroid(dossier);
    if (!module) return [];
    return [{
      cle: 'compiler-apk-debug',
      action: {
        nom: 'Compiler l\'APK de debug',
        description: 'Lance « gradlew assembleDebug » et ouvre le dossier de l\'APK. La version signée se fait dans Android Studio.',
        commande: 'gradlew assembleDebug',
        parametres: [],
        ouvrir_dossier_apres: `${module}/build/outputs/apk/debug`,
      },
    }];
  }
  const attendues = [];
  if (type === 'java') {
    attendues.push({
      cle: 'compiler-java',
      action: {
        nom: 'Compiler',
        description: 'Lance « gradlew build » et ouvre le dossier contenant le .jar.',
        commande: 'gradlew build',
        parametres: [],
        ouvrir_dossier_apres: 'build/libs',
      },
    });
  }
  // Quel que soit le type : un mod créé par Claude depuis le modèle « libre » peut rester « autre ».
  if (estModFabric(await lireScriptGradle(dossier))) {
    attendues.push({ cle: 'tester-en-jeu-fabric', action: { ...ACTION_TESTER_EN_JEU } });
  }
  return attendues;
}

// Les passages sont faits l'un après l'autre : deux passages simultanés (démarrage +
// surveillance) pourraient sinon ajouter deux fois le même bouton.
let file = Promise.resolve();
function enFile(travail) {
  const suite = file.then(travail, travail);
  file = suite.catch(() => {});
  return suite;
}

// Ajoute les boutons manquants (tous les projets, ou seulement ceux de « ids »).
// Renvoie la liste des noms des projets modifiés.
function completerProjets(ids = null) {
  return enFile(async () => {
    const dejaProposees = { ...(reglages.obtenir().actionsAuto || {}) };
    let reglagesModifies = false;
    const modifies = [];
    const liste = ids
      ? (await Promise.all(ids.map((id) => projets.chargerProjet(id).catch(() => null)))).filter(Boolean)
      : await projets.listerProjets();
    for (const p of liste) {
      if (p.erreur) continue;
      const dossier = path.join(chemins.projets(), p.id);
      const attendues = await actionsAttendues(dossier, p.fiche.type);
      if (attendues.length === 0) continue;
      const proposees = new Set(dejaProposees[p.id] || []);
      const presentes = new Set(p.fiche.actions.map((a) => normaliserCommande(a.commande)));
      const noms = new Set(p.fiche.actions.map((a) => String(a.nom || '').toLowerCase()));
      const aAjouter = [];
      for (const { cle, action } of attendues) {
        if (proposees.has(cle)) continue;
        proposees.add(cle);
        reglagesModifies = true;
        // Le projet a déjà un bouton qui lance la même commande : rien à ajouter.
        if (presentes.has(normaliserCommande(action.commande))) continue;
        // Deux boutons du même nom seraient confondus (action par défaut « action:<nom> »).
        let nom = action.nom;
        if (noms.has(nom.toLowerCase()) && cle === 'tester-en-jeu-fabric') nom = NOM_REPLI_TESTER_EN_JEU;
        if (noms.has(nom.toLowerCase())) continue;
        noms.add(nom.toLowerCase());
        aAjouter.push({ ...action, nom });
      }
      dejaProposees[p.id] = [...proposees];
      if (aAjouter.length === 0) continue;
      const cheminFiche = path.join(dossier, 'projet.json');
      const brut = await lireJson(cheminFiche);
      brut.actions = [...(Array.isArray(brut.actions) ? brut.actions : []), ...aAjouter];
      await ecrireJson(cheminFiche, brut);
      modifies.push(p.fiche.nom);
    }
    if (reglagesModifies) await reglages.modifier({ actionsAuto: dejaProposees });
    if (modifies.length) journal.info(`Boutons ajoutés automatiquement : ${modifies.join(', ')}`);
    return modifies;
  });
}

// Import : les boutons proposés par l'assistant (gardés ou décochés) comptent comme déjà
// proposés, pour qu'un bouton décoché ne revienne pas au démarrage suivant.
function noterProposees(id, dossier, type) {
  return enFile(async () => {
    const cles = (await actionsAttendues(dossier, type)).map((a) => a.cle);
    if (cles.length === 0) return;
    const deja = reglages.obtenir().actionsAuto?.[id] || [];
    await reglages.modifier({ actionsAuto: { [id]: [...new Set([...deja, ...cles])] } });
  });
}

module.exports = { completerProjets, noterProposees, actionsAttendues, estModFabric, ACTION_TESTER_EN_JEU };
