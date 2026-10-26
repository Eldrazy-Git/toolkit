// Actions de l'interface : chaque fonction met à jour l'état et/ou appelle le
// processus principal via window.toolkit, et affiche les erreurs proprement.
import * as etat from './etat.js';
import { notifier } from './notifications.js';
import { demanderTexte, confirmer, choisir, formulaire } from './dialogue.js';
import * as actionsGit from './actions-git.js';
import { ouvrirMenu } from './menu.js';
import * as groupes from './groupes.js';
import * as recents from './recents.js';

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
  // L'état Git a pu changer depuis la dernière fois (commits de Claude…) : on le relit.
  if (id === etat.ID_TOOLKIT) actionsGit.rafraichir({ type: 'toolkit' });
  else if (id) actionsGit.rafraichir({ type: 'projet', id });
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
  etat.modifier({ onglets: [...etat.obtenir().onglets, { ...onglet, genre: 'outil' }], ongletActif: onglet.id });
  recents.noter({ type: 'outil', projetId, outilLie, nom: onglet.nom });
}

export function activerOnglet(id) {
  // Un onglet signalé (Claude a fini) cesse de l'être quand on le regarde.
  const { onglets } = etat.obtenir();
  if (onglets.some((o) => o.id === id && o.attention)) {
    etat.modifier({ ongletActif: id, onglets: onglets.map((o) => (o.id === id ? { ...o, attention: false } : o)) });
    return;
  }
  etat.modifier({ ongletActif: id });
}

