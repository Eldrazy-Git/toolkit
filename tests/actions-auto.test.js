// Tests des boutons ajoutés automatiquement (actions-auto.js) : « Tester en jeu » des mods
// Fabric, une seule fois, jamais remis après suppression, clé distincte de « Compiler »,
// et import (bouton décoché = jamais rajouté). Lancer : npm test
// Le code est copié dans un dossier temporaire : sa racine y est donc calculée, et les vrais
// projets comme les vrais réglages ne peuvent pas être touchés. Gradle n'est jamais lancé.
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const APP = path.resolve(__dirname, '..');
const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-test-actions-auto-'));
// Source d'un import : hors de la racine de Toolkit.
const sources = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-test-import-mod-'));
let actionsAuto;
let reglages;
let importer;

const LOOM = 'plugins {\n\tid \'net.fabricmc.fabric-loom\' version "${loom_version}"\n}\n';

function ecrire(base, relatif, contenu) {
  const absolu = path.join(base, relatif);
  fs.mkdirSync(path.dirname(absolu), { recursive: true });
  fs.writeFileSync(absolu, contenu);
}

function projet(id, fiche, fichiers = {}) {
  ecrire(racine, `projets/${id}/projet.json`, JSON.stringify({ schema: 1, nom: id, ...fiche }, null, 2));
  for (const [rel, contenu] of Object.entries(fichiers)) ecrire(racine, `projets/${id}/${rel}`, contenu);
}

const lireFiche = (id) => JSON.parse(fs.readFileSync(path.join(racine, 'projets', id, 'projet.json'), 'utf8'));
const commandes = (id) => lireFiche(id).actions.map((a) => a.commande);
const COMPILER = { nom: 'Compiler', commande: 'gradlew build', parametres: [] };

before(async () => {
  for (const d of ['src', 'docs']) fs.cpSync(path.join(APP, d), path.join(racine, 'app', d), { recursive: true });
  fs.copyFileSync(path.join(APP, 'package.json'), path.join(racine, 'app', 'package.json'));
  fs.mkdirSync(path.join(racine, 'donnees'));

  // Mod Fabric (Groovy) qui a déjà « Compiler ».
  projet('zz-mod', { type: 'java', actions: [COMPILER] }, { 'build.gradle': LOOM, 'gradlew.bat': '@echo off\n' });
  // Mod Fabric en Kotlin DSL, resté de type « autre » (créé depuis le modèle libre).
  projet('zz-mod-kts', { type: 'autre', actions: [] }, { 'build.gradle.kts': 'plugins { id("fabric-loom") version "1.14" }\n', gradlew: '#!/bin/sh\n' });
  // Le nom « Tester en jeu » est déjà pris par une autre commande.
  projet('zz-nom-pris', { type: 'java', actions: [COMPILER, { nom: 'Tester en jeu', commande: 'gradlew runClientGameTest', parametres: [] }] },
    { 'build.gradle': LOOM, 'gradlew.bat': '' });
  // runClient déjà présent sous un autre nom.
  projet('zz-deja', { type: 'java', actions: [COMPILER, { nom: 'Lancer le jeu', commande: 'gradlew.bat runClient', parametres: [] }] },
    { 'build.gradle': LOOM, 'gradlew.bat': '' });
  // Projet Java ordinaire, et mod sans gradlew.
  projet('zz-java', { type: 'java', actions: [] }, { 'build.gradle': 'plugins { id \'java\' }\n', 'gradlew.bat': '' });
  projet('zz-sans-gradlew', { type: 'java', actions: [] }, { 'build.gradle': LOOM });

  // Mod à importer.
  ecrire(sources, 'zz-mod-importe/build.gradle', LOOM);
  ecrire(sources, 'zz-mod-importe/settings.gradle', 'rootProject.name = \'zz\'\n');
  ecrire(sources, 'zz-mod-importe/gradlew.bat', '@echo off\n');
  ecrire(sources, 'zz-mod-importe/src/main/java/Mod.java', 'class Mod {}\n');

  const chargerOriginal = Module._load;
  Module._load = function charger(demande, ...reste) {
    if (demande === 'electron') return { shell: { trashItem: async () => {} }, app: { getPath: () => path.join(racine, 'donnees') } };
    if (demande === './github') return { etat: async () => ({ installe: false }) };
    return chargerOriginal.call(this, demande, ...reste);
  };
  const main = path.join(racine, 'app', 'src', 'main');
  assert.equal(require(path.join(main, 'chemins.js')).projets(), path.join(racine, 'projets'), 'Le test doit travailler hors des vrais projets.');
  reglages = require(path.join(main, 'reglages.js'));
  await reglages.charger();
  actionsAuto = require(path.join(main, 'actions-auto.js'));
  importer = require(path.join(main, 'import.js'));
});

after(() => {
  fs.rmSync(racine, { recursive: true, force: true });
  fs.rmSync(sources, { recursive: true, force: true });
});

test('reconnaît le plugin Fabric Loom', () => {
  assert.equal(actionsAuto.estModFabric('id \'fabric-loom\' version \'1.10\''), true);
  assert.equal(actionsAuto.estModFabric(LOOM), true);
  assert.equal(actionsAuto.estModFabric('plugins { id \'java\' }'), false);
  assert.equal(actionsAuto.estModFabric(''), false);
});

