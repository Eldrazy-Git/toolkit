// Tests de la version de Minecraft affichée pour les mods (projets.js) : lue dans
// gradle.properties, jamais écrite dans projet.json, relue quand le fichier change.
// Lancer : npm test. Code copié dans un dossier temporaire : les vrais projets ne sont pas lus.
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const APP = path.resolve(__dirname, '..');
const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-test-version-mc-'));
let projets;

function ecrire(relatif, contenu) {
  const absolu = path.join(racine, relatif);
  fs.mkdirSync(path.dirname(absolu), { recursive: true });
  fs.writeFileSync(absolu, contenu);
}

const FICHE = JSON.stringify({ schema: 1, nom: 'Mod', type: 'java' }, null, 2);
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

before(() => {
  for (const d of ['src', 'docs']) fs.cpSync(path.join(APP, d), path.join(racine, 'app', d), { recursive: true });
  fs.copyFileSync(path.join(APP, 'package.json'), path.join(racine, 'app', 'package.json'));
  fs.mkdirSync(path.join(racine, 'donnees'));
  ecrire('projets/zz-mod/projet.json', FICHE);
  ecrire('projets/zz-mod/gradle.properties', '# Réglages\norg.gradle.jvmargs=-Xmx1G\n\nminecraft_version=26.2\nloader_version=0.18.1\n');
  ecrire('projets/zz-sans-ligne/projet.json', FICHE);
  ecrire('projets/zz-sans-ligne/gradle.properties', 'org.gradle.jvmargs=-Xmx1G\n');
  ecrire('projets/zz-sans-fichier/projet.json', FICHE);

  const chargerOriginal = Module._load;
  Module._load = function charger(demande, ...reste) {
    if (demande === 'electron') return { shell: {}, app: { getPath: () => path.join(racine, 'donnees') } };
    return chargerOriginal.call(this, demande, ...reste);
  };
  const main = path.join(racine, 'app', 'src', 'main');
  assert.equal(require(path.join(main, 'chemins.js')).projets(), path.join(racine, 'projets'), 'Le test doit travailler hors des vrais projets.');
  projets = require(path.join(main, 'projets.js'));
});

after(() => {
  projets.arreterSurveillance();
  fs.rmSync(racine, { recursive: true, force: true });
});

test('lit la ligne minecraft_version des différents formats', () => {
  const v = projets.versionMinecraftDe;
  assert.equal(v('minecraft_version=26.2'), '26.2');
  assert.equal(v('a=1\r\nminecraft_version = 1.21.10 \r\nb=2'), '1.21.10');
  assert.equal(v('minecraft_version: 26.3-snapshot-2'), '26.3-snapshot-2');
  assert.equal(v('  minecraft_version 26.1'), '26.1');
  assert.equal(v('#minecraft_version=26.2'), null, 'ligne en commentaire');
  assert.equal(v('minecraft_version_range=26.2'), null, 'autre clé');
  assert.equal(v('minecraft_version='), null, 'valeur vide');
  assert.equal(v(''), null);
});

test('chaque projet porte sa version, sans toucher à projet.json', async () => {
  const parId = Object.fromEntries((await projets.listerProjets()).map((p) => [p.id, p]));
  assert.equal(parId['zz-mod'].versionMinecraft, '26.2');
  assert.equal(parId['zz-sans-ligne'].versionMinecraft, null);
  assert.equal(parId['zz-sans-fichier'].versionMinecraft, null);
  assert.equal(parId['zz-mod'].fiche.versionMinecraft, undefined, 'pas dans la fiche');
  assert.equal(fs.readFileSync(path.join(racine, 'projets', 'zz-mod', 'projet.json'), 'utf8'), FICHE, 'projet.json inchangé');
});

test('modifier gradle.properties relance le chargement ; le relire, non', async () => {
  let signaux = 0;
  projets.demarrerSurveillance(() => { signaux += 1; });
  await attendre(300);

  // Simple lecture : aucun rechargement.
  fs.readFileSync(path.join(racine, 'projets', 'zz-mod', 'gradle.properties'));
  await projets.chargerProjet('zz-mod');
  await attendre(1000);
  assert.equal(signaux, 0, 'une lecture ne doit pas relancer le chargement');

  // Vrai changement : rechargement, nouvelle version.
  ecrire('projets/zz-mod/gradle.properties', 'minecraft_version=26.3\n');
  await attendre(1500);
  assert.ok(signaux >= 1, 'changement signalé');
  assert.equal((await projets.chargerProjet('zz-mod')).versionMinecraft, '26.3');

  // Ligne ajoutée dans un projet qui n'en avait pas.
  signaux = 0;
  ecrire('projets/zz-sans-fichier/gradle.properties', 'minecraft_version=26.2\n');
  await attendre(1500);
  assert.ok(signaux >= 1, 'apparition signalée');
  assert.equal((await projets.chargerProjet('zz-sans-fichier')).versionMinecraft, '26.2');
  projets.arreterSurveillance();
});
