// Modèles de « Nouvel outil » et création d'un projet à partir d'un modèle.
//
// Un modèle est un dossier contenant un fichier modele.json (voir app/templates/README.md)
// et les fichiers de départ. Dans les fichiers texte, {{nom}} et {{description}} sont
// remplacés. Modèles fournis : app/templates/ ; modèles personnels : Toolkit/templates/.
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const chemins = require('./chemins');
const { lireJson, ecrireJson, existe } = require('./fichiers');
const { genererClaudeMd } = require('./claude-md');
const git = require('./git');
const journal = require('./journal');

const EXTENSIONS_TEXTE = /\.(html?|css|m?js|cjs|ts|json|py|md|txt|bat|ps1|xml|ya?ml|toml|ini|gradle|java|kt)$/i;

async function lireModeles(dossier, personnel) {
  let entrees;
  try {
    entrees = await fs.readdir(dossier, { withFileTypes: true });
  } catch {
    return [];
  }
  const modeles = [];
  for (const e of entrees.filter((x) => x.isDirectory())) {
    try {
      const m = await lireJson(path.join(dossier, e.name, 'modele.json'));
      modeles.push({
        id: `${personnel ? 'perso' : 'app'}:${e.name}`,
        nom: m.nom || e.name,
        description: m.description || '',
        dossier: path.join(dossier, e.name),
        modele: m,
      });
    } catch (erreur) {
      if (erreur.code !== 'ENOENT') journal.erreur(`Modèle « ${e.name} » illisible :`, erreur);
    }
  }
  return modeles;
}

async function listerModeles() {
  const tous = [
    ...(await lireModeles(chemins.templatesApp, false)),
    ...(await lireModeles(chemins.templatesPerso, true)),
  ];
  return tous.sort((a, b) => (a.modele.ordre ?? 99) - (b.modele.ordre ?? 99) || a.nom.localeCompare(b.nom, 'fr'));
}

// Nom de dossier lisible et sûr à partir du nom de l'outil.
function nomDeDossier(nom) {
  return nom.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'outil';
}

async function dossierLibre(base) {
  let id = base;
  for (let n = 2; await existe(path.join(chemins.projets(), id)); n++) id = `${base}-${n}`;
  return id;
}

// Copie le modèle en remplaçant les variables dans les fichiers texte.
async function copierModele(source, destination, variables) {
  await fs.mkdir(destination, { recursive: true });
  for (const e of await fs.readdir(source, { withFileTypes: true })) {
    if (e.name === 'modele.json') continue;
    const de = path.join(source, e.name);
    const vers = path.join(destination, e.name);
    if (e.isDirectory()) {
      await copierModele(de, vers, variables);
    } else if (EXTENSIONS_TEXTE.test(e.name)) {
      const texte = await fs.readFile(de, 'utf8');
      await fs.writeFile(vers, texte.replace(/\{\{(\w+)\}\}/g, (tout, cle) => variables[cle] ?? tout), 'utf8');
    } else {
      await fs.copyFile(de, vers);
    }
  }
}

// Crée un projet complet : dossier, projet.json, CLAUDE.md, Git (init + premier commit).
// Renvoie { id, nom, demande, avertissement } ; « demande » est la consigne initiale pour Claude.
async function creerDepuisModele({ nom, modeleId, categorie, description }) {
  nom = String(nom || '').trim();
  description = String(description || '').trim();
  if (!nom) throw new Error('Donne un nom à l\'outil.');
  if (!description) throw new Error('Décris ce que l\'outil doit faire : Claude s\'en servira pour le créer.');
  const modele = (await listerModeles()).find((m) => m.id === modeleId);
  if (!modele) throw new Error('Modèle introuvable.');
  const m = modele.modele;

  const id = await dossierLibre(nomDeDossier(nom));
  const dossier = path.join(chemins.projets(), id);
  const variables = {
    nom,
    description,
    // Pour package.json et équivalents : nom technique sans espace.
    identifiant: id,
  };
  await copierModele(modele.dossier, dossier, variables);

  // Une phrase courte pour la fiche ; la description complète va dans CLAUDE.md et la demande.
  const resume = description.split(/\r?\n/)[0].slice(0, 200);
  const fiche = {
    schema: 1,
    nom,
    description: resume,
    type: m.type || 'autre',
    categorie: String(categorie || '').trim() || undefined,
    tags: [],
    favori: false,
    point_entree: m.point_entree || undefined,
    ouvrir_avec: m.ouvrir_avec || 'vscode',
    actions: m.actions || [],
    outils_lies: [],
  };
  await ecrireJson(path.join(dossier, 'projet.json'), fiche);
  await fs.writeFile(path.join(dossier, 'CLAUDE.md'), genererClaudeMd({
    fiche: { ...fiche, description },
    dossierRelatif: chemins.versRelatif(dossier),
    technologies: m.technologies,
    lancer: m.lancer,
  }), 'utf8');

  let avertissement = null;
  try {
    await git.initialiser(dossier);
    await git.commiterTout(dossier, `Création de l'outil « ${nom} » (modèle ${modele.nom})`);
  } catch (erreur) {
    avertissement = `L'outil est créé, mais sans historique Git : ${erreur.message}`;
  }

  const demande = `Crée l'outil « ${nom} » décrit ci-dessous. Commence par lire CLAUDE.md et projet.json, `
    + 'puis transforme les fichiers de départ du modèle pour réaliser l\'outil. Mets à jour projet.json '
    + '(description, actions…) si nécessaire, puis fais un commit local quand c\'est terminé.\n\n'
    + `Ce que l'outil doit faire :\n${description}`;

  return { id, nom, demande, avertissement };
}

module.exports = { listerModeles, creerDepuisModele };
