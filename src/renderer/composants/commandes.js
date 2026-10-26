// Commandes de Toolkit : exécution des raccourcis clavier (voir raccourcis.js) et liste de la
// palette de commandes (voir palette.js).
import * as etat from './etat.js';
import * as actions from './actions.js';
import * as preferences from './preferences.js';
import * as raccourcis from './raccourcis.js';
import { ouvrirRecherche } from './recherche.js';
import { focaliserFiltre } from './bibliotheque.js';
import { afficherHistorique } from './historique.js';
import * as actionsGit from './actions-git.js';

const ZOOMS = [50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200];

function zoomer(sens) {
  const actuel = preferences.lire('interface').zoom;
  const index = ZOOMS.findIndex((z) => z >= actuel);
  const suivant = sens === 0 ? 100 : ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (index < 0 ? ZOOMS.length - 1 : index) + sens))];
  preferences.modifier('interface', { zoom: suivant });
}

const panneauCodeActif = () => document.querySelector('.panneau-code:not(.inactif)');

// Exécute la commande d'un raccourci. Renvoie false si elle ne s'applique pas ici.
export function executer(id) {
  const commande = raccourcis.COMMANDES.find((c) => c.id === id);
  if (commande?.zone === 'editeur') {
    const panneau = panneauCodeActif();
    if (!panneau) return false;
    panneau.dispatchEvent(new CustomEvent('commande', { detail: id }));
    return true;
  }
  switch (id) {
    case 'palette': import('./palette.js').then((p) => p.ouvrirPalette()); break;
    case 'recherche': ouvrirRecherche(); break;
    case 'filtrer':
      actions.activerOnglet('bibliotheque');
      focaliserFiltre();
      break;
    case 'fermerOnglet': {
      // Dans l'onglet « Code » : ferme d'abord le fichier affiché.
      const panneau = panneauCodeActif();
      if (panneau) panneau.dispatchEvent(new CustomEvent('commande', { detail: 'fermerOnglet' }));
      else actions.fermerOngletActif();
      break;
    }
    case 'ongletSuivant': actions.ongletSuivant(1); break;
    case 'ongletPrecedent': actions.ongletSuivant(-1); break;
    case 'bibliotheque': actions.activerOnglet('bibliotheque'); break;
    case 'reglages': actions.ouvrirReglages(); break;
    case 'git': actions.ouvrirGit(); break;
    case 'nouvelOutil': actions.nouvelOutil(); break;
    case 'terminal': actions.ouvrirPowerShell({ type: 'racine' }, 'Toolkit'); break;
    case 'zoomPlus': zoomer(1); break;
    case 'zoomMoins': zoomer(-1); break;
    case 'zoomNormal': zoomer(0); break;
    default: return false;
  }
  return true;
}

// --- Palette ---------------------------------------------------------------------------------
// [{ titre, detail?, groupe, icone, raccourci?, action }]

