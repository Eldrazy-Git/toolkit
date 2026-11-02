// Règles de l'import : quels dossiers proposer d'écarter, et contiennent-ils du code source ?
// Un NOM de dossier ne suffit jamais : un package Java peut s'appeler « target » ou « build ».
// Sans Electron, pour être testé directement.
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

// Dépendances : à leur place, ce dossier est toujours recréable.
const NODE_MODULES = 'node_modules';
const ENVIRONNEMENTS_PYTHON = new Set(['.venv', 'venv']);
// Caches d'outils : noms assez particuliers pour ne pas être du code.
const CACHES = new Set(['.gradle', '.idea', '__pycache__', '.cxx', '.next', '.parcel-cache',
  '.pytest_cache', '.mypy_cache', '.externalNativeBuild', '.kotlin']);
// Résultats de compilation : noms courants, donc exigent un fichier de compilation à côté.
const RESULTATS = new Set(['build', 'dist', 'out', 'target']);
const FICHIERS_COMPILATION = ['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts',
  'package.json', 'pom.xml', 'pyproject.toml', 'setup.py'];
const DOSSIERS_SOURCE = new Set(['src', 'source', 'sources']);
const MARQUEURS_ENVIRONNEMENT = ['pyvenv.cfg', 'Scripts/activate', 'bin/activate'];

const EXTENSIONS_SOURCE = /\.(java|kt|kts|scala|groovy|js|jsx|mjs|cjs|ts|tsx|py|rb|go|rs|c|h|cc|cpp|hpp|cs|php|swift|dart|vue|svelte|lua)$/i;
// Dans un résultat de compilation, seuls ces sous-dossiers contiennent normalement des sources
// (code généré, copies des ressources, rapports de tests).
const SOUS_DOSSIERS_GENERES = new Set(['generated', 'generated-sources', 'generated-test-sources', 'intermediates',
  'tmp', 'classes', 'test-classes', 'resources', 'production', 'kotlin', 'kapt3', 'ksp', 'reports']);
const PAQUET_JS = /\.(js|mjs|cjs|d\.ts)$/i;
const EXEMPLES_MAX = 5;

const trouverVoisin = (voisins, nom) => voisins.find((v) => v.toLowerCase() === nom.toLowerCase());
const estSousSource = (rel) => rel.split('/').slice(0, -1).some((m) => DOSSIERS_SOURCE.has(m.toLowerCase()));

async function estEnvironnementPython(absolu) {
  for (const marqueur of MARQUEURS_ENVIRONNEMENT) {
    try {
      await fs.access(path.join(absolu, marqueur));
      return true;
    } catch {
      // Marqueur suivant.
    }
  }
  return false;
}

// voisins : noms des FICHIERS placés à côté du dossier.
// Renvoie { raison: 'compilation' | 'dependances' | 'cache', motif } ou null pour le garder.
async function raisonExclusion(absolu, rel, nom, voisins) {
  if (CACHES.has(nom)) return { raison: 'cache', motif: 'Cache d\'un outil' };
  if (nom === NODE_MODULES) {
    const aPaquet = trouverVoisin(voisins, 'package.json');
    if (estSousSource(rel) && !aPaquet) return null;
    return { raison: 'dependances', motif: 'Dépendances Node.js' };
  }
  if (ENVIRONNEMENTS_PYTHON.has(nom)) {
    return await estEnvironnementPython(absolu) ? { raison: 'dependances', motif: 'Environnement Python' } : null;
  }
  if (RESULTATS.has(nom) && !estSousSource(rel)) {
    const fichier = FICHIERS_COMPILATION.map((f) => trouverVoisin(voisins, f)).find(Boolean);
    if (fichier) return { raison: 'compilation', motif: `Résultat de compilation (à côté de ${fichier})` };
  }
  return null;
}

// Un fichier d'un dossier écarté : null (pas du code), 'attendu' ou 'inattendu'.
function classerFichier(relInterne, { nom, raison, voisins }) {
  if (!EXTENSIONS_SOURCE.test(relInterne)) return null;
  if (raison !== 'compilation') return 'attendu';
  const morceaux = relInterne.split('/');
  const premier = morceaux[0].toLowerCase();
  if (morceaux.length > 1 && SOUS_DOSSIERS_GENERES.has(premier)) return 'attendu';
  if (nom !== 'target' && trouverVoisin(voisins, 'package.json') && PAQUET_JS.test(relInterne)) return 'attendu';
  if (nom === 'build' && premier === 'lib' && (trouverVoisin(voisins, 'setup.py') || trouverVoisin(voisins, 'pyproject.toml'))) return 'attendu';
  return 'inattendu';
}

// Compte les fichiers source d'un dossier écarté, pendant qu'on le parcourt.
function creerBilanSources(exclu) {
  const bilan = { total: 0, inattendus: 0, extensions: [], exemples: [] };
  const extensions = new Set();
  return {
    ajouter(relInterne) {
      const classe = classerFichier(relInterne, exclu);
      if (!classe) return;
      bilan.total += 1;
      extensions.add(path.posix.extname(relInterne).toLowerCase());
      if (classe === 'inattendu') {
        bilan.inattendus += 1;
        if (bilan.exemples.length < EXEMPLES_MAX) bilan.exemples.push(relInterne);
      }
    },
    resultat: () => ({ ...bilan, extensions: [...extensions].sort() }),
  };
}

module.exports = { raisonExclusion, classerFichier, creerBilanSources, estSousSource, EXTENSIONS_SOURCE };