test('« Tester en jeu » est ajouté une fois aux mods Fabric, avec sa propre clé', async () => {
  // Deux passages en même temps (démarrage + surveillance) : un seul bouton.
  await Promise.all([actionsAuto.completerProjets(), actionsAuto.completerProjets(['zz-mod'])]);

  const mod = lireFiche('zz-mod');
  assert.deepEqual(mod.actions.map((a) => a.commande), ['gradlew build', 'gradlew runClient']);
  assert.equal(mod.actions[1].nom, 'Tester en jeu');
  assert.equal(mod.actions[1].description, 'Lance Minecraft avec le mod pour l\'essayer.');

  assert.deepEqual(commandes('zz-mod-kts'), ['gradlew runClient'], 'type « autre », build.gradle.kts');
  const nomPris = lireFiche('zz-nom-pris').actions;
  assert.deepEqual(nomPris.map((a) => a.nom), ['Compiler', 'Tester en jeu', 'Lancer le jeu'], 'nom déjà pris : nom de repli');
  assert.equal(nomPris[2].commande, 'gradlew runClient');
  assert.deepEqual(commandes('zz-deja'), ['gradlew build', 'gradlew.bat runClient'], 'runClient déjà présent');
  assert.deepEqual(commandes('zz-java'), ['gradlew build'], 'Java ordinaire : Compiler seulement');
  assert.deepEqual(commandes('zz-sans-gradlew'), [], 'sans gradlew : rien');

  const notes = reglages.obtenir().actionsAuto;
  assert.deepEqual(notes['zz-mod'].sort(), ['compiler-java', 'tester-en-jeu-fabric']);
  assert.deepEqual(notes['zz-mod-kts'], ['tester-en-jeu-fabric']);
  assert.deepEqual(notes['zz-java'], ['compiler-java']);
  assert.equal(notes['zz-sans-gradlew'], undefined);
});

test('un bouton supprimé ne revient jamais', async () => {
  const fiche = lireFiche('zz-mod');
  fiche.actions = fiche.actions.filter((a) => a.commande !== 'gradlew runClient');
  fs.writeFileSync(path.join(racine, 'projets', 'zz-mod', 'projet.json'), JSON.stringify(fiche, null, 2));
  assert.deepEqual(await actionsAuto.completerProjets(), []);
  assert.deepEqual(await actionsAuto.completerProjets(['zz-mod']), []);
  assert.deepEqual(commandes('zz-mod'), ['gradlew build']);
});

test('« Compiler » supprimé ne fait pas disparaître « Tester en jeu » (clés distinctes)', async () => {
  // Projet déjà connu pour « Compiler » seulement (comme les mods d'avant cette version).
  projet('zz-ancien-mod', { type: 'java', actions: [] }, { 'build.gradle': LOOM, 'gradlew.bat': '' });
  await reglages.modifier({ actionsAuto: { 'zz-ancien-mod': ['compiler-java'] } });
  await actionsAuto.completerProjets(['zz-ancien-mod']);
  assert.deepEqual(commandes('zz-ancien-mod'), ['gradlew runClient']);
});

test('un mod créé ensuite (fichiers Gradle écrits par Claude) reçoit le bouton', async () => {
  projet('zz-nouveau', { type: 'autre', actions: [] });
  await actionsAuto.completerProjets(['zz-nouveau']);
  assert.deepEqual(commandes('zz-nouveau'), [], 'pas encore de Gradle');
  assert.equal(reglages.obtenir().actionsAuto['zz-nouveau'], undefined, 'rien de noté tant que rien n\'est proposé');
  ecrire(racine, 'projets/zz-nouveau/build.gradle', LOOM);
  ecrire(racine, 'projets/zz-nouveau/gradlew.bat', '');
  await actionsAuto.completerProjets(['zz-nouveau']);
  assert.deepEqual(commandes('zz-nouveau'), ['gradlew runClient']);
});

test('la surveillance signale un fichier Gradle écrit à la racine d\'un projet', async () => {
  const projets = require(path.join(racine, 'app', 'src', 'main', 'projets.js'));
  projet('zz-surveille', { type: 'autre', actions: [] });
  const signale = new Promise((resoudre) => {
    projets.demarrerSurveillance(() => {}, { surGradle: resoudre });
  });
  await new Promise((r) => setTimeout(r, 200));
  ecrire(racine, 'projets/zz-surveille/build.gradle', LOOM);
  const delai = new Promise((_, rejeter) => setTimeout(() => rejeter(new Error('rien signalé')), 8000));
  try {
    assert.equal(await Promise.race([signale, delai]), 'zz-surveille');
  } finally {
    projets.arreterSurveillance();
  }
});

test('import d\'un mod : bouton proposé, et décoché = jamais rajouté', async () => {
  const analyse = await importer.analyser(path.join(sources, 'zz-mod-importe'), () => {});
  assert.equal(analyse.proposition.type, 'java');
  assert.deepEqual(analyse.proposition.actions.map((a) => a.commande), ['gradlew build', 'gradlew runClient']);
  assert.equal(analyse.proposition.actions[1].nom, 'Tester en jeu');

  const choix = {
    ...analyse.proposition,
    actions: analyse.proposition.actions.filter((a) => a.commande === 'gradlew build'),
    outilsLies: [],
    exclus: [],
    initialiserGit: false,
    garderOriginal: true,
  };
  const resultat = await importer.executer(analyse.id, choix, () => {});
  assert.deepEqual(commandes(resultat.id), ['gradlew build']);
  assert.deepEqual(reglages.obtenir().actionsAuto[resultat.id].sort(), ['compiler-java', 'tester-en-jeu-fabric']);
  await actionsAuto.completerProjets();
  assert.deepEqual(commandes(resultat.id), ['gradlew build'], 'le bouton décoché ne revient pas');
});