export function listePalette() {
  const { projets, selection } = etat.obtenir();
  const r = (id) => raccourcis.afficher(raccourcis.touche(id));
  const liste = [
    { titre: 'Nouvel outil (avec Claude)', groupe: 'Toolkit', icone: 'plus', raccourci: r('nouvelOutil'), action: actions.nouvelOutil },
    { titre: 'Importer un projet', groupe: 'Toolkit', icone: 'importer', action: actions.ouvrirImport },
    { titre: 'Rechercher dans les projets et les notes', groupe: 'Toolkit', icone: 'recherche', raccourci: r('recherche'), action: ouvrirRecherche },
    { titre: 'Git et GitHub', groupe: 'Toolkit', icone: 'git', raccourci: r('git'), action: actions.ouvrirGit },
    { titre: 'Terminal PowerShell', groupe: 'Toolkit', icone: 'terminal', raccourci: r('terminal'), action: () => actions.ouvrirPowerShell({ type: 'racine' }, 'Toolkit') },
    { titre: 'Réglages', groupe: 'Toolkit', icone: 'reglages', raccourci: r('reglages'), action: () => actions.ouvrirReglages() },
    { titre: 'Préférences pour Claude', groupe: 'Réglages', icone: 'claude', action: () => actions.ouvrirReglages('claude') },
    { titre: 'Préférences de l\'éditeur de code', groupe: 'Réglages', icone: 'code', action: () => actions.ouvrirReglages('editeur') },
    { titre: 'Préférences de l\'interface (zoom, démarrage…)', groupe: 'Réglages', icone: 'grille', action: () => actions.ouvrirReglages('interface') },
    { titre: 'Raccourcis clavier', groupe: 'Réglages', icone: 'reglages', action: () => actions.ouvrirReglages('raccourcis') },
    { titre: 'Comptes Claude et GitHub', groupe: 'Réglages', icone: 'utilisateur', action: () => actions.ouvrirReglages('comptes') },
    { titre: 'Assistant de bienvenue', groupe: 'Toolkit', icone: 'info', action: () => import('./bienvenue.js').then((b) => b.ouvrirBienvenue()) },
    { titre: 'Vérifier les mises à jour', groupe: 'Réglages', icone: 'redemarrer', action: () => actions.ouvrirReglages('mises-a-jour', { verifier: true }) },
    { titre: 'Agrandir l\'interface', groupe: 'Affichage', icone: 'plus', raccourci: r('zoomPlus'), action: () => zoomer(1) },
    { titre: 'Réduire l\'interface', groupe: 'Affichage', icone: 'croix', raccourci: r('zoomMoins'), action: () => zoomer(-1) },
    { titre: 'Taille normale de l\'interface', groupe: 'Affichage', icone: 'grille', raccourci: r('zoomNormal'), action: () => zoomer(0) },
    { titre: 'Modifier Toolkit avec Claude', groupe: 'Toolkit', icone: 'claude', action: () => actions.modifierToolkitAvecClaude() },
    { titre: 'Code de Toolkit', groupe: 'Toolkit', icone: 'code', action: () => actions.ouvrirCode({ type: 'toolkit' }, 'Toolkit') },
    { titre: 'Redémarrer Toolkit', groupe: 'Toolkit', icone: 'redemarrer', action: actions.redemarrerToolkit },
  ];
  // Projet sélectionné d'abord, puis tous les projets.
  const tries = [...projets].sort((a, b) => (b.id === selection) - (a.id === selection));
  for (const p of tries) {
    const nom = p.fiche.nom;
    const cible = { type: 'projet', id: p.id };
    liste.push(
      { titre: `Ouvrir ${nom}`, detail: actions.estOuvrableCommeOutil(p) ? 'outil' : 'dans son éditeur', groupe: nom, icone: 'lecture', action: () => actions.ouvrirProjet(p) },
      { titre: `Afficher ${nom}`, detail: 'dans la bibliothèque', groupe: nom, icone: 'grille', action: () => actions.allerAuProjet(p.id) },
      { titre: `Code de ${nom}`, groupe: nom, icone: 'code', action: () => actions.ouvrirCode(cible, nom) },
      { titre: `Modifier ${nom} avec Claude`, groupe: nom, icone: 'claude', action: () => actions.modifierAvecClaude(p) },
      { titre: `Historique de ${nom}`, groupe: nom, icone: 'historique', action: () => afficherHistorique(cible, nom) },
      { titre: `Commit de ${nom}`, detail: 'enregistrer les modifications dans Git', groupe: nom, icone: 'git', action: () => actionsGit.commit(cible) },
      { titre: `Envoyer ${nom} sur GitHub (Push)`, groupe: nom, icone: 'exporter', action: () => actionsGit.pousser(cible) },
      ...p.fiche.actions.map((a, i) => ({ titre: `${a.nom} — ${nom}`, detail: 'action', groupe: nom, icone: 'lecture', action: () => actions.lancerAction(p, i) })),
    );
  }
  return liste;
}
