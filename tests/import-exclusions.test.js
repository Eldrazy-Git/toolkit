// Tests de l'import : aucun code source perdu, exclusions visibles. Lancer : npm test
// Le code est copié dans un dossier temporaire : sa racine y est donc calculée, et les vrais
// projets ne peuvent pas être touchés. Git local seulement, rien n'est envoyé.
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');

const APP = path.resolve(__dirname, '..');
const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-test-import-'));
// Hors de la racine : Toolkit refuse d'importer ses propres dossiers.
const sources = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-test-sources-'));
const envoyesCorbeille = [];
let importation;
let git;
let n = 0;

function ecrire(racineProjet, fichiers) {
  for (const rel of fichiers) {
    const absolu = path.join(racineProjet, rel);
    fs.mkdirSync(path.dirname(absolu), { recursive: true });
    fs.writeFileSync(absolu, `contenu de ${rel}\n`);
  }
}

function projet(fichiers) {
  const dossier = path.join(sources, `projet${++n}`);
  ecrire(dossier, fichiers);
  return dossier;
}

const lancerGit = (dossier, ...args) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@exemple.invalid', ...args], { cwd: dossier, stdio: 'pipe' }).toString();

const chemins = (rapport) => rapport.stats.exclus.map((e) => e.chemin).sort();
const trouver = (rapport, chemin) => rapport.stats.exclus.find((e) => e.chemin === chemin);

// Import avec les choix par défaut de l'interface. Renvoie le dossier obtenu.
async function importer(rapport, autres = {}) {
  const resultat = await importation.executer(rapport.id, {
    nom: rapport.proposition.nom,
    idProjet: rapport.proposition.idProjet,
    type: rapport.proposition.type,
    actions: [],
    outilsLies: [],
    exclus: rapport.stats.exclus.filter((e) => e.exclureParDefaut).map((e) => e.chemin),
    garderOriginal: true,
    initialiserGit: false,
    ...autres,
  }, () => {});
  return { resultat, dossier: path.join(racine, 'projets', resultat.id) };
}

before(() => {
  // Identité des commits faits par l'import, quelle que soit la configuration du PC.
  Object.assign(process.env, {
    GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@exemple.invalid',
    GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@exemple.invalid',
  });
  fs.mkdirSync(path.join(racine, 'app'), { recursive: true });
  fs.mkdirSync(path.join(racine, 'projets'));
  fs.mkdirSync(path.join(racine, 'donnees'));
  fs.cpSync(path.join(APP, 'src', 'main'), path.join(racine, 'app', 'src', 'main'), { recursive: true });
  fs.copyFileSync(path.join(APP, 'package.json'), path.join(racine, 'app', 'package.json'));

  const chargerOriginal = Module._load;
  Module._load = function charger(demande, ...reste) {
    if (demande === 'electron') {
      return {
        shell: { trashItem: async (chemin) => { envoyesCorbeille.push(chemin); } },
        app: { getPath: () => path.join(racine, 'donnees') },
      };
    }
    return chargerOriginal.call(this, demande, ...reste);
  };

  const main = path.join(racine, 'app', 'src', 'main');
  assert.equal(require(path.join(main, 'chemins.js')).projets(), path.join(racine, 'projets'), 'Le test doit travailler hors des vrais projets.');
  require(path.join(main, 'github.js')).etat = async () => ({ installe: false, connecte: false });
  git = require(path.join(main, 'git.js'));
  importation = require(path.join(main, 'import.js'));
});

after(() => {
  fs.rmSync(racine, { recursive: true, force: true });
  fs.rmSync(sources, { recursive: true, force: true });
});

test('un dossier target/ de package Java est conservé, le target/ d\'un projet Maven est écarté', async () => {
  const source = projet([
    'pom.xml',
    'src/main/java/fr/exemple/Principal.java',
    'src/main/java/fr/exemple/target/EntityFilter.java',
    'target/classes/fr/exemple/Principal.class',
  ]);
  const rapport = await importation.analyser(source, () => {});
  assert.deepEqual(chemins(rapport), ['target']);
  const { dossier } = await importer(rapport);
  assert.ok(fs.existsSync(path.join(dossier, 'src/main/java/fr/exemple/target/EntityFilter.java')));
  assert.ok(!fs.existsSync(path.join(dossier, 'target')));
});

