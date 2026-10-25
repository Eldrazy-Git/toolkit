// Groupes de projets de la barre latérale : des « dossiers » virtuels, imbricables.
// Rangés dans les réglages (donnees/reglages.json > interface.groupes) : les dossiers des
// projets ne bougent jamais et projet.json n'est pas touché. Un projet peut être dans
// plusieurs groupes ; un projet supprimé ou renommé disparaît simplement de l'affichage.
// Groupe : { id, nom, parent (id ou null), projets: [ids], replie }
import * as etat from './etat.js';
import { icone } from './icones.js';
import { iconeProjet } from './icone-projet.js';
import { notifier } from './notifications.js';
import { demanderTexte, confirmer, cocher } from './dialogue.js';
import { ouvrirMenu } from './menu.js';

const api = window.toolkit;
const parNom = (a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base', numeric: true });

// Nettoie la liste lue dans les réglages (fichier modifié à la main, parent disparu, boucle).
export function nettoyer(liste) {
  if (!Array.isArray(liste)) return [];
  const groupes = liste
    .filter((g) => g && typeof g.id === 'string' && typeof g.nom === 'string' && g.nom.trim())
    .map((g) => ({
      id: g.id,
      nom: g.nom.trim(),
      parent: typeof g.parent === 'string' ? g.parent : null,
      projets: Array.isArray(g.projets) ? [...new Set(g.projets.filter((p) => typeof p === 'string'))] : [],
      replie: g.replie === true,
    }));
  const parId = new Map(groupes.map((g) => [g.id, g]));
  for (const g of groupes) {
    if (!parId.has(g.parent)) g.parent = null;
    // Un groupe rangé (indirectement) dans lui-même remonte au premier niveau.
    const vus = new Set([g.id]);
    for (let p = parId.get(g.parent); p; p = parId.get(p.parent)) {
      if (vus.has(p.id)) { g.parent = null; break; }
      vus.add(p.id);
    }
  }
  return groupes;
}

export function tous() {
  return etat.obtenir().groupes;
}

export function trouver(id) {
  return tous().find((g) => g.id === id) || null;
}

export function enfants(parent) {
  return tous().filter((g) => g.parent === parent).sort(parNom);
}

// Groupes dans l'ordre de l'arbre : [{ groupe, niveau }] ; « sauf » écarte un groupe et ses sous-groupes.
export function arbre(parent = null, niveau = 0, sauf = null) {
  return enfants(parent)
    .filter((g) => g.id !== sauf)
    .flatMap((g) => [{ groupe: g, niveau }, ...arbre(g.id, niveau + 1, sauf)]);
}

// Le groupe et tous ses sous-groupes (ids).
function descendants(id) {
  const ids = new Set([id]);
  for (const g of enfants(id)) descendants(g.id).forEach((d) => ids.add(d));
  return ids;
}

// Projets existants du groupe et de ses sous-groupes (ids, sans doublon).
export function projetsDe(id) {
  const existants = new Set(etat.obtenir().projets.map((p) => p.id));
  const ids = new Set();
  for (const gid of descendants(id)) {
    for (const pid of trouver(gid)?.projets || []) if (existants.has(pid)) ids.add(pid);
  }
  return ids;
}

// « Catalogue › Outils de mise à jour »
export function chemin(id) {
  const noms = [];
  for (let g = trouver(id); g && noms.length < 50; g = trouver(g.parent)) noms.unshift(g.nom);
  return noms.join(' › ');
}

export function groupesDuProjet(projetId) {
  return tous().filter((g) => g.projets.includes(projetId))
    .sort((a, b) => chemin(a.id).localeCompare(chemin(b.id), 'fr', { sensitivity: 'base' }));
}

async function enregistrer(groupes) {
  etat.modifier({ groupes });
  try {
    await api.reglages.modifier({ interface: { groupes } });
  } catch (erreur) {
    notifier(erreur.message, 'erreur');
  }
}

function modifierGroupe(id, changement) {
  return enregistrer(tous().map((g) => (g.id === id ? { ...g, ...changement(g) } : g)));
}

function nomPris(nom, parent, sauf = null) {
  return tous().some((g) => g.parent === parent && g.id !== sauf && g.nom.toLowerCase() === nom.toLowerCase());
}

function nouvelId() {
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// --- Actions ----------------------------------------------------------------------------------

export function afficher(id) {
  etat.modifier({ filtre: { type: 'groupe', valeur: id }, ongletActif: 'bibliotheque' });
}

export async function creer(parent = null, projets = []) {
  const nom = await demanderTexte({
    titre: parent ? 'Nouveau sous-groupe' : 'Nouveau groupe',
    message: parent
      ? `Sous-groupe de « ${chemin(parent)} » :`
      : 'Un groupe rassemble des projets qui vont ensemble (par exemple une application et ses outils annexes). Les dossiers des projets ne bougent pas.',
    exemple: 'Par exemple : Catalogue',
    bouton: 'Créer',
  });
  if (!nom) return null;
  if (nomPris(nom, parent)) {
    notifier(`Un groupe « ${nom} » existe déjà à cet endroit.`, 'erreur');
    return null;
  }
  const groupe = { id: nouvelId(), nom, parent, projets, replie: false };
  // Le parent est déplié pour qu'on voie tout de suite le nouveau groupe.
  await enregistrer([...tous().map((g) => (g.id === parent ? { ...g, replie: false } : g)), groupe]);
  return groupe;
}

export async function renommer(id) {
  const groupe = trouver(id);
  const nom = await demanderTexte({ titre: 'Renommer le groupe', message: `Nouveau nom pour « ${groupe.nom} » :`, valeur: groupe.nom, bouton: 'Renommer' });
  if (!nom || nom === groupe.nom) return;
  if (nomPris(nom, groupe.parent, id)) {
    notifier(`Un groupe « ${nom} » existe déjà à cet endroit.`, 'erreur');
    return;
  }
  await modifierGroupe(id, () => ({ nom }));
}

export async function supprimer(id) {
  const groupe = trouver(id);
  const sousGroupes = enfants(id);
  const ok = await confirmer({
    titre: 'Supprimer le groupe',
    message: `Supprimer le groupe « ${groupe.nom} » ?\n`
      + 'Seul le groupe disparaît : ses projets restent dans la bibliothèque et rien n\'est effacé sur le disque.'
      + `${sousGroupes.length ? `\nSes ${sousGroupes.length} sous-groupe(s) remontent d'un niveau.` : ''}`,
    bouton: 'Supprimer le groupe',
    danger: true,
  });
  if (!ok) return;
  const { filtre } = etat.obtenir();
  if (filtre.type === 'groupe' && filtre.valeur === id) etat.modifier({ filtre: { type: 'tous' } });
  await enregistrer(tous()
    .filter((g) => g.id !== id)
    .map((g) => (g.parent === id ? { ...g, parent: groupe.parent } : g)));
}

// parent = null : premier niveau.
export async function deplacer(id, parent) {
  const groupe = trouver(id);
  if (!groupe || groupe.parent === parent) return;
  if (parent && descendants(id).has(parent)) {
    notifier('Impossible de ranger un groupe dans lui-même ou dans un de ses sous-groupes.', 'erreur');
    return;
  }
  if (nomPris(groupe.nom, parent, id)) {
    notifier(`Un groupe « ${groupe.nom} » existe déjà à cet endroit.`, 'erreur');
    return;
  }
  await enregistrer(tous().map((g) => {
    if (g.id === id) return { ...g, parent };
    if (g.id === parent) return { ...g, replie: false };
    return g;
  }));
}

export function basculerRepli(id) {
  return modifierGroupe(id, (g) => ({ replie: !g.replie }));
}

// depuis : groupe d'où le projet a été glissé (il en est alors retiré : c'est un déplacement).
export async function ajouterProjet(groupeId, projetId, depuis = null) {
  await enregistrer(tous().map((g) => {
    if (g.id === groupeId && !g.projets.includes(projetId)) return { ...g, projets: [...g.projets, projetId] };
    if (g.id === depuis && depuis !== groupeId) return { ...g, projets: g.projets.filter((p) => p !== projetId) };
    return g;
  }));
  const projet = etat.obtenir().projets.find((p) => p.id === projetId);
  notifier(`« ${projet?.fiche.nom || projetId} » ${depuis ? 'déplacé dans' : 'ajouté à'} « ${chemin(groupeId)} ».`, 'succes');
}

export function retirerProjet(groupeId, projetId) {
  return modifierGroupe(groupeId, (g) => ({ projets: g.projets.filter((p) => p !== projetId) }));
}

// Fenêtre « Groupes… » d'un projet : cocher les groupes où il apparaît, ou en créer un.
export async function choisirGroupesDuProjet(projet) {
  const resultat = await cocher({
    titre: `Groupes de « ${projet.fiche.nom} »`,
    message: 'Coche les groupes où ce projet doit apparaître. Un projet peut être dans plusieurs groupes ; son dossier ne bouge pas.',
    elements: arbre().map(({ groupe, niveau }) => ({
      valeur: groupe.id, libelle: groupe.nom, niveau, coche: groupe.projets.includes(projet.id), visuel: icone('dossier'),
    })),
    vide: 'Aucun groupe pour l\'instant : donne un nom ci-dessous pour en créer un.',
    nouveau: 'Créer aussi un nouveau groupe (facultatif)',
  });
  if (!resultat) return;
  const groupes = tous().map((g) => {
    const dedans = resultat.choisis.includes(g.id);
    if (dedans === g.projets.includes(projet.id)) return g;
    return { ...g, projets: dedans ? [...g.projets, projet.id] : g.projets.filter((p) => p !== projet.id) };
  });
  const nom = resultat.nouveau;
  if (nom) {
    // Nom déjà pris au premier niveau : le projet est mis dans ce groupe.
    const index = groupes.findIndex((g) => g.parent === null && g.nom.toLowerCase() === nom.toLowerCase());
    if (index >= 0) groupes[index] = { ...groupes[index], projets: [...new Set([...groupes[index].projets, projet.id])] };
    else groupes.push({ id: nouvelId(), nom, parent: null, projets: [projet.id], replie: false });
  }
  await enregistrer(groupes);
}

// Fenêtre « Choisir les projets… » d'un groupe.
export async function choisirProjetsDuGroupe(id) {
  const groupe = trouver(id);
  const projets = [...etat.obtenir().projets].sort((a, b) => a.fiche.nom.localeCompare(b.fiche.nom, 'fr', { sensitivity: 'base' }));
  const resultat = await cocher({
    titre: `Projets du groupe « ${groupe.nom} »`,
    message: 'Coche les projets à mettre dans ce groupe (ceux de ses sous-groupes se choisissent dans chaque sous-groupe).',
    elements: projets.map((p) => ({ valeur: p.id, libelle: p.fiche.nom, coche: groupe.projets.includes(p.id), visuel: iconeProjet(p, 18) })),
    filtrable: projets.length > 8,
    vide: 'Aucun projet dans la bibliothèque.',
  });
  if (!resultat) return;
  // Les projets introuvables en ce moment (dossier renommé…) sont gardés.
  const existants = new Set(projets.map((p) => p.id));
  await modifierGroupe(id, (g) => ({ projets: [...g.projets.filter((p) => !existants.has(p)), ...resultat.choisis] }));
}

// Menu du clic droit (ou du bouton ⋯) d'un groupe. position : où ouvrir le menu « Déplacer dans… ».
export function elementsMenu(groupe, position) {
  return [
    { libelle: 'Afficher ses projets', icone: 'grille', action: () => afficher(groupe.id) },
    { libelle: 'Choisir les projets…', icone: 'coche', action: () => choisirProjetsDuGroupe(groupe.id) },
    { libelle: 'Nouveau sous-groupe…', icone: 'nouveauDossier', action: () => creer(groupe.id) },
    'separateur',
    { libelle: 'Renommer…', icone: 'crayon', action: () => renommer(groupe.id) },
    { libelle: 'Déplacer dans…', icone: 'dossier', detail: '▸', action: () => ouvrirMenu(position, elementsMenuDeplacer(groupe)) },
    'separateur',
    { libelle: 'Supprimer le groupe', icone: 'effacer', action: () => supprimer(groupe.id) },
  ];
}

function elementsMenuDeplacer(groupe) {
  return [
    { libelle: 'Premier niveau (aucun groupe)', icone: 'grille', desactive: groupe.parent === null, action: () => deplacer(groupe.id, null) },
    'separateur',
    ...arbre(null, 0, groupe.id).map(({ groupe: g, niveau }) => ({
      libelle: `${' '.repeat(niveau)}${g.nom}`,
      icone: 'dossier',
      detail: g.id === groupe.parent ? 'actuel' : null,
      desactive: g.id === groupe.parent,
      action: () => deplacer(groupe.id, g.id),
    })),
  ];
}

// --- Glisser-déposer ------------------------------------------------------------------------
// Un projet (bibliothèque, épinglé ou dans un groupe) se glisse sur un groupe ; un groupe se
// glisse sur un autre groupe, ou sur le titre « Groupes » pour revenir au premier niveau.

const TYPE_GLISSE = 'application/x-toolkit-glisse';
let glisse = null; // { type: 'projet' | 'groupe', id, depuis? }

// Propriétés à passer à el() pour rendre un élément glissable.
export function glissable(objet) {
  return {
    draggable: 'true',
    onDragstart: (e) => {
      glisse = objet;
      e.dataTransfer.setData(TYPE_GLISSE, objet.id);
      e.dataTransfer.effectAllowed = 'copyMove';
    },
    onDragend: () => { glisse = null; },
  };
}

function accepte(e, groupeId) {
  if (!glisse || !e.dataTransfer.types.includes(TYPE_GLISSE)) return false;
  if (glisse.type === 'projet') return groupeId !== null && glisse.depuis !== groupeId;
  const groupe = trouver(glisse.id);
  return Boolean(groupe) && groupe.parent !== groupeId && !(groupeId && descendants(glisse.id).has(groupeId));
}

// Propriétés à passer à el() pour qu'un élément accepte un dépôt (groupeId null = premier niveau).
// Projet glissé depuis un groupe : déplacé ; avec Ctrl : ajouté sans le retirer de l'autre.
export function deposable(groupeId) {
  return {
    onDragover: (e) => {
      if (!accepte(e, groupeId)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = glisse.type === 'projet' && (!glisse.depuis || e.ctrlKey) ? 'copy' : 'move';
      e.currentTarget.classList.add('survol-depot');
    },
    onDragleave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.classList.remove('survol-depot');
    },
    onDrop: (e) => {
      e.currentTarget.classList.remove('survol-depot');
      if (!accepte(e, groupeId)) return;
      e.preventDefault();
      const objet = glisse;
      glisse = null;
      if (objet.type === 'projet') ajouterProjet(groupeId, objet.id, e.ctrlKey ? null : objet.depuis || null);
      else deplacer(objet.id, groupeId);
    },
  };
}
