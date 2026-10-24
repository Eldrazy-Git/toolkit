// Lecture, modification et surveillance des projets (projets/<id>/projet.json).
// Le schéma de projet.json est documenté dans docs/projet-json.md.
'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const chemins = require('./chemins');
const { lireJson, ecrireJson, messageErreurJson } = require('./fichiers');
const journal = require('./journal');

const VERSION_SCHEMA = 1;
const TYPES = ['html', 'script', 'mod-minecraft', 'android', 'autre'];
const EDITEURS = ['vscode', 'android-studio', 'notepad++', 'explorateur'];
const TYPES_PARAMETRES = ['fichier', 'fichiers', 'dossier', 'texte', 'case', 'choix'];
const SANS_CATEGORIE = 'Sans catégorie';

// --- Identifiants -------------------------------------------------------------

// L'identifiant d'un projet est le nom de son dossier dans projets/.
function verifierId(id) {
  if (typeof id !== 'string' || id === '' || id === '.' || id === '..' || /[\\/:*?"<>|]/.test(id)) {
    throw new Error(`Identifiant de projet invalide : « ${id} ».`);
  }
  return id;
}

function dossierDuProjet(id) {
  return path.join(chemins.projets(), verifierId(id));
}

// --- Normalisation ------------------------------------------------------------

function texte(valeur, defaut = '') {
  return typeof valeur === 'string' ? valeur.trim() : defaut;
}

function listeDeTextes(valeur) {
  if (!Array.isArray(valeur)) return [];
  return [...new Set(valeur.filter((v) => typeof v === 'string').map((v) => v.trim()).filter(Boolean))];
}

// Rend une fiche utilisable par l'interface, même incomplète, et liste les problèmes.
// La fiche d'origine sur le disque n'est jamais réécrite par cette fonction.
function normaliserFiche(brut, id) {
  const problemes = [];
  const b = brut && typeof brut === 'object' && !Array.isArray(brut) ? brut : {};

  const fiche = {
    schema: Number.isInteger(b.schema) ? b.schema : VERSION_SCHEMA,
    nom: texte(b.nom) || id,
    description: texte(b.description),
    type: TYPES.includes(b.type) ? b.type : 'autre',
    categorie: texte(b.categorie) || SANS_CATEGORIE,
    tags: listeDeTextes(b.tags),
    favori: b.favori === true,
    icone: texte(b.icone) || null,
    point_entree: texte(b.point_entree) || null,
    ouvrir_avec: EDITEURS.includes(b.ouvrir_avec) ? b.ouvrir_avec : null,
    actions: [],
    outils_lies: [],
    git: { remote: texte(b.git?.remote) || null },
  };

  if (!texte(b.nom)) problemes.push('Le champ « nom » est vide : le nom du dossier est utilisé.');
  if (b.type !== undefined && !TYPES.includes(b.type)) {
    problemes.push(`Type « ${b.type} » inconnu (attendu : ${TYPES.join(', ')}).`);
  }
  if (b.ouvrir_avec !== undefined && b.ouvrir_avec !== null && !EDITEURS.includes(b.ouvrir_avec)) {
    problemes.push(`Éditeur « ${b.ouvrir_avec} » inconnu (attendu : ${EDITEURS.join(', ')}).`);
  }

  (Array.isArray(b.actions) ? b.actions : []).forEach((action, i) => {
    if (!action || !texte(action.nom) || !texte(action.commande)) {
      problemes.push(`L'action n°${i + 1} doit avoir un « nom » et une « commande ».`);
      return;
    }
    const parametres = (Array.isArray(action.parametres) ? action.parametres : [])
      .filter((p) => p && texte(p.id))
      .map((p) => {
        if (!TYPES_PARAMETRES.includes(p.type)) {
          problemes.push(`Action « ${action.nom} » : type de paramètre « ${p.type} » inconnu.`);
        }
        return {
          id: texte(p.id),
          type: TYPES_PARAMETRES.includes(p.type) ? p.type : 'texte',
          libelle: texte(p.libelle) || texte(p.id),
          obligatoire: p.obligatoire !== false,
          defaut: p.defaut ?? null,
          options: listeDeTextes(p.options),
          extensions: listeDeTextes(p.extensions),
        };
      });
    fiche.actions.push({
      nom: texte(action.nom),
      description: texte(action.description),
      commande: texte(action.commande),
      dossier: texte(action.dossier) || '.',
      parametres,
      ouvrir_dossier_apres: texte(action.ouvrir_dossier_apres) || null,
    });
  });

  (Array.isArray(b.outils_lies) ? b.outils_lies : []).forEach((outil, i) => {
    if (!outil || !texte(outil.point_entree)) {
      problemes.push(`L'outil lié n°${i + 1} doit avoir un « point_entree ».`);
      return;
    }
    fiche.outils_lies.push({
      nom: texte(outil.nom) || texte(outil.point_entree),
      description: texte(outil.description),
      point_entree: texte(outil.point_entree),
    });
  });

  return { fiche, problemes };
}

// --- Lecture ------------------------------------------------------------------

async function urlIcone(dossier, icone) {
  if (!icone) return null;
  const chemin = path.resolve(dossier, icone);
  // Refuse une icône située hors du dossier du projet.
  if (!chemin.startsWith(dossier + path.sep)) return null;
  try {
    const infos = await fsp.stat(chemin);
    return `${pathToFileURL(chemin).href}?v=${Math.round(infos.mtimeMs)}`;
  } catch {
    return null;
  }
}

// Renvoie null si le dossier n'est pas un projet (pas de projet.json).
async function chargerProjet(id) {
  const dossier = dossierDuProjet(id);
  const base = { id, dossier: chemins.versRelatif(dossier), erreur: null, problemes: [] };
  let brut;
  try {
    brut = await lireJson(path.join(dossier, 'projet.json'));
  } catch (erreur) {
    if (erreur.code === 'ENOENT' || erreur.code === 'ENOTDIR') return null;
    const raison = erreur instanceof SyntaxError ? messageErreurJson(erreur) : erreur.message;
    return {
      ...base,
      fiche: normaliserFiche({}, id).fiche,
      erreur: `La fiche projet.json est illisible : ${raison}.`,
      icone: null,
    };
  }
  const { fiche, problemes } = normaliserFiche(brut, id);
  return { ...base, fiche, problemes, icone: await urlIcone(dossier, fiche.icone) };
}

async function listerProjets() {
  const racine = chemins.projets();
  let entrees;
  try {
    entrees = await fsp.readdir(racine, { withFileTypes: true });
  } catch (erreur) {
    if (erreur.code === 'ENOENT') return [];
    throw new Error(`Impossible de lire le dossier des projets : ${erreur.message}`);
  }
  const ids = entrees.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name);
  const projets = await Promise.all(ids.map((id) => chargerProjet(id).catch((erreur) => {
    journal.erreur(`Projet « ${id} » :`, erreur);
    return null;
  })));
  return projets
    .filter(Boolean)
    .sort((a, b) => a.fiche.nom.localeCompare(b.fiche.nom, 'fr', { sensitivity: 'base' }));
}