test('projet Gradle : build/ et target/ à la racine écartés, build/ sous src/ gardé', async () => {
  const source = projet([
    'build.gradle',
    'build/libs/mod.jar',
    'target/rapport.bin',
    'src/main/java/fr/exemple/build/Plan.java',
    'src/main/java/fr/exemple/dist/Colis.java',
    'src/main/java/fr/exemple/out/Sortie.java',
  ]);
  const rapport = await importation.analyser(source, () => {});
  assert.deepEqual(chemins(rapport), ['build', 'target']);
  const { dossier } = await importer(rapport);
  for (const f of ['build/Plan.java', 'dist/Colis.java', 'out/Sortie.java']) {
    assert.ok(fs.existsSync(path.join(dossier, 'src/main/java/fr/exemple', f)), f);
  }
});

test('node_modules/ et build/ restent écartés', async () => {
  const source = projet(['package.json', 'node_modules/lib/index.js', 'build/app.js', 'index.js']);
  const rapport = await importation.analyser(source, () => {});
  assert.deepEqual(chemins(rapport), ['build', 'node_modules']);
  assert.ok(rapport.stats.exclus.every((e) => e.exclureParDefaut));
  assert.equal(trouver(rapport, 'node_modules').sources.total, 1);
  assert.equal(trouver(rapport, 'node_modules').aVerifier, false);
  const { dossier } = await importer(rapport);
  assert.ok(!fs.existsSync(path.join(dossier, 'node_modules')));
  assert.ok(!fs.existsSync(path.join(dossier, 'build')));
  assert.ok(fs.existsSync(path.join(dossier, 'index.js')));
});

test('sous-module : son build/ est écarté, son code et un build/ sans fichier de compilation sont gardés', async () => {
  const source = projet([
    'settings.gradle',
    'app/build.gradle',
    'app/build/outputs/app.apk',
    'app/src/main/java/fr/exemple/target/Cible.java',
    'app/src/main/java/fr/exemple/build/Plan.java',
    'documentation/build/page.bin',
  ]);
  const rapport = await importation.analyser(source, () => {});
  assert.deepEqual(chemins(rapport), ['app/build']);
  const { dossier } = await importer(rapport);
  assert.ok(!fs.existsSync(path.join(dossier, 'app/build')));
  assert.ok(fs.existsSync(path.join(dossier, 'app/src/main/java/fr/exemple/target/Cible.java')));
  assert.ok(fs.existsSync(path.join(dossier, 'app/src/main/java/fr/exemple/build/Plan.java')));
  assert.ok(fs.existsSync(path.join(dossier, 'documentation/build/page.bin')));
});

test('sans fichier de compilation à côté, rien n\'est écarté', async () => {
  const source = projet(['index.html', 'dist/page.js', 'out/image.png']);
  const rapport = await importation.analyser(source, () => {});
  assert.deepEqual(chemins(rapport), []);
});

test('du code dans un dossier de compilation : avertissement et dossier gardé par défaut', async () => {
  const source = projet(['pom.xml', 'target/fr/exemple/Oublie.java', 'target/fr/exemple/Oublie2.java']);
  const rapport = await importation.analyser(source, () => {});
  const dossierTarget = trouver(rapport, 'target');
  assert.equal(dossierTarget.aVerifier, true);
  assert.equal(dossierTarget.exclureParDefaut, false);
  assert.equal(dossierTarget.sources.inattendus, 2);
  assert.deepEqual(dossierTarget.sources.extensions, ['.java']);
  assert.ok(rapport.risques.some((r) => r.niveau === 'attention' && r.titre.includes('code source')));
  const { dossier } = await importer(rapport);
  assert.ok(fs.existsSync(path.join(dossier, 'target/fr/exemple/Oublie.java')));
});

test('garder un dossier écarté : il suffit de le retirer de la liste ; l\'écarter malgré l\'alerte est signalé', async () => {
  const garde = await importation.analyser(projet(['package.json', 'dist/garde.bin']), () => {});
  const { dossier } = await importer(garde, { exclus: [] });
  assert.ok(fs.existsSync(path.join(dossier, 'dist/garde.bin')));

  const force = await importation.analyser(projet(['pom.xml', 'target/Oublie.java']), () => {});
  const { resultat } = await importer(force, { exclus: ['target'] });
  assert.ok(resultat.avertissements.some((a) => a.includes('target')));
  assert.ok(resultat.etapes.some((e) => e.includes('écarté') && e.includes('target')));
});

test('le code généré, le paquet JS d\'un dist/ et les caches ne déclenchent pas d\'alerte', async () => {
  const source = projet([
    'build.gradle',
    'build/generated/sources/R.java',
    'build/reports/tests/test/js/report.js',
    'app/package.json',
    'app/dist/bundle.js',
    'app/dist/types.d.ts',
    '.gradle/8/script.kts',
  ]);
  const rapport = await importation.analyser(source, () => {});
  assert.deepEqual(chemins(rapport), ['.gradle', 'app/dist', 'build']);
  assert.ok(rapport.stats.exclus.every((e) => !e.aVerifier && e.exclureParDefaut && e.sources.total > 0));
});