export async function fermerOnglet(id) {
  if (id === 'import') {
    const assistant = await import('./import.js');
    if (assistant.estOccupe()) {
      notifier('Un import est en cours : attends qu\'il soit terminé.', 'erreur');
      return;
    }
    assistant.abandonner();
    const { ongletActif } = etat.obtenir();
    etat.modifier({ importOuvert: false, ongletActif: ongletActif === 'import' ? 'bibliotheque' : ongletActif });
    return;
  }
  if (id === 'git') {
    const { ongletActif } = etat.obtenir();
    etat.modifier({ gitOuvert: false, ongletActif: ongletActif === 'git' ? 'bibliotheque' : ongletActif });
    return;
  }
  if (id === 'reglages') {
    const { ongletActif } = etat.obtenir();
    etat.modifier({ reglagesOuverts: false, ongletActif: ongletActif === 'reglages' ? 'bibliotheque' : ongletActif });
    return;
  }
  const aFermer = etat.obtenir().onglets.find((o) => o.id === id);
  if (aFermer?.genre === 'code' && aFermer.nonEnregistre) {
    const ok = await confirmer({
      titre: 'Fichiers non enregistrés',
      message: `Des fichiers de « ${aFermer.nomCible} » ont des modifications non enregistrées. Fermer quand même ?`,
      bouton: 'Fermer sans enregistrer',
      danger: true,
    });
    if (!ok) return;
  }
  if (aFermer?.genre === 'note' && aFermer.nonEnregistre) {
    const ok = await confirmer({
      titre: 'Note non enregistrée',
      message: `Tes modifications de « ${aFermer.nom} » ne sont pas enregistrées. Fermer quand même ?`,
      bouton: 'Fermer sans enregistrer',
      danger: true,
    });
    if (!ok) return;
  }
  if ((aFermer?.genre === 'terminal' || aFermer?.genre === 'console') && aFermer.enCours) {
    const ok = await confirmer({
      titre: aFermer.genre === 'console' ? 'Arrêter le script' : 'Fermer le terminal',
      message: aFermer.genre === 'console'
        ? 'Le script est encore en cours. Fermer cet onglet l\'arrête.'
        : aFermer.mode === 'claude'
        ? 'Claude est encore en cours dans cet onglet. Le fermer l\'arrête (ce qu\'il a déjà modifié est conservé).'
        : 'Un programme tourne encore dans ce terminal. Le fermer l\'arrête.',
      bouton: 'Fermer',
      danger: true,
    });
    if (!ok) return;
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
  const { onglets, ongletActif, reglagesOuverts, importOuvert, gitOuvert } = etat.obtenir();
  const ids = ['bibliotheque', ...(reglagesOuverts ? ['reglages'] : []), ...(gitOuvert ? ['git'] : []),
    ...(importOuvert ? ['import'] : []), ...onglets.map((o) => o.id)];
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

export async function changerTri(tri) {
  etat.modifier({ tri });
  await essayer(() => api.reglages.modifier({ interface: { tri } }));
}

// --- Projets épinglés (barre latérale) -------------------------------------------------------
// Rangés dans les réglages (donnees/), dans l'ordre d'épinglage : projet.json n'est pas touché.

export function estEpingle(id) {
  return etat.obtenir().epingles.includes(id);
}

export async function basculerEpingle(projet) {
  const { epingles } = etat.obtenir();
  const nouveaux = epingles.includes(projet.id) ? epingles.filter((id) => id !== projet.id) : [...epingles, projet.id];
  etat.modifier({ epingles: nouveaux });
  await essayer(() => api.reglages.modifier({ interface: { epingles: nouveaux } }));
}

// --- Icône d'un projet --------------------------------------------------------------------------

export async function changerIcone(projet) {
  const nouveau = await essayer(() => api.projets.choisirIcone(projet.id));
  if (!nouveau) return;
  remplacerProjet(nouveau);
  notifier('Icône du projet changée.', 'succes');
}

export async function iconeAutomatique(projet) {
  remplacerProjet(await essayer(() => api.projets.modifier(projet.id, { icone: null })));
}

export function elementsMenuIcone(projet) {
  return [
    { libelle: 'Choisir une image…', icone: 'image', action: () => changerIcone(projet) },
    { libelle: 'Icône automatique (initiales)', icone: 'redemarrer', desactive: !projet.fiche.icone, action: () => iconeAutomatique(projet) },
  ];
}

// Menu du clic droit sur un projet. position : { x, y } du clic, où s'ouvre le second
// menu « Ouvrir avec… » (le menu n'a pas de sous-menus).
export function elementsMenuProjet(projet, position) {
  const bloque = Boolean(projet.erreur);
  return [
    { libelle: 'Ouvrir', icone: 'lecture', desactive: bloque, action: () => (estOuvrableCommeOutil(projet) ? ouvrirOutil(projet.id) : ouvrirAvec(projet)) },
    { libelle: 'Ouvrir avec…', icone: 'ouvrirAvec', detail: '▸', desactive: bloque, action: () => ouvrirMenu(position, elementsMenuOuvrirAvec(projet)) },
    { libelle: 'Explorer le code', icone: 'code', action: () => ouvrirCode({ type: 'projet', id: projet.id }, projet.fiche.nom) },
    { libelle: 'Historique des versions…', icone: 'historique', action: () => import('./historique.js').then((h) => h.afficherHistorique({ type: 'projet', id: projet.id }, projet.fiche.nom)) },
    { libelle: 'Modifier avec Claude', icone: 'claude', desactive: bloque, action: () => modifierAvecClaude(projet) },
    'separateur',
    { libelle: projet.fiche.favori ? 'Retirer des favoris' : 'Ajouter aux favoris', icone: 'etoile', desactive: bloque, action: () => basculerFavori(projet) },
    { libelle: estEpingle(projet.id) ? 'Désépingler de la barre latérale' : 'Épingler dans la barre latérale', icone: 'epingle', action: () => basculerEpingle(projet) },
    { libelle: 'Groupes…', icone: 'dossier', action: () => groupes.choisirGroupesDuProjet(projet) },
    ...elementsRetirerDuGroupe(projet),
    'separateur',
    ...elementsMenuIcone(projet).map((e) => ({ ...e, desactive: e.desactive || bloque })),
    'separateur',
    { libelle: 'Supprimer le projet…', icone: 'effacer', action: () => supprimerProjet(projet) },
  ];
}

// Quand la bibliothèque affiche un groupe qui contient directement ce projet.
function elementsRetirerDuGroupe(projet) {
  const { filtre } = etat.obtenir();
  const groupe = filtre.type === 'groupe' ? groupes.trouver(filtre.valeur) : null;
  if (!groupe?.projets.includes(projet.id)) return [];
  return [{ libelle: `Retirer du groupe « ${groupe.nom} »`, icone: 'croix', action: () => groupes.retirerProjet(groupe.id, projet.id) }];
}

// Onglet « Code » (explorateur de fichiers + éditeur) d'un projet ou de Toolkit ; fichier :
// chemin relatif à ouvrir tout de suite (facultatif).
// fichiers : plusieurs fichiers à ouvrir (fichier = celui à afficher), ex. à la restauration.
export function ouvrirCode(cible, nom, fichier = null, fichiers = null) {
  const cle = cible.type === 'projet' ? `p-${cible.id}` : 'toolkit';
  const id = `code:${cle}`;
  const { onglets } = etat.obtenir();
  const demande = fichiers?.length ? { chemins: fichiers, actif: fichier, n: Date.now() } : fichier ? { chemin: fichier, n: Date.now() } : null;
  if (onglets.some((o) => o.id === id)) {
    etat.modifier({ onglets: onglets.map((o) => (o.id === id && demande ? { ...o, demande } : o)), ongletActif: id });
    return;
  }
  etat.modifier({
    onglets: [...onglets, { id, genre: 'code', nom: `${nom} (code)`, nomCible: nom, cible, cle, projetId: cible.id || null, demande }],
    ongletActif: id,
  });
}

// Double-clic : ouvre l'outil HTML dans un onglet, sinon le projet dans son éditeur par défaut.
export function ouvrirProjet(projet) {
  if (projet.erreur) return;
  if (estOuvrableCommeOutil(projet)) ouvrirOutil(projet.id);
  else ouvrirAvec(projet);
}

export async function modifierDescription(projet) {
  const valeurs = await formulaire({
    titre: 'Description du projet',
    message: 'Ce que fait le projet, en une ou deux phrases. Elle apparaît dans Toolkit et Claude s\'en sert pour comprendre ce projet et ses liens avec les autres.',
    champs: [{ id: 'description', libelle: 'Description', type: 'zone', valeur: projet.fiche.description }],
    bouton: 'Enregistrer',
  });
  if (!valeurs) return;
  remplacerProjet(await essayer(() => api.projets.modifier(projet.id, { description: valeurs.description })));
}

// --- Liens entre projets (contexte de Claude) -------------------------------------------------
// Rangés dans projet.json du projet qui déclare le lien (« liens ») ; un lien vaut dans les
// deux sens. Le processus principal met ensuite à jour les CLAUDE.md concernés.

export async function lierProjet(projet) {
  const autres = etat.obtenir().projets.filter((p) => p.id !== projet.id && !p.erreur)
    .sort((a, b) => a.fiche.nom.localeCompare(b.fiche.nom, 'fr', { sensitivity: 'base' }));
  if (!autres.length) {
    notifier('Il n\'y a pas d\'autre projet à lier.', 'erreur');
    return;
  }
  const valeurs = await formulaire({
    titre: `Lier « ${projet.fiche.nom} » à un autre projet`,
    message: 'Claude sera prévenu de ce lien dans les deux projets (leurs CLAUDE.md), ainsi que des projets liés indirectement. Il pourra aussi lire l\'autre projet quand tu le lances depuis Toolkit.',
    champs: [
      { id: 'projet', libelle: 'Projet lié', type: 'choix', options: autres.map((p) => ({ valeur: p.id, libelle: p.fiche.nom })) },
      {
        id: 'description',
        libelle: 'En quoi sont-ils liés ?',
        type: 'zone',
        obligatoire: true,
        exemple: 'Par exemple : ce projet met à jour les icônes et l\'index du catalogue de l\'application (fichiers app/src/main/assets/catalogue/).',
        aide: 'Une ou deux phrases : ce que l\'un fournit ou utilise de l\'autre (fichiers, formats, données…). Plus c\'est précis, mieux Claude fera les mises à jour.',
      },
    ],
    bouton: 'Lier',
  });
  if (!valeurs) return;
  const liens = [...projet.fiche.liens.filter((l) => l.projet !== valeurs.projet), { projet: valeurs.projet, description: valeurs.description }];
  const nouveau = await essayer(() => api.projets.modifier(projet.id, { liens }));
  if (!nouveau) return;
  remplacerProjet(nouveau);
  notifier('Lien enregistré : les CLAUDE.md des projets concernés sont mis à jour.', 'succes');
}

// Retire le lien déclaré par sourceId vers cibleId.
export async function retirerLien(sourceId, cibleId) {
  const source = etat.obtenir().projets.find((p) => p.id === sourceId);
  if (!source) return;
  const autre = etat.obtenir().projets.find((p) => p.id === cibleId);
  const ok = await confirmer({
    titre: 'Retirer le lien',
    message: `Retirer le lien entre « ${source.fiche.nom} » et « ${autre?.fiche.nom || cibleId} » ?\nLes projets eux-mêmes ne sont pas touchés ; leurs CLAUDE.md seront mis à jour.`,
    bouton: 'Retirer le lien',
  });
  if (!ok) return;
  remplacerProjet(await essayer(() => api.projets.modifier(sourceId, { liens: source.fiche.liens.filter((l) => l.projet !== cibleId) })));
}

// Liens d'un projet vus des deux côtés : [{ autre, description, declarePar }] + indirects.
export function liensDuProjet(projet) {
  const { projets } = etat.obtenir();
  const parId = new Map(projets.map((p) => [p.id, p]));
  const voisins = (id) => [
    ...(parId.get(id)?.fiche.liens || []).filter((l) => parId.has(l.projet)).map((l) => ({ autre: l.projet, description: l.description, declarePar: id })),
    ...projets.flatMap((p) => p.fiche.liens.filter((l) => l.projet === id).map((l) => ({ autre: p.id, description: l.description, declarePar: p.id }))),
  ].filter((v) => v.autre !== id);
  const directs = voisins(projet.id);
  // Liens indirects : parcours en largeur à partir des voisins directs.
  const vus = new Set([projet.id, ...directs.map((d) => d.autre)]);
  const indirects = [];
  let file = directs.map((d) => ({ id: d.autre, via: [] }));
  while (file.length) {
    const suivants = [];
    for (const { id, via } of file) {
      for (const v of voisins(id)) {
        if (vus.has(v.autre)) continue;
        vus.add(v.autre);
        const chemin = [...via, id];
        indirects.push({ id: v.autre, via: chemin });
        suivants.push({ id: v.autre, via: chemin });
      }
    }
    file = suivants;
  }
  return { directs, indirects };
}

// --- Suppression d'un projet -----------------------------------------------------------------
// Le dossier part à la Corbeille de Windows (récupérable). Confirmation explicite : il faut
// retaper le nom du projet. Refusé si un script, un terminal ou Claude tourne dans ce projet.

const ongletsDuProjet = (projet) => etat.obtenir().onglets.filter((o) => o.projetId === projet.id
  || o.cible?.type === 'projet' && o.cible.id === projet.id
  // Note : chemin relatif à la racine de Toolkit, qui commence par le dossier du projet.
  || (o.genre === 'note' && o.chemin?.startsWith(`${projet.dossier}/`)));

export async function supprimerProjet(projet) {
  const onglets = ongletsDuProjet(projet);
  if (onglets.some((o) => o.enCours)) {
    notifier('Un script, un terminal ou Claude tourne encore dans ce projet : arrête-le et ferme son onglet d\'abord.', 'erreur');
    return;
  }
  if (onglets.some((o) => o.nonEnregistre)) {
    notifier('Des fichiers de ce projet ne sont pas enregistrés : enregistre-les ou ferme leurs onglets d\'abord.', 'erreur');
    return;
  }
  // Ce qui serait perdu au-delà de la Corbeille : rappel de l'état Git.
  const cible = { type: 'projet', id: projet.id };
  await actionsGit.rafraichir(cible);
  const g = actionsGit.etatDe(cible);
  const avertissements = [];
  if (!g?.estDepot) avertissements.push('• Ce projet n\'a pas d\'historique Git : il n\'existe nulle part ailleurs.');
  else if (!g.remote) avertissements.push('• Ce projet n\'est pas sur GitHub : il n\'existe nulle part ailleurs.');
  else {
    if (g.nbModifications || g.enAvance) avertissements.push('• Des changements n\'ont pas été envoyés sur GitHub : ils ne sont que sur ce PC.');
    avertissements.push('• Le dépôt GitHub, lui, n\'est PAS supprimé.');
  }
  const saisie = await demanderTexte({
    titre: 'Supprimer le projet',
    message: `Le dossier « ${projet.dossier} » va être envoyé à la Corbeille de Windows (tu pourras l'en restaurer tant qu'elle n'est pas vidée).\n`
      + `${avertissements.join('\n')}\n\nPour confirmer, tape le nom du projet : ${projet.fiche.nom}`,
    bouton: 'Supprimer le projet',
    danger: true,
  });
  if (saisie === null) return;
  if (saisie.trim() !== projet.fiche.nom.trim()) {
    notifier('Le nom tapé ne correspond pas : rien n\'a été supprimé.', 'erreur');
    return;
  }
  // Fermer ses onglets (l'onglet « Code » libère le dossier : surveillance, aide Python).
  const avaitCode = onglets.some((o) => o.genre === 'code');
  const ids = new Set(onglets.map((o) => o.id));
  const { ongletActif } = etat.obtenir();
  etat.modifier({ onglets: etat.obtenir().onglets.filter((o) => !ids.has(o.id)), ongletActif: ids.has(ongletActif) ? 'bibliotheque' : ongletActif });
  if (avaitCode) await new Promise((r) => setTimeout(r, 1500));
  const resultat = await essayer(async () => {
    await api.projets.supprimer(projet.id);
    return true;
  });
  if (!resultat) return;
  // Nettoyage de ses traces dans la barre latérale.
  const { epingles, groupes: listeGroupes, selection } = etat.obtenir();
  if (epingles.includes(projet.id)) {
    const nouveaux = epingles.filter((id) => id !== projet.id);
    etat.modifier({ epingles: nouveaux });
    essayer(() => api.reglages.modifier({ interface: { epingles: nouveaux } }));
  }
  if (listeGroupes.some((gr) => gr.projets.includes(projet.id))) {
    const nouveaux = listeGroupes.map((gr) => ({ ...gr, projets: gr.projets.filter((id) => id !== projet.id) }));
    etat.modifier({ groupes: nouveaux });
    essayer(() => api.reglages.modifier({ interface: { groupes: nouveaux } }));
  }
  etat.obtenir().recents.filter((r) => r.projetId === projet.id || r.cible?.id === projet.id).forEach(recents.retirer);
  if (selection === projet.id) selectionner(null);
  await chargerProjets();
  notifier(`« ${projet.fiche.nom} » est dans la Corbeille de Windows.`, 'succes');
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
  if (id === 'toolkit') return 'l\'éditeur de Toolkit';
  return etat.obtenir().editeurs.find((e) => e.id === id)?.nom || id;
}

// editeurId absent : éditeur par défaut du projet.
export async function ouvrirAvec(projet, editeurId) {
  if ((editeurId || editeurParDefaut(projet.fiche)) === 'toolkit') {
    ouvrirCode({ type: 'projet', id: projet.id }, projet.fiche.nom);
    return;
  }
  const nom = await essayer(() => api.editeurs.ouvrirProjet(projet.id, editeurId));
  if (!nom) return;
  notifier(`Ouverture de « ${projet.fiche.nom} » dans ${nom}…`);
  recents.noter({ type: 'editeur', projetId: projet.id, editeurId: editeurId || null, nom: projet.fiche.nom, detail: nom });
}

async function ouvrirToolkitAvec(editeurId) {
  const nom = await essayer(() => api.editeurs.ouvrirToolkit(editeurId));
  if (nom) notifier(`Ouverture du code de Toolkit dans ${nom}…`);
}

// Construit les éléments du menu « Ouvrir avec… ».
// cible / nomCible : dossier pour l'entrée « Terminal PowerShell ici ».
function elementsMenuEditeurs(editeurDefaut, ouvrir, cible, nomCible) {
  return [
    { libelle: 'Éditeur de code de Toolkit', icone: 'code', detail: editeurDefaut === 'toolkit' ? 'par défaut' : 'dans Toolkit', action: () => ouvrirCode(cible, nomCible) },
    ...etat.obtenir().editeurs.map((e) => ({
      libelle: e.nom,
      icone: e.id === 'explorateur' ? 'dossier' : 'ouvrirAvec',
      detail: e.id === editeurDefaut ? 'par défaut' : (e.disponible ? null : 'introuvable'),
      desactive: !e.disponible,
      infobulle: e.disponible ? e.chemin : 'Introuvable sur ce PC : indique son emplacement dans les Réglages.',
      action: () => ouvrir(e.id),
    })),
    { libelle: 'Terminal PowerShell ici', icone: 'terminal', detail: 'dans Toolkit', action: () => ouvrirPowerShell(cible, nomCible) },
    'separateur',
    { libelle: 'Réglages des éditeurs…', icone: 'reglages', action: ouvrirReglages },
  ];
}

export function elementsMenuOuvrirAvec(projet) {
  return elementsMenuEditeurs(editeurParDefaut(projet.fiche), (id) => ouvrirAvec(projet, id),
    { type: 'projet', id: projet.id }, projet.fiche.nom);
}

export function elementsMenuOuvrirToolkit() {
  return elementsMenuEditeurs('vscode', ouvrirToolkitAvec, { type: 'toolkit' }, 'Toolkit');
}

// editeur = '' pour revenir au choix automatique selon le type.
export async function changerEditeurParDefaut(projet, editeur) {
  remplacerProjet(await essayer(() => api.projets.modifier(projet.id, { ouvrir_avec: editeur || null })));
}

export function ouvrirGit() {
  etat.modifier({ gitOuvert: true, ongletActif: 'git' });
  actionsGit.chargerTout();
}

export function ouvrirImport() {
  etat.modifier({ importOuvert: true, ongletActif: 'import' });
}

// onglet : 'general' | 'claude' | 'editeur' | 'interface' | 'raccourcis' | 'mises-a-jour'
export function ouvrirReglages(onglet, { verifier = false } = {}) {
  etat.modifier({ reglagesOuverts: true, ongletActif: 'reglages', ...(typeof onglet === 'string' ? { ongletReglages: onglet } : {}) });
  if (verifier) import('./mises-a-jour.js').then((m) => m.verifier());
  chargerEditeurs();
  chargerProgrammes();
  essayer(async () => etat.modifier({ demarrageWindows: await api.reglages.demarrageWindows() }));
}

export async function chargerProgrammes() {
  const programmes = await essayer(() => api.programmes.etat());
  if (programmes) etat.modifier({ programmes });
}

export const redetecterEditeurs = () => chargerEditeurs(() => api.editeurs.redetecter());
export const definirCheminEditeur = (id, chemin) => chargerEditeurs(() => api.editeurs.definir(id, chemin));
export const parcourirEditeur = (id) => chargerEditeurs(() => api.editeurs.parcourir(id));

// --- Notes et liens ------------------------------------------------------------------------

// Affiche un projet dans la bibliothèque (depuis la recherche ou un lien [[…]]).
export function allerAuProjet(id) {
  etat.modifier({ filtre: { type: 'tous' } });
  selectionner(id);
}

export function ouvrirNote(chemin, { modifier = false } = {}) {
  const id = `note:${chemin}`;
  const { onglets } = etat.obtenir();
  if (onglets.some((o) => o.id === id)) {
    etat.modifier({ ongletActif: id });
    return;
  }
  const onglet = {
    id,
    genre: 'note',
    chemin,
    modeEdition: modifier,
    nom: chemin.split('/').pop().replace(/\.md$/i, ''),
    nonEnregistre: false,
  };
  etat.modifier({ onglets: [...onglets, onglet], ongletActif: id });
  recents.noter({ type: 'note', chemin, nom: onglet.nom });
}

// Appelé par le panneau d'une note : { nonEnregistre?, titre? }
export function marquerNote(id, { nonEnregistre, titre }) {
  const { onglets } = etat.obtenir();
  const onglet = onglets.find((o) => o.id === id);
  if (!onglet) return;
  const changements = {};
  if (nonEnregistre !== undefined && onglet.nonEnregistre !== nonEnregistre) changements.nonEnregistre = nonEnregistre;
  if (titre && onglet.nom !== titre) changements.nom = titre;
  if (Object.keys(changements).length === 0) return;
  etat.modifier({ onglets: onglets.map((o) => (o.id === id ? { ...o, ...changements } : o)) });
}

// projetId null = note de Toolkit (rangée dans app/docs/).
export async function creerNote(projetId) {
  const nom = await demanderTexte({
    titre: 'Nouvelle note',
    message: projetId ? 'Nom de la note (elle sera rangée dans le dossier « notes » du projet) :' : 'Nom de la note (elle sera rangée dans app/docs) :',
    exemple: 'Par exemple : Idées',
    bouton: 'Créer',
  });
  if (!nom) return;
  const chemin = await essayer(() => api.notes.creer(projetId, nom));
  if (chemin) ouvrirNote(chemin, { modifier: true });
}

// Clic sur un lien d'une note rendue (data-projet, data-note, data-externe).
export function suivreLien(evenement) {
  const lien = evenement.target.closest('a');
  if (!lien) return;
  evenement.preventDefault();
  const { projet, note, externe } = lien.dataset;
  if (projet) allerAuProjet(projet);
  else if (note) ouvrirNote(note);
  else if (externe) essayer(() => api.liens.ouvrirExterne(externe));
}

// --- Actions de projet.json (scripts) -----------------------------------------------------

// Derniers paramètres saisis pour une action, proposés au lancement suivant.
function cleParametres(projet, action) {
  return `toolkit:action:${projet.id}:${action.nom}`;
}

function lireParametresPrecedents(cle) {
  try {
    return JSON.parse(localStorage.getItem(cle)) || {};
  } catch {
    return {};
  }
}

// Lance l'action n° index du projet : formulaire des paramètres s'il y en a, puis console.
export async function lancerAction(projet, index) {
  const action = projet.fiche.actions[index];
  if (!action) return;

  let valeurs = {};
  if (action.parametres.length > 0) {
    const cle = cleParametres(projet, action);
    const precedentes = lireParametresPrecedents(cle);
    valeurs = await formulaire({
      titre: action.nom,
      message: action.description || null,
      champs: action.parametres.map((p) => ({
        id: p.id,
        libelle: p.libelle,
        type: p.type,
        obligatoire: p.obligatoire,
        valeur: precedentes[p.id] ?? p.defaut ?? (p.type === 'choix' ? p.options[0] : ''),
        options: p.options.map((o) => ({ valeur: o, libelle: o })),
        extensions: p.extensions,
      })),
      bouton: 'Lancer',
    });
    if (!valeurs) return;
    try {
      localStorage.setItem(cle, JSON.stringify(valeurs));
    } catch {
      // Mémorisation impossible : sans gravité.
    }
  }

  // Une console existe déjà pour cette action : on la réutilise.
  const { onglets } = etat.obtenir();
  const existant = onglets.find((o) => o.genre === 'console' && o.projetId === projet.id && o.indexAction === index);
  if (existant) {
    if (existant.enCours) {
      etat.modifier({ ongletActif: existant.id });
      notifier('Cette action est déjà en cours.');
      return;
    }
    etat.modifier({
      onglets: onglets.map((o) => (o.id === existant.id ? { ...o, valeurs, lancement: o.lancement + 1 } : o)),
      ongletActif: existant.id,
    });
    return;
  }
  const onglet = {
    id: `console-${crypto.randomUUID()}`,
    genre: 'console',
    projetId: projet.id,
    indexAction: index,
    valeurs,
    lancement: 1,
    nom: `${action.nom} · ${projet.fiche.nom}`,
    enCours: true,
  };
  etat.modifier({ onglets: [...onglets, onglet], ongletActif: onglet.id });
}

// --- Terminaux et Claude Code ---------------------------------------------------------------

// Ouvre un onglet de terminal. cible : { type: 'projet', id } | { type: 'toolkit' } | { type: 'racine' }
// nomCible : nom lisible du dossier (pour le titre de l'onglet).
// continuer : Claude reprend la dernière conversation (claude --continue).
export function ouvrirTerminal({ mode, cible, nomCible, demande, continuer = false }) {
  const onglet = {
    id: `terminal-${crypto.randomUUID()}`,
    genre: 'terminal',
    mode,
    cible,
    nomCible,
    demande,
    continuer,
    nom: `${mode === 'claude' ? 'Claude' : 'PowerShell'} · ${nomCible}`,
    enCours: true,
  };
  etat.modifier({ onglets: [...etat.obtenir().onglets, onglet], ongletActif: onglet.id });
}

// Appelé par le panneau du terminal quand son processus démarre ou s'arrête.
export function marquerTerminal(id, enCours) {
  const { onglets } = etat.obtenir();
  if (!onglets.some((o) => o.id === id && o.enCours !== enCours)) return;
  etat.modifier({ onglets: onglets.map((o) => (o.id === id ? { ...o, enCours } : o)) });
}

// Connexion à un compte (service : 'claude' | 'github') dans un terminal : l'outil officiel
// ouvre le navigateur ; Toolkit ne voit jamais le mot de passe.
export function connecterCompte(service) {
  // GitHub : fenêtre avec le code à saisir sur github.com (voir comptes-ui.js).
  if (service === 'github') {
    import('./comptes-ui.js').then((c) => c.connecterGithub());
    return;
  }
  const onglet = {
    id: `terminal-${crypto.randomUUID()}`,
    genre: 'terminal',
    mode: 'connexion',
    connexion: service,
    cible: { type: 'racine' },
    nomCible: service === 'claude' ? 'Claude' : 'GitHub',
    nom: `Connexion · ${service === 'claude' ? 'Claude' : 'GitHub'}`,
    enCours: true,
  };
  etat.modifier({ onglets: [...etat.obtenir().onglets, onglet], ongletActif: onglet.id });
}

export function ouvrirPowerShell(cible, nomCible) {
  ouvrirTerminal({ mode: 'powershell', cible, nomCible });
}

function memeCible(a, b) {
  return a.type === b.type && a.id === b.id;
}

// Commit de sauvegarde avant de laisser Claude modifier un dossier.
// Renvoie true pour continuer, false pour annuler.
async function sauvegarderAvantClaude(cible, nomCible) {
  const etatGit = await essayer(() => api.sauvegarde.etat(cible));
  if (!etatGit) return false;
  if (!etatGit.gitDisponible) {
    return confirmer({
      titre: 'Pas de sauvegarde possible',
      message: 'Git est introuvable sur ce PC : Toolkit ne peut pas faire de sauvegarde avant que Claude modifie les fichiers.\n\nPour installer Git, dans PowerShell : winget install Git.Git\n\nContinuer quand même sans sauvegarde ?',
      bouton: 'Continuer sans sauvegarde',
      danger: true,
    });
  }
  let initialiser = false;
  if (!etatGit.estDepot) {
    const choix = await choisir({
      titre: 'Activer l\'historique Git ?',
      message: `« ${nomCible} » n'a pas encore d'historique Git.\n\nL'activer permet de sauvegarder l'état actuel avant que Claude modifie les fichiers, et de revenir en arrière en cas de problème. Rien n'est envoyé sur Internet.`,
      boutons: [
        { libelle: 'Continuer sans sauvegarde', valeur: 'sans' },
        { libelle: 'Activer Git et sauvegarder', valeur: 'activer', style: 'principal' },
      ],
    });
    if (choix === null) return false;
    if (choix === 'sans') return true;
    initialiser = true;
  }
  try {
    const { commite } = await api.sauvegarde.faire(cible, { initialiser });
    notifier(commite
      ? 'Sauvegarde Git faite : tu pourras revenir à cet état si besoin.'
      : 'Rien à sauvegarder : tout était déjà enregistré dans Git.', 'succes');
    return true;
  } catch (erreur) {
    return confirmer({
      titre: 'La sauvegarde a échoué',
      message: `${erreur.message}\n\nLancer Claude quand même, sans sauvegarde ?`,
      bouton: 'Lancer sans sauvegarde',
      danger: true,
    });
  }
}

// Lance Claude Code sur une cible (après sauvegarde), avec éventuellement une demande
// initiale. Si une session Claude tourne déjà sur ce dossier, on y retourne ; la demande
// est alors copiée dans le presse-papiers (on ne peut pas l'écrire à la place de l'utilisateur).
async function lancerClaude(cible, nomCible, demande, { continuer = false } = {}) {
  const existant = etat.obtenir().onglets.find((o) => o.genre === 'terminal' && o.mode === 'claude' && o.enCours && memeCible(o.cible, cible));
  if (existant) {
    etat.modifier({ ongletActif: existant.id });
    if (demande) {
      await navigator.clipboard.writeText(demande).catch(() => {});
      notifier('Claude est déjà ouvert sur ce projet : la description de l\'erreur est copiée, colle-la-lui (clic droit ou Ctrl+V).');
    }
    return;
  }
  if (!(await sauvegarderAvantClaude(cible, nomCible))) return;
  ouvrirTerminal({ mode: 'claude', cible, nomCible, demande, continuer });
  recents.noter({ type: 'claude', cible, nom: nomCible });
}

// Depuis « Récents » : rouvre Claude sur ce dossier en reprenant la dernière conversation.
export function reprendreClaude(cible, nomCible) {
  return lancerClaude(cible, nomCible, undefined, { continuer: true });
}

export function modifierAvecClaude(projet, demande) {
  return lancerClaude({ type: 'projet', id: projet.id }, projet.fiche.nom, demande);
}

// Bouton « Demander à Claude de corriger » d'une console en échec.
export function demanderCorrection(projetId, nomAction, commande, erreur) {
  const projet = etat.obtenir().projets.find((p) => p.id === projetId);
  if (!projet) {
    notifier('Ce projet n\'existe plus.', 'erreur');
    return undefined;
  }
  const demande = `L'action « ${nomAction.split(' · ')[0]} » de ce projet a échoué`
    + `${commande ? ` (commande : ${commande})` : ''}. Voici l'erreur :\n\n${erreur}\n\n`
    + 'Explique-moi simplement le problème, puis corrige-le s\'il vient du projet. '
    + 'S\'il vient de l\'installation (Java, SDK, programme manquant…), dis-moi exactement quoi faire. '
    + 'Ne touche jamais à une keystore ni à ses mots de passe.';
  return modifierAvecClaude(projet, demande);
}

export function modifierToolkitAvecClaude(demande) {
  return lancerClaude({ type: 'toolkit' }, 'Toolkit', typeof demande === 'string' ? demande : undefined);
}

export async function nouvelOutil() {
  const modeles = await essayer(() => api.modeles.lister());
  if (!modeles || modeles.length === 0) {
    if (modeles) notifier('Aucun modèle trouvé dans app/templates.', 'erreur');
    return;
  }
  const valeurs = await formulaire({
    titre: 'Nouvel outil',
    message: 'Toolkit crée le dossier du projet, puis Claude Code le construit d\'après ta description.',
    champs: [
      { id: 'nom', libelle: 'Nom', type: 'texte', obligatoire: true, exemple: 'Par exemple : Convertisseur d\'images' },
      {
        id: 'modeleId',
        libelle: 'Type',
        type: 'choix',
        options: modeles.map((m) => ({ valeur: m.id, libelle: m.nom })),
      },
      { id: 'categorie', libelle: 'Catégorie', type: 'texte', suggestions: listeCategories().map(([c]) => c), exemple: 'Par exemple : Utilitaires' },
      {
        id: 'description',
        libelle: 'Ce que l\'outil doit faire',
        type: 'zone',
        obligatoire: true,
        exemple: 'Décris l\'outil avec tes mots : ce qu\'il reçoit, ce qu\'il produit, à quoi il ressemble…',
        aide: 'Entrée pour aller à la ligne, Ctrl+Entrée pour valider.',
      },
    ],
    bouton: 'Créer et lancer Claude',
  });
  if (!valeurs) return;
  const cree = await essayer(() => api.modeles.creerProjet(valeurs));
  if (!cree) return;
  if (cree.avertissement) notifier(cree.avertissement, 'erreur');
  await chargerProjets();
  etat.modifier({ selection: cree.id });
  ouvrirTerminal({ mode: 'claude', cible: { type: 'projet', id: cree.id }, nomCible: cree.nom, demande: cree.demande });
}

// --- Application ------------------------------------------------------------------------

export async function redemarrerToolkit() {
  const terminauxOuverts = etat.obtenir().onglets.some((o) => o.genre === 'terminal' && o.enCours);
  const ok = await confirmer({
    titre: 'Redémarrer Toolkit',
    message: 'Toolkit va se fermer puis se rouvrir pour appliquer les modifications.'
      + (terminauxOuverts ? '\n\nLes terminaux en cours (Claude, PowerShell) seront fermés. Avec Claude, « Reprendre la conversation » permettra ensuite de continuer.' : ''),
    bouton: 'Redémarrer',
  });
  if (ok) await essayer(() => api.application.redemarrer());
}