// --- Modification -------------------------------------------------------------

// Seuls ces champs peuvent être modifiés depuis l'interface pour l'instant.
// Les autres champs de la fiche sont conservés tels quels.
async function modifierFiche(id, changements) {
  const chemin = path.join(dossierDuProjet(id), 'projet.json');
  let brut;
  try {
    brut = await lireJson(chemin);
  } catch (erreur) {
    const raison = erreur instanceof SyntaxError ? messageErreurJson(erreur) : erreur.message;
    throw new Error(`Impossible de modifier ce projet : sa fiche projet.json est illisible (${raison}).`);
  }

  if ('favori' in changements) brut.favori = changements.favori === true;
  if ('categorie' in changements) {
    const categorie = texte(changements.categorie);
    if (categorie && categorie !== SANS_CATEGORIE) brut.categorie = categorie;
    else delete brut.categorie;
  }
  if ('tags' in changements) brut.tags = listeDeTextes(changements.tags);

  await ecrireJson(chemin, brut);
  return chargerProjet(id);
}

async function renommerCategorie(ancienne, nouvelle) {
  const projets = await listerProjets();
  const concernes = projets.filter((p) => !p.erreur && p.fiche.categorie === ancienne);
  for (const p of concernes) await modifierFiche(p.id, { categorie: nouvelle });
  return concernes.length;
}

// nouveau = null pour retirer le tag de tous les projets.
async function renommerTag(ancien, nouveau) {
  const projets = await listerProjets();
  const concernes = projets.filter((p) => !p.erreur && p.fiche.tags.includes(ancien));
  for (const p of concernes) {
    const tags = p.fiche.tags.map((t) => (t === ancien ? nouveau : t)).filter(Boolean);
    await modifierFiche(p.id, { tags });
  }
  return concernes.length;
}

// --- Surveillance ---------------------------------------------------------------
// Active seulement quand la fenêtre est ouverte. Pas de surveillance récursive :
// on surveille le dossier projets/ et la racine de chaque projet (là où se trouvent
// projet.json et l'icône), ce qui évite d'être inondé pendant une compilation.

const FICHIERS_SURVEILLES = /(^|[\\/])projet\.json$|\.(png|jpe?g|gif|webp|svg|ico)$/i;
const DELAI = 300;

let surveillants = [];
let minuteurChangement = null;
let minuteurReconstruction = null;
let rappelChangement = null;

function signalerChangement() {
  clearTimeout(minuteurChangement);
  minuteurChangement = setTimeout(() => rappelChangement?.(), DELAI);
}

function surveiller(dossier, surEvenement) {
  try {
    const s = fs.watch(dossier, { persistent: false }, surEvenement);
    s.on('error', () => planifierReconstruction());
    surveillants.push(s);
  } catch {
    // Dossier supprimé entre-temps : ignoré.
  }
}

function fermerSurveillants() {
  surveillants.forEach((s) => s.close());
  surveillants = [];
}

function planifierReconstruction() {
  clearTimeout(minuteurReconstruction);
  minuteurReconstruction = setTimeout(reconstruire, DELAI);
}

function reconstruire() {
  if (!rappelChangement) return;
  fermerSurveillants();
  const racine = chemins.projets();
  // Un projet ajouté, supprimé ou renommé : on reconstruit la liste des surveillants.
  surveiller(racine, () => {
    planifierReconstruction();
    signalerChangement();
  });
  let entrees = [];
  try {
    entrees = fs.readdirSync(racine, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entrees) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue;
    surveiller(path.join(racine, e.name), (_type, nom) => {
      if (!nom || FICHIERS_SURVEILLES.test(nom)) signalerChangement();
    });
  }
}

function demarrerSurveillance(rappel) {
  rappelChangement = rappel;
  reconstruire();
}

function arreterSurveillance() {
  rappelChangement = null;
  clearTimeout(minuteurChangement);
  clearTimeout(minuteurReconstruction);
  fermerSurveillants();
}

module.exports = {
  TYPES,
  EDITEURS,
  SANS_CATEGORIE,
  normaliserFiche,
  chargerProjet,
  listerProjets,
  modifierFiche,
  renommerCategorie,
  renommerTag,
  demarrerSurveillance,
  arreterSurveillance,
};