test('venv/ n\'est écarté que si c\'est un vrai environnement Python', async () => {
  const faux = await importation.analyser(projet(['main.py', 'src/venv/module.py', 'venv/outil.py']), () => {});
  assert.deepEqual(chemins(faux), []);
  const vrai = await importation.analyser(projet(['main.py', 'venv/pyvenv.cfg', 'venv/Lib/site.py']), () => {});
  assert.deepEqual(chemins(vrai), ['venv']);
});

test('node_modules/ d\'un dossier source, sans package.json à côté, est gardé', async () => {
  const rapport = await importation.analyser(projet(['package.json', 'src/node_modules/interne/code.js']), () => {});
  assert.deepEqual(chemins(rapport), []);
});

test('un dossier écarté mais suivi par Git est gardé par défaut', async () => {
  const source = projet(['pom.xml', 'target/a.bin', 'App.java']);
  lancerGit(source, 'init', '-b', 'main');
  lancerGit(source, 'add', '.');
  lancerGit(source, 'commit', '-m', 'depart');
  const rapport = await importation.analyser(source, () => {});
  const dossierTarget = trouver(rapport, 'target');
  assert.equal(dossierTarget.suiviParGit, true);
  assert.equal(dossierTarget.exclureParDefaut, false);
});

test('dépôt GitHub : rien n\'est écarté, le dépôt est rangé en entier', async () => {
  const depot = projet([
    'build.gradle',
    'build/suivi.bin',
    'src/main/java/fr/exemple/target/Cible.java',
  ]);
  lancerGit(depot, 'init', '-b', 'main');
  lancerGit(depot, 'add', '.');
  lancerGit(depot, 'commit', '-m', 'depart');
  const clonerOriginal = git.cloner;
  git.cloner = async (_url, destination) => { lancerGit(sources, 'clone', depot, destination); };
  try {
    const rapport = await importation.cloner('moi/depot-test', () => {});
    assert.deepEqual(chemins(rapport), []);
    assert.ok(rapport.stats.fichiers >= 3);
    const { dossier } = await importer(rapport);
    assert.ok(fs.existsSync(path.join(dossier, 'build/suivi.bin')));
    assert.ok(fs.existsSync(path.join(dossier, 'src/main/java/fr/exemple/target/Cible.java')));
  } finally {
    git.cloner = clonerOriginal;
  }
});

test('fichier seul : copié tel quel, rien d\'écarté, même dans un dossier target/', async () => {
  const source = projet(['pom.xml', 'target/outil.html']);
  const rapport = await importation.analyser(path.join(source, 'target', 'outil.html'), () => {});
  assert.deepEqual(chemins(rapport), []);
  const { dossier } = await importer(rapport);
  assert.ok(fs.existsSync(path.join(dossier, 'outil.html')));
});

test('.gitignore de Toolkit : le build/ racine est ignoré, le code sous src/ est enregistré', async () => {
  const source = projet([
    'build.gradle',
    'src/main/java/fr/exemple/build/Plan.java',
    'src/main/java/fr/exemple/out/Sortie.java',
    'src/build/Direct.java',
    'app/src/main/java/fr/exemple/dist/Colis.java',
  ]);
  const rapport = await importation.analyser(source, () => {});
  const { dossier, resultat } = await importer(rapport, { initialiserGit: true });
  assert.deepEqual(resultat.avertissements, []);
  ecrire(dossier, ['build/libs/mod.jar', 'app/build/sortie.bin']);
  const suivis = lancerGit(dossier, 'ls-files');
  for (const f of ['src/main/java/fr/exemple/build/Plan.java', 'src/main/java/fr/exemple/out/Sortie.java', 'src/build/Direct.java', 'app/src/main/java/fr/exemple/dist/Colis.java']) {
    assert.ok(suivis.includes(f), f);
  }
  const ignores = lancerGit(dossier, 'status', '--porcelain', '--ignored=matching');
  assert.ok(ignores.includes('!! build/'));
  assert.ok(ignores.includes('!! app/build/'));
});

test('.gitignore du projet qui ignore du code : signalé après l\'import', async () => {
  const source = projet(['build.gradle', 'src/main/java/fr/exemple/classes/Liste.java']);
  fs.writeFileSync(path.join(source, '.gitignore'), 'classes/\n');
  const rapport = await importation.analyser(source, () => {});
  const { resultat, dossier } = await importer(rapport, { initialiserGit: true });
  assert.ok(fs.existsSync(path.join(dossier, 'src/main/java/fr/exemple/classes/Liste.java')));
  assert.ok(resultat.avertissements.some((a) => a.includes('Git ignore 1 fichier(s) source')));
});
