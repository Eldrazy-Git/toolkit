// Tests de la bibliothèque de skills : ancien dossier « kits » renommé, propositions, vérification
// des projets qui déclarent encore des kits. Lancer : npm test
// Le code est copié dans un dossier temporaire : sa racine y est donc calculée, et la vraie
// bibliothèque comme les vrais projets ne peuvent pas être touchés. Git local seulement.
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');

const APP = path.resolve(__dirname, '..');
const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-test-skills-'));
let skills;
let verification;
let contexte;

function ecrire(relatif, contenu) {
  const absolu = path.join(racine, relatif);
  fs.mkdirSync(path.dirname(absolu), { recursive: true });
  fs.writeFileSync(absolu, contenu);
}

const lancerGit = (dossier, ...args) => execFileSync('git', args, { cwd: dossier, stdio: 'pipe' }).toString();

before(() => {
  Object.assign(process.env, {
    GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@exemple.invalid',
    GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@exemple.invalid',
  });
  for (const d of ['src', 'docs']) fs.cpSync(path.join(APP, d), path.join(racine, 'app', d), { recursive: true });
  fs.copyFileSync(path.join(APP, 'package.json'), path.join(racine, 'app', 'package.json'));
  fs.mkdirSync(path.join(racine, 'projets'));
  fs.mkdirSync(path.join(racine, 'donnees'));

  // Ancienne bibliothèque « kits » : un skill, un ancien kit, son dépôt Git.
  ecrire('kits/.gitignore', 'propositions/\nCATALOGUE.md\n/CLAUDE.md\n');
  ecrire('kits/CATALOGUE.md', '# Catalogue\n');
  ecrire('kits/.claude/skills/revue/SKILL.md', '---\nname: revue\ndescription: Relit le code avant un commit.\n---\n\nÉtapes.\n');
  ecrire('kits/html-base/kit.json', '{ "schema": 1 }\n');
  lancerGit(path.join(racine, 'kits'), 'init', '-q');
  lancerGit(path.join(racine, 'kits'), 'add', '-A');
  lancerGit(path.join(racine, 'kits'), 'commit', '-q', '-m', 'Bibliothèque');

  // Un projet qui déclare encore un kit.
  ecrire('projets/zz-ancien/projet.json', JSON.stringify({ nom: 'Ancien', type: 'html', kits: [{ id: 'html-base', version: '1.0.0' }] }));
  ecrire('projets/zz-ancien/CLAUDE.md', '# Ancien\n\n<!-- toolkit:kit=html-modales= (section) -->\nRègles\n<!-- /toolkit:kit=html-modales= -->\n');
  ecrire('projets/zz-ancien/index.html', '<!doctype html>\n');
  ecrire('projets/zz-neuf/projet.json', JSON.stringify({ nom: 'Neuf', type: 'html' }));
  ecrire('projets/zz-neuf/index.html', '<!doctype html>\n');
  // Ancienne section des kits dans le catalogue des projets.
  ecrire('projets/CLAUDE.md', '# Projets\n\n<!-- toolkit:kits (section tenue à jour par Toolkit : ne pas la modifier à la main) -->\nAnciennes règles\n<!-- /toolkit:kits -->\n');

  const chargerOriginal = Module._load;
  Module._load = function charger(demande, ...reste) {
    if (demande === 'electron') return { shell: { trashItem: async () => {} }, app: { getPath: () => path.join(racine, 'donnees') } };
    return chargerOriginal.call(this, demande, ...reste);
  };
  const main = path.join(racine, 'app', 'src', 'main');
  assert.equal(require(path.join(main, 'chemins.js')).skills, path.join(racine, 'skills'), 'Le test doit travailler hors de la vraie bibliothèque.');
  skills = require(path.join(main, 'skills.js'));
  verification = require(path.join(main, 'verification.js'));
  contexte = require(path.join(main, 'contexte-claude.js'));
});

after(() => {
  fs.rmSync(racine, { recursive: true, force: true });
});

test('l\'ancien dossier « kits » devient « skills », historique compris', async () => {
  assert.equal(await skills.migrerAncienDossier(), true);
  assert.equal(fs.existsSync(path.join(racine, 'kits')), false);
  assert.equal(fs.existsSync(path.join(racine, 'skills', '.claude', 'skills', 'revue', 'SKILL.md')), true);
  assert.equal(fs.existsSync(path.join(racine, 'skills', 'CATALOGUE.md')), false, 'le catalogue des kits est retiré');
  assert.match(lancerGit(path.join(racine, 'skills'), 'log', '--oneline'), /Bibliothèque/);
  assert.equal(await skills.migrerAncienDossier(), false, 'une seule fois');
});

test('l\'onglet liste les skills et signale les anciens kits', async () => {
  await skills.assurerBibliotheque();
  const donnees = await skills.instantane();
  assert.equal(donnees.existe, true);
  assert.deepEqual(donnees.skills.map((s) => s.id), ['revue']);
  assert.equal(donnees.skills[0].description, 'Relit le code avant un commit.');
  assert.deepEqual(donnees.anciensKits, ['html-base']);
  assert.equal(donnees.ancienDossier, false);
  assert.match(fs.readFileSync(path.join(racine, 'skills', 'CLAUDE.md'), 'utf8'), /Bibliothèque de skills/);
});

test('une proposition de skill s\'accepte, un ancien kit est refusé', async () => {
  ecrire('skills/propositions/journal-erreurs/SKILL.md', '---\nname: journal-erreurs\ndescription: Tenir un journal des erreurs.\n---\n\nÉtapes.\n');
  ecrire('skills/propositions/journal-erreurs/proposition.md', 'Vu dans un projet.\n');
  ecrire('skills/propositions/vieux-kit/kit.json', '{}\n');
  const liste = await skills.listerPropositions();
  const kit = liste.find((p) => p.id === 'vieux-kit');
  assert.match(kit.problemes.join(' '), /plus les kits/);
  const bonne = liste.find((p) => p.id === 'journal-erreurs');
  assert.deepEqual(bonne.problemes, []);
  await skills.accepterProposition('journal-erreurs');
  assert.equal(fs.existsSync(path.join(racine, 'skills', '.claude', 'skills', 'journal-erreurs', 'SKILL.md')), true);
  assert.equal(fs.existsSync(path.join(racine, 'skills', '.claude', 'skills', 'journal-erreurs', 'proposition.md')), false);
  assert.match(lancerGit(path.join(racine, 'skills'), 'log', '--oneline', '-1'), /Proposition acceptée/);
});

test('un projet qui déclare encore des kits est signalé, pas les autres', async () => {
  const ancien = await verification.analyserProjet('zz-ancien');
  const point = ancien.ajustements.find((a) => a.cle === 'toolkit:anciens-kits');
  assert.ok(point, 'ajustement attendu');
  assert.match(point.detail, /html-base/);
  assert.match(point.detail, /html-modales/);
  assert.equal(point.infos, false, 'pas pour « Mettre à jour les fiches » : il faut retirer des sections toolkit');
  const neuf = await verification.analyserProjet('zz-neuf');
  assert.equal(neuf.ajustements.length, 0);
});

test('projets/CLAUDE.md : section des skills, ancienne section des kits retirée', async () => {
  await contexte.toutMettreAJour();
  const texte = fs.readFileSync(path.join(racine, 'projets', 'CLAUDE.md'), 'utf8');
  assert.doesNotMatch(texte, /toolkit:kits/);
  assert.match(texte, /<!-- toolkit:skills/);
  assert.match(texte, /\.\.\/\.\.\/skills\//);
});
