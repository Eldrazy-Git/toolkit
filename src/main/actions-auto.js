// Boutons de compilation ajoutés automatiquement selon le type de projet :
// - projet Java (Gradle) : « Compiler » (gradlew build -> build/libs) ;
// - Android : « Compiler l'APK de debug » (gradlew assembleDebug -> <module>/build/outputs/apk/debug).
// Ils sont écrits dans projet.json (donc modifiables). Toolkit retient dans donnees/reglages.json
// ce qu'il a déjà proposé : un bouton supprimé par l'utilisateur n'est pas rajouté.
// La compilation release (signée) reste dans Android Studio : jamais de keystore ici.
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const chemins = require('./chemins');
const projets = require('./projets');
const reglages = require('./reglages');
const journal = require('./journal');
const { lireJson, ecrireJson, existe } = require('./fichiers');

function normaliserCommande(commande) {
  return String(commande || '').toLowerCase().replace(/\.bat\b/g, '').replace(/^\.[\\/]/, '').replace(/\s+/g, ' ').trim();
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

async function actionsAttendues(dossier, type) {
  if (!['java', 'android'].includes(type)) return [];
  if (!(await existe(path.join(dossier, 'gradlew.bat'))) && !(await existe(path.join(dossier, 'gradlew')))) return [];
  if (type === 'java') {
    return [{
      cle: 'compiler-java',
      action: {
        nom: 'Compiler',
        description: 'Lance « gradlew build » et ouvre le dossier contenant le .jar.',
        commande: 'gradlew build',
        parametres: [],
        ouvrir_dossier_apres: 'build/libs',
      },
    }];
  }
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

// Ajoute les boutons manquants. Renvoie la liste des projets modifiés.
async function completerProjets() {
  const dejaProposees = { ...(reglages.obtenir().actionsAuto || {}) };
  let reglagesModifies = false;
  const modifies = [];
  for (const p of await projets.listerProjets()) {
    if (p.erreur) continue;
    const dossier = path.join(chemins.projets(), p.id);
    const attendues = await actionsAttendues(dossier, p.fiche.type);
    if (attendues.length === 0) continue;
    const proposees = new Set(dejaProposees[p.id] || []);
    const presentes = new Set(p.fiche.actions.map((a) => normaliserCommande(a.commande)));
    const aAjouter = [];
    for (const { cle, action } of attendues) {
      if (proposees.has(cle)) continue;
      proposees.add(cle);
      reglagesModifies = true;
      if (!presentes.has(normaliserCommande(action.commande))) aAjouter.push(action);
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
  if (modifies.length) journal.info(`Boutons de compilation ajoutés : ${modifies.join(', ')}`);
  return modifies;
}

module.exports = { completerProjets, actionsAttendues };
