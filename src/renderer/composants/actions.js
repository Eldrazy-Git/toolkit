// Actions de l'interface : chaque fonction met à jour l'état et/ou appelle le
// processus principal via window.toolkit, et affiche les erreurs proprement.
import * as etat from './etat.js';
import { notifier } from './notifications.js';
import { demanderTexte, confirmer } from './dialogue.js';

const api = window.toolkit;

// Exécute une fonction asynchrone et transforme une erreur en notification.
async function essayer(fonction) {
  try {
    return await fonction();
  } catch (erreur) {
    notifier(erreur.message, 'erreur');
    return undefined;
  }
}

// --- Données ---------------------------------------------------------------------

export async function chargerProjets() {
  await essayer(async () => {
    const projets = await api.projets.lister();
    const { selection } = etat.obtenir();
    const selectionExiste = selection === etat.ID_TOOLKIT || projets.some((p) => p.id === selection);
    etat.modifier({ projets, selection: selectionExiste ? selection : null });
  });
  etat.modifier({ chargement: false });
}

function remplacerProjet(projet) {
  if (!projet) return;
  const projets = etat.obtenir().projets.map((p) => (p.id === projet.id ? projet : p));
  etat.modifier({ projets });
}

export function listeCategories() {
  const compte = new Map();
  for (const p of etat.obtenir().projets) {
    compte.set(p.fiche.categorie, (compte.get(p.fiche.categorie) || 0) + 1);
  }
  return [...compte].sort((a, b) => a[0].localeCompare(b[0], 'fr', { sensitivity: 'base' }));
}

export function listeTags() {
  const compte = new Map();
  for (const p of etat.obtenir().projets) {
    for (const t of p.fiche.tags) compte.set(t, (compte.get(t) || 0) + 1);
  }
  return [...compte].sort((a, b) => a[0].localeCompare(b[0], 'fr', { sensitivity: 'base' }));
}

// --- Navigation --------------------------------------------------------------------

export function choisirFiltre(filtre) {
  etat.modifier({ filtre });
}

export function selectionner(id) {
  etat.modifier({ selection: id });
}

export async function changerVue(vue) {
  etat.modifier({ vue });
  await essayer(() => api.reglages.modifier({ interface: { vue } }));
}

// --- Modification des fiches ----------------------------------------------------------

export async function basculerFavori(projet) {
  const nouveau = await essayer(() => api.projets.modifier(projet.id, { favori: !projet.fiche.favori }));
  remplacerProjet(nouveau);
}

export async function changerCategorie(projet, categorie) {
  remplacerProjet(await essayer(() => api.projets.modifier(projet.id, { categorie })));
}

export async function nouvelleCategorie(projet) {
  const categorie = await demanderTexte({
    titre: 'Nouvelle catégorie',
    message: `Catégorie pour « ${projet.fiche.nom} » :`,
    exemple: 'Par exemple : Minecraft',
    bouton: 'Créer',
  });
  if (categorie) await changerCategorie(projet, categorie);
}

export async function ajouterTag(projet) {
  const tag = await demanderTexte({
    titre: 'Ajouter un tag',
    message: `Tag pour « ${projet.fiche.nom} » :`,
    exemple: 'Par exemple : conversion',
    suggestions: listeTags().map(([t]) => t).filter((t) => !projet.fiche.tags.includes(t)),
    bouton: 'Ajouter',
  });
  if (!tag || projet.fiche.tags.includes(tag)) return;
  remplacerProjet(await essayer(() => api.projets.modifier(projet.id, { tags: [...projet.fiche.tags, tag] })));
}

export async function retirerTag(projet, tag) {
  const tags = projet.fiche.tags.filter((t) => t !== tag);
  remplacerProjet(await essayer(() => api.projets.modifier(projet.id, { tags })));
}

export async function renommerCategorie(categorie) {
  const nouvelle = await demanderTexte({
    titre: 'Renommer la catégorie',
    message: `Nouveau nom pour « ${categorie} ».\nTous les projets de cette catégorie seront mis à jour.\nLaisse vide pour les mettre dans « Sans catégorie ».`,
    valeur: categorie,
    bouton: 'Renommer',
  });
  if (nouvelle === null || nouvelle === categorie) return;
  const nombre = await essayer(() => api.projets.renommerCategorie(categorie, nouvelle));
  if (nombre === undefined) return;
  const { filtre } = etat.obtenir();
  if (filtre.type === 'categorie' && filtre.valeur === categorie) {
    choisirFiltre({ type: 'categorie', valeur: nouvelle || 'Sans catégorie' });
  }
  notifier(`${nombre} projet(s) mis à jour.`, 'succes');
  await chargerProjets();
}

export async function renommerTag(tag) {
  const nouveau = await demanderTexte({
    titre: 'Renommer le tag',
    message: `Nouveau nom pour le tag « ${tag} ».\nLaisse vide pour retirer ce tag de tous les projets.`,
    valeur: tag,
    bouton: 'Valider',
  });
  if (nouveau === null || nouveau === tag) return;
  if (nouveau === '') {
    const ok = await confirmer({
      titre: 'Retirer le tag',
      message: `Retirer le tag « ${tag} » de tous les projets ?\nLes projets eux-mêmes ne sont pas touchés.`,
      bouton: 'Retirer',
      danger: true,
    });
    if (!ok) return;
  }
  const nombre = await essayer(() => api.projets.renommerTag(tag, nouveau || null));
  if (nombre === undefined) return;
  const { filtre } = etat.obtenir();
  if (filtre.type === 'tag' && filtre.valeur === tag) {
    choisirFiltre(nouveau ? { type: 'tag', valeur: nouveau } : { type: 'tous' });
  }
  notifier(`${nombre} projet(s) mis à jour.`, 'succes');
  await chargerProjets();
}

// --- Application ------------------------------------------------------------------------

export async function redemarrerToolkit() {
  const ok = await confirmer({
    titre: 'Redémarrer Toolkit',
    message: 'Toolkit va se fermer puis se rouvrir pour appliquer les modifications.',
    bouton: 'Redémarrer',
  });
  if (ok) await essayer(() => api.application.redemarrer());
}
