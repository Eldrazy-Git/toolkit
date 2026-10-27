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
const TYPES = ['html', 'script', 'java', 'android', 'autre'];
// 'toolkit' : l'éditeur de code intégré à Toolkit (onglet « Code »).
const EDITEURS = ['toolkit', 'vscode', 'android-studio', 'notepad++', 'explorateur'];
const TYPES_PARAMETRES = ['fichier', 'fichiers', 'dossier', 'texte', 'case', 'choix'];
const SANS_CATEGORIE = 'Sans catégorie';
// Action par défaut (double-clic, bouton principal) : ces valeurs, ou « action:<nom> » (une
// action de la fiche) ou « outil:<point_entree> » (un outil lié). Absente = automatique.
const ACTIONS_PAR_DEFAUT = ['outil', 'editeur', 'code', 'claude'];

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

// Liens vers d'autres projets : [{ projet: id du dossier, description }] (voir contexte-claude.js).
function normaliserLiens(valeur) {
  if (!Array.isArray(valeur)) return [];
  const vus = new Set();
  return valeur
    .filter((l) => l && typeof l.projet === 'string' && l.projet.trim())
    .map((l) => ({ projet: l.projet.trim(), description: texte(l.description) || '' }))
    .filter((l) => !vus.has(l.projet) && vus.add(l.projet));
}

