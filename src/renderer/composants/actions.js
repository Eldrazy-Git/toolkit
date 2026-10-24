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
  etat.modifier({ filtre, ongletActif: 'bibliotheque' });
}

export function selectionner(id) {
  etat.modifier({ selection: id, ...(id ? { ongletActif: 'bibliotheque' } : {}) });
}

// --- Outils HTML et onglets ----------------------------------------------------------

// Un projet s'ouvre comme outil si son point d'entrée est une page HTML.
export function estOuvrableCommeOutil(projet) {
  return !projet.erreur && /\.html?$/i.test(projet.fiche.point_entree || '');
}

export async function ouvrirOutil(projetId, outilLie = null) {
  const { onglets } = etat.obtenir();
  const existant = onglets.find((o) => o.projetId === projetId && o.outilLie === outilLie);
  if (existant) {
    etat.modifier({ ongletActif: existant.id });
    return;
  }
  const onglet = await essayer(() => api.outils.preparer(projetId, outilLie));
  if (!onglet) return;
  etat.modifier({ onglets: [...etat.obtenir().onglets, onglet], ongletActif: onglet.id });
}

export function activerOnglet(id) {
  etat.modifier({ ongletActif: id });
}

export function fermerOnglet(id) {
  if (id === 'reglages') {
    const { ongletActif } = etat.obtenir();
    etat.modifier({ reglagesOuverts: false, ongletActif: ongletActif === 'reglages' ? 'bibliotheque' : ongletActif });
    return;
  }
  const { onglets, ongletActif } = etat.obtenir();
  const position = onglets.findIndex((o) => o.id === id);
  if (position === -1) return;
  const restants = onglets.filter((o) => o.id !== id);
  // L'onglet actif est fermé : on active son voisin, sinon la bibliothèque.
  const voisin = restants[Math.min(position, restants.length - 1)];
  etat.modifier({
    onglets: restants,
    ongletActif: ongletActif === id ? (voisin?.id || 'bibliotheque') : ongletActif,
  });
}

export function fermerOngletActif() {
  const { ongletActif } = etat.obtenir();
  if (ongletActif !== 'bibliotheque') fermerOnglet(ongletActif);
}

export function ongletSuivant(sens = 1) {
  const { onglets, ongletActif, reglagesOuverts } = etat.obtenir();
  const ids = ['bibliotheque', ...(reglagesOuverts ? ['reglages'] : []), ...onglets.map((o) => o.id)];
  const position = ids.indexOf(ongletActif);
  etat.modifier({ ongletActif: ids[(position + sens + ids.length) % ids.length] });
}

export async function exporterDonnees(onglet, idContenu) {
  const fichier = await essayer(() => api.outils.exporter(idContenu, onglet.nom));
  if (fichier) notifier(`Données exportées dans « ${fichier} ».`, 'succes');
}

export async function importerDonnees(onglet, idContenu) {
  const ok = await confirmer({
    titre: 'Importer des données',
    message: `Les données actuelles de « ${onglet.nom} » vont être REMPLACÉES par celles du fichier choisi.\n\nConseil : exporte d'abord les données actuelles pour pouvoir revenir en arrière.`,
    bouton: 'Choisir le fichier…',
    danger: true,
  });
  if (!ok) return;
  const resultat = await essayer(() => api.outils.importer(idContenu, onglet.nom));
  if (resultat) {
    notifier(`Données importées depuis « ${resultat.fichier} » (${resultat.cles} entrée(s), ${resultat.bases} base(s) de données).`, 'succes');
  }
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

// --- Ouvrir avec… et éditeurs -----------------------------------------------------------

export async function chargerEditeurs(fonction = () => api.editeurs.etat()) {
  const editeurs = await essayer(fonction);
  if (editeurs) etat.modifier({ editeurs });
}

// Même règle que editeurs.js > editeurParDefaut (processus principal).
export function editeurParDefaut(fiche) {
  if (fiche.ouvrir_avec) return fiche.ouvrir_avec;
  return fiche.type === 'android' ? 'android-studio' : 'vscode';
}

export function nomEditeur(id) {
  return etat.obtenir().editeurs.find((e) => e.id === id)?.nom || id;
}

// editeurId absent : éditeur par défaut du projet.
export async function ouvrirAvec(projet, editeurId) {
  const nom = await essayer(() => api.editeurs.ouvrirProjet(projet.id, editeurId));
  if (nom) notifier(`Ouverture de « ${projet.fiche.nom} » dans ${nom}…`);
}

async function ouvrirToolkitAvec(editeurId) {
  const nom = await essayer(() => api.editeurs.ouvrirToolkit(editeurId));
  if (nom) notifier(`Ouverture du code de Toolkit dans ${nom}…`);
}

// Construit les éléments du menu « Ouvrir avec… ».
function elementsMenuEditeurs(editeurDefaut, ouvrir) {
  return [
    ...etat.obtenir().editeurs.map((e) => ({
      libelle: e.nom,
      icone: e.id === 'explorateur' ? 'dossier' : 'ouvrirAvec',
      detail: e.id === editeurDefaut ? 'par défaut' : (e.disponible ? null : 'introuvable'),
      desactive: !e.disponible,
      infobulle: e.disponible ? e.chemin : 'Introuvable sur ce PC : indique son emplacement dans les Réglages.',
      action: () => ouvrir(e.id),
    })),
    'separateur',
    { libelle: 'Réglages des éditeurs…', icone: 'reglages', action: ouvrirReglages },
  ];
}

export function elementsMenuOuvrirAvec(projet) {
  return elementsMenuEditeurs(editeurParDefaut(projet.fiche), (id) => ouvrirAvec(projet, id));
}

export function elementsMenuOuvrirToolkit() {
  return elementsMenuEditeurs('vscode', ouvrirToolkitAvec);
}

// editeur = '' pour revenir au choix automatique selon le type.
export async function changerEditeurParDefaut(projet, editeur) {
  remplacerProjet(await essayer(() => api.projets.modifier(projet.id, { ouvrir_avec: editeur || null })));
}

export function ouvrirReglages() {
  etat.modifier({ reglagesOuverts: true, ongletActif: 'reglages' });
  chargerEditeurs();
}

export const redetecterEditeurs = () => chargerEditeurs(() => api.editeurs.redetecter());
export const definirCheminEditeur = (id, chemin) => chargerEditeurs(() => api.editeurs.definir(id, chemin));
export const parcourirEditeur = (id) => chargerEditeurs(() => api.editeurs.parcourir(id));

// --- Application ------------------------------------------------------------------------

export async function redemarrerToolkit() {
  const ok = await confirmer({
    titre: 'Redémarrer Toolkit',
    message: 'Toolkit va se fermer puis se rouvrir pour appliquer les modifications.',
    bouton: 'Redémarrer',
  });
  if (ok) await essayer(() => api.application.redemarrer());
}