// Rend une fiche utilisable par l'interface, même incomplète, et liste les problèmes.
// La fiche d'origine sur le disque n'est jamais réécrite par cette fonction.
function normaliserFiche(brut, id) {
  const problemes = [];
  const b = brut && typeof brut === 'object' && !Array.isArray(brut) ? brut : {};
  const { type } = b;

  const fiche = {
    schema: Number.isInteger(b.schema) ? b.schema : VERSION_SCHEMA,
    nom: texte(b.nom) || id,
    description: texte(b.description),
    type: TYPES.includes(type) ? type : 'autre',
    categorie: texte(b.categorie) || SANS_CATEGORIE,
    tags: listeDeTextes(b.tags),
    favori: b.favori === true,
    icone: texte(b.icone) || null,
    point_entree: texte(b.point_entree) || null,
    ouvrir_avec: EDITEURS.includes(b.ouvrir_avec) ? b.ouvrir_avec : null,
    actions: [],
    outils_lies: [],
    git: { remote: texte(b.git?.remote) || null },
    liens: normaliserLiens(b.liens),
    action_par_defaut: null,
  };

  if (!texte(b.nom)) problemes.push('Le champ « nom » est vide : le nom du dossier est utilisé.');
  if (type !== undefined && !TYPES.includes(type)) {
    problemes.push(`Type « ${b.type} » inconnu (attendu : ${TYPES.join(', ')}).`);
  }
  if (b.ouvrir_avec !== undefined && b.ouvrir_avec !== null && !EDITEURS.includes(b.ouvrir_avec)) {
    problemes.push(`Éditeur « ${b.ouvrir_avec} » inconnu (attendu : ${EDITEURS.join(', ')}).`);
  }

  (Array.isArray(b.actions) ? b.actions : []).forEach((action, i) => {
    if (!estActionValide(action)) {
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
          // Pour « case » : texte ajouté à la commande si la case est cochée / décochée.
          valeur_si_coche: typeof p.valeur_si_coche === 'string' ? p.valeur_si_coche : undefined,
          valeur_si_decoche: typeof p.valeur_si_decoche === 'string' ? p.valeur_si_decoche : undefined,
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

  const parDefaut = texte(b.action_par_defaut);
  if (parDefaut) {
    if (actionParDefautExiste(fiche, parDefaut)) fiche.action_par_defaut = parDefaut;
    else problemes.push(`L'action par défaut « ${parDefaut} » n'existe pas : le choix automatique est utilisé.`);
  }

  return { fiche, problemes };
}

function estActionValide(action) {
  return Boolean(action && texte(action.nom) && texte(action.commande));
}

function actionParDefautExiste(fiche, valeur) {
  if (valeur === 'outil') return /\.html?$/i.test(fiche.point_entree || '');
  if (ACTIONS_PAR_DEFAUT.includes(valeur)) return true;
  if (valeur.startsWith('action:')) return fiche.actions.some((a) => a.nom === valeur.slice(7));
  if (valeur.startsWith('outil:')) return fiche.outils_lies.some((o) => o.point_entree === valeur.slice(6));
  return false;
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
  return { ...base, fiche, problemes, icone: await urlIcone(dossier, fiche.icone), ...(await datesProjet(dossier)) };
}

// --- Dates (pour trier la bibliothèque) ----------------------------------------------------

const DOSSIERS_SANS_DATE = new Set(['.git', 'node_modules', 'build', '.gradle', '.idea', 'dist', 'out', '__pycache__', '.venv', 'venv']);
const ELEMENTS_MAX_DATE = 400;

// dateAjout : création du dossier du projet (= date d'import ou de création dans Toolkit).
// dateModification : fichier le plus récent parmi la racine et le niveau suivant (sans
// descendre plus bas, pour rester rapide ; dossiers générés ignorés).
async function datesProjet(dossier) {
  let dateAjout = null;
  let dateModification = 0;
  try {
    const infos = await fsp.stat(dossier);
    dateAjout = infos.birthtimeMs || infos.ctimeMs;
  } catch {
    return { dateAjout: null, dateModification: null };
  }
  let vus = 0;
  const parcourir = async (d, profondeur) => {
    let entrees;
    try {
      entrees = await fsp.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entrees) {
      if (vus++ > ELEMENTS_MAX_DATE) return;
      if (e.isDirectory() && DOSSIERS_SANS_DATE.has(e.name)) continue;
      const chemin = path.join(d, e.name);
      if (e.isDirectory()) {
        if (profondeur > 0) await parcourir(chemin, profondeur - 1);
      } else {
        try {
          dateModification = Math.max(dateModification, (await fsp.stat(chemin)).mtimeMs);
        } catch {
          // Fichier disparu.
        }
      }
    }
  };
  await parcourir(dossier, 1);
  return { dateAjout, dateModification: dateModification || dateAjout };
}

// --- Icône ----------------------------------------------------------------------------------

const EXTENSIONS_IMAGES = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico'];

// Utilise une image comme icône du projet. Une image déjà dans le projet est simplement
// référencée ; une image prise ailleurs est copiée à la racine du projet (icone.<ext>),
// sans jamais écraser un fichier existant du projet.
async function changerIcone(id, cheminImage) {
  const dossier = dossierDuProjet(id);
  const extension = path.extname(cheminImage).slice(1).toLowerCase();
  if (!EXTENSIONS_IMAGES.includes(extension)) {
    throw new Error(`Ce fichier n'est pas une image reconnue (${EXTENSIONS_IMAGES.join(', ')}).`);
  }
  const image = path.resolve(cheminImage);
  let relatif;
  if (image.startsWith(dossier + path.sep)) {
    relatif = path.relative(dossier, image).split(path.sep).join('/');
  } else {
    const actuelle = (await chargerProjet(id))?.fiche.icone;
    let nom = `icone.${extension}`;
    // « icone.png » existe déjà et n'est pas l'icône actuelle : c'est un fichier du projet.
    if (await fsp.access(path.join(dossier, nom)).then(() => true, () => false) && actuelle !== nom) {
      nom = `icone-toolkit.${extension}`;
    }
    await fsp.copyFile(image, path.join(dossier, nom));
    relatif = nom;
  }
  return modifierFiche(id, { icone: relatif });
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

  // nom : nom affiché seulement. Le dossier (= l'identifiant) ne change pas ici : voir
  // renommerDossier(), qui met à jour liens, groupes et conversations de Claude.
  if ('nom' in changements) {
    const nom = texte(changements.nom);
    if (!nom) throw new Error('Le nom du projet ne peut pas être vide.');
    if (nom.length > 100) throw new Error('Ce nom est trop long (100 caractères au plus).');
    brut.nom = nom;
  }
  if ('favori' in changements) brut.favori = changements.favori === true;
  if ('description' in changements) {
    if (texte(changements.description)) brut.description = texte(changements.description);
    else delete brut.description;
  }
  if ('categorie' in changements) {
    const categorie = texte(changements.categorie);
    if (categorie && categorie !== SANS_CATEGORIE) brut.categorie = categorie;
    else delete brut.categorie;
  }
  if ('tags' in changements) brut.tags = listeDeTextes(changements.tags);
  // icone : chemin relatif au projet, ou null pour revenir à l'icône automatique (initiales).
  // (Le fichier image lui-même n'est jamais supprimé.)
  if ('icone' in changements) {
    if (texte(changements.icone)) brut.icone = texte(changements.icone);
    else delete brut.icone;
  }
  if ('ouvrir_avec' in changements) {
    if (EDITEURS.includes(changements.ouvrir_avec)) brut.ouvrir_avec = changements.ouvrir_avec;
    else delete brut.ouvrir_avec;
  }
  if ('liens' in changements) {
    const liens = normaliserLiens(changements.liens).filter((l) => l.projet !== id);
    if (liens.length) brut.liens = liens;
    else delete brut.liens;
  }
  if ('action_par_defaut' in changements) {
    const valeur = texte(changements.action_par_defaut);
    if (!valeur) delete brut.action_par_defaut;
    else if (actionParDefautExiste(normaliserFiche(brut, id).fiche, valeur)) brut.action_par_defaut = valeur;
    else throw new Error('Cette action n\'existe pas dans le projet.');
  }

  await ecrireJson(chemin, brut);
  return chargerProjet(id);
}

// --- Actions (boutons du panneau de détails) ----------------------------------------------

// operation : { type: 'ajouter', action } | { type: 'modifier', index, action }
//           | { type: 'supprimer', index } | { type: 'deplacer', index, sens: -1 | 1 }
// index = position dans fiche.actions (actions valides seulement, comme l'interface les
// voit). Seuls nom, commande, description et dossier sont écrits : les autres champs de
// l'action (parametres, ouvrir_dossier_apres…) sont conservés.
async function modifierActions(id, operation) {
  const chemin = path.join(dossierDuProjet(id), 'projet.json');
  let brut;
  try {
    brut = await lireJson(chemin);
  } catch (erreur) {
    const raison = erreur instanceof SyntaxError ? messageErreurJson(erreur) : erreur.message;
    throw new Error(`Impossible de modifier ce projet : sa fiche projet.json est illisible (${raison}).`);
  }
  const liste = Array.isArray(brut.actions) ? brut.actions : [];
  // Position dans le JSON de chaque action valide (une action invalide est ignorée à
  // l'affichage mais gardée dans le fichier).
  const positions = liste.map((a, i) => (estActionValide(a) ? i : -1)).filter((i) => i >= 0);
  const { type, index } = operation || {};
  if (type !== 'ajouter' && !Number.isInteger(positions[index])) throw new Error('Cette action n\'existe plus : la liste a changé.');
  const nomDe = (i) => texte(liste[positions[i]]?.nom);

  const champs = () => {
    const a = operation.action || {};
    const nom = texte(a.nom);
    const commande = texte(a.commande);
    if (!nom) throw new Error('Donne un nom à l\'action (c\'est le texte du bouton).');
    if (!commande) throw new Error('Indique la commande à lancer.');
    if (nom.length > 80) throw new Error('Ce nom est trop long (80 caractères au plus).');
    const autre = positions.findIndex((p, i) => texte(liste[p].nom) === nom && (type === 'ajouter' || i !== index));
    if (autre >= 0) throw new Error(`Une action s'appelle déjà « ${nom} ».`);
    const dossier = texte(a.dossier).replace(/\\/g, '/').replace(/^\.\/|\/$/g, '') || '.';
    if (path.isAbsolute(dossier) || dossier.split('/').includes('..')) {
      throw new Error('Le dossier doit être un dossier du projet, écrit depuis sa racine (ex. « scripts »), ou « . » pour le projet lui-même.');
    }
    return { nom, commande, description: texte(a.description), dossier };
  };
  const ecrireChamps = (cible, c) => {
    cible.nom = c.nom;
    cible.commande = c.commande;
    if (c.description) cible.description = c.description;
    else delete cible.description;
    if (c.dossier !== '.') cible.dossier = c.dossier;
    else delete cible.dossier;
    return cible;
  };

  if (type === 'ajouter') {
    liste.push(ecrireChamps({}, champs()));
  } else if (type === 'modifier') {
    const ancien = nomDe(index);
    const c = champs();
    ecrireChamps(liste[positions[index]], c);
    // L'action par défaut suit le changement de nom.
    if (brut.action_par_defaut === `action:${ancien}`) brut.action_par_defaut = `action:${c.nom}`;
  } else if (type === 'supprimer') {
    if (brut.action_par_defaut === `action:${nomDe(index)}`) delete brut.action_par_defaut;
    liste.splice(positions[index], 1);
  } else if (type === 'deplacer') {
    const voisin = index + (operation.sens < 0 ? -1 : 1);
    if (!Number.isInteger(positions[voisin])) return chargerProjet(id);
    const [a, b] = [positions[index], positions[voisin]];
    [liste[a], liste[b]] = [liste[b], liste[a]];
  } else {
    throw new Error('Opération inconnue.');
  }

  if (liste.length) brut.actions = liste;
  else delete brut.actions;
  await ecrireJson(chemin, brut);
  return chargerProjet(id);
}

// --- Renommer le dossier (= l'identifiant) ------------------------------------------------
// Rare et délicat : l'interface a fermé les onglets du projet et prévenu que les données des
// outils HTML ne suivent pas. Ici : le dossier, les liens des autres projets et la ligne
// « Emplacement » du CLAUDE.md du projet. Les réglages (groupes, épingles…) sont mis à jour
// par l'appelant.

const NOMS_RESERVES = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;

function verifierNouveauDossier(nom) {
  const n = texte(nom);
  if (!n) throw new Error('Le nom du dossier ne peut pas être vide.');
  if (n.length > 80) throw new Error('Ce nom de dossier est trop long (80 caractères au plus).');
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(n) || /[. ]$/.test(n) || NOMS_RESERVES.test(n)) {
    throw new Error('Nom de dossier impossible : utilise seulement des lettres, des chiffres, des tirets (-), des points et des « _ », sans finir par un point.');
  }
  return n;
}

async function renommerDossier(ancien, nouveau) {
  const source = dossierDuProjet(ancien);
  const nom = verifierNouveauDossier(nouveau);
  if (nom === ancien) return chargerProjet(ancien);
  if (!(await chargerProjet(ancien))) throw new Error('Ce projet n\'existe plus.');
  // Windows ignore la casse : « Mon-Projet » -> « mon-projet » est un simple changement de casse.
  const memeDossier = nom.toLowerCase() === ancien.toLowerCase();
  const destination = path.join(chemins.projets(), nom);
  if (!memeDossier && await fsp.stat(destination).catch(() => null)) {
    throw new Error(`Un dossier « ${nom} » existe déjà dans projets/ : choisis un autre nom.`);
  }

  // Nos surveillants gardent le dossier ouvert : Windows refuserait de le renommer.
  fermerSurveillants();
  try {
    await fsp.rename(source, destination);
  } catch (erreur) {
    journal.erreur(`Renommage du dossier ${ancien} -> ${nom} :`, erreur);
    throw new Error('Windows refuse de renommer le dossier : un programme l\'utilise encore (VS Code, Android Studio, l\'Explorateur, un terminal, Gradle…). Ferme-le puis réessaie.');
  } finally {
    if (rappelChangement) reconstruire();
  }

  // Liens déclarés par les autres projets vers celui-ci.
  for (const p of await listerProjets()) {
    if (p.erreur || p.id === nom || !p.fiche.liens.some((l) => l.projet === ancien)) continue;
    await modifierFiche(p.id, { liens: p.fiche.liens.map((l) => (l.projet === ancien ? { ...l, projet: nom } : l)) })
      .catch((erreur) => journal.erreur(`Lien de ${p.id} vers ${ancien} non mis à jour :`, erreur));
  }

  // « Emplacement : `projets/<ancien>/` » écrit dans son CLAUDE.md à la création / l'import.
  const claudeMd = path.join(destination, 'CLAUDE.md');
  try {
    const contenu = await fsp.readFile(claudeMd, 'utf8');
    const ancienChemin = `${chemins.versRelatif(source)}/`;
    if (contenu.includes(ancienChemin)) {
      await fsp.writeFile(claudeMd, contenu.split(ancienChemin).join(`${chemins.versRelatif(destination)}/`), 'utf8');
    }
  } catch (erreur) {
    if (erreur.code !== 'ENOENT') journal.erreur(`CLAUDE.md de ${nom} non mis à jour :`, erreur);
  }
  return chargerProjet(nom);
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
  modifierActions,
  renommerDossier,
  changerIcone,
  EXTENSIONS_IMAGES,
  renommerCategorie,
  renommerTag,
  demarrerSurveillance,
  arreterSurveillance,
};
