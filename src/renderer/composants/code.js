// Onglet « Code » : explorateur des fichiers d'un projet (ou de Toolkit) à gauche, éditeur
// Monaco (celui de VS Code) à droite, avec un onglet par fichier ouvert.
// - Ctrl+S enregistre, Ctrl+W ferme le fichier, Ctrl+P va à un fichier.
// - Les fichiers modifiés ailleurs (par Claude…) sont rechargés s'ils n'ont pas de
//   modification en cours ; sinon l'enregistrement demande quoi faire.
// - Supprimer = Corbeille de Windows, toujours après confirmation.
// - Python : aide de Pyright (lsp-python.js) ; JavaScript / TypeScript : aide de Monaco, avec
//   les fichiers .js / .ts du projet chargés en arrière-plan pour suivre les « import ».
import { el, normaliser } from './dom.js';
import { icone } from './icones.js';
import { notifier } from './notifications.js';
import { demanderTexte, confirmer, choisir } from './dialogue.js';
import { ouvrirMenu } from './menu.js';
import * as etat from './etat.js';
import { chargerMonaco, langageDe, nomLangage, OPTIONS_EDITEUR } from './monaco.js';
import * as lsp from './lsp-python.js';
import { afficherHistorique } from './historique.js';
import * as recents from './recents.js';

const api = window.toolkit.code;
const panneaux = new Map(); // cle -> panneau ouvert (ouvreur de Monaco, surveillance)
const EXTENSIONS_JS = /\.(m?js|cjs|jsx|tsx?)$/i;
const MAX_FICHIERS_JS = 400;
const ENCODAGES = { utf8: 'UTF-8', utf8bom: 'UTF-8 avec BOM', 'windows-1252': 'Windows-1252' };
const COULEURS_EXTENSIONS = {
  js: '#e8d44d', mjs: '#e8d44d', cjs: '#e8d44d', jsx: '#61dafb', ts: '#3178c6', tsx: '#3178c6',
  py: '#4b8bbe', pyw: '#4b8bbe', html: '#e44d26', htm: '#e44d26', css: '#2965f1', json: '#cbcb41',
  md: '#519aba', kt: '#a97bff', kts: '#a97bff', java: '#e76f00', gradle: '#02a88e', xml: '#e37933',
  png: '#a074c4', jpg: '#a074c4', jpeg: '#a074c4', gif: '#a074c4', svg: '#ffb13b', webp: '#a074c4', ico: '#a074c4',
  bat: '#c1f12e', cmd: '#c1f12e', ps1: '#5391fe', sh: '#89e051', txt: '#8b8b8b',
};

export function cleDe(cible) {
  return cible.type === 'projet' ? `p-${cible.id}` : 'toolkit';
}

const parent = (chemin) => (chemin.includes('/') ? chemin.slice(0, chemin.lastIndexOf('/')) : '');
const nomDe = (chemin) => chemin.slice(chemin.lastIndexOf('/') + 1);
const dansDossier = (chemin, dossier) => chemin === dossier || chemin.startsWith(`${dossier}/`);

// Liens entre Monaco et les panneaux (une seule fois pour toute l'application).
let monacoPrepare = false;
function preparerMonaco(monaco) {
  if (monacoPrepare) return;
  monacoPrepare = true;
  const panneauDe = (uri) => (uri.scheme === 'file' ? panneaux.get(decodeURIComponent(uri.path.split('/')[1] || '')) : null);
  const cheminDe = (uri) => decodeURIComponent(uri.path.split('/').slice(2).join('/'));
  // « Aller à la définition » vers un autre fichier du projet : le fichier y est créé en modèle.
  lsp.preparer(monaco, async (uri) => panneauDe(uri)?.chargerDocument(cheminDe(uri)));
  // … puis ouvert dans un onglet de fichier de l'éditeur (au lieu d'être refusé par Monaco).
  monaco.editor.registerEditorOpener({
    openCodeEditor(_source, uri, selection) {
      const panneau = panneauDe(uri);
      if (!panneau) return false;
      panneau.ouvrirFichier(cheminDe(uri), selection);
      return true;
    },
  });
  window.toolkit.code.surChangements((cle, chemins) => panneaux.get(cle)?.changements(chemins));
}

export function creerPanneauCode(o, zone) {
  const { cible, cle } = o;
  let monaco = null;
  let editeur = null;
  const contenus = new Map(); // dossier relatif -> entrées
  const deplies = new Set(['']);
  const documents = new Map(); // chemin -> { chemin, modele | image | raison, mtime, encodage, finLigne, versionSauvee, vue, modifieAilleurs, supprime }
  const ouverts = []; // chemins des onglets de fichiers, dans l'ordre
  let actif = null;
  let selection = null;
  let listeTout = null;
  let jsCharges = false;
  let dernierNonEnregistre = false;
  let derniereDemande = null;
  let messageStatut = '';
  let abonnementMarques = null;

  // --- Éléments --------------------------------------------------------------------------------

  const arbre = el('div', {
    classe: 'code-arbre',
    tabindex: '0',
    onKeydown: toucheArbre,
    onContextmenu: (e) => {
      e.preventDefault();
      ouvrirMenu({ x: e.clientX, y: e.clientY }, [
        { libelle: 'Nouveau fichier…', icone: 'plus', action: () => creerElement('', 'fichier') },
        { libelle: 'Nouveau dossier…', icone: 'nouveauDossier', action: () => creerElement('', 'dossier') },
        'separateur',
        { libelle: 'Actualiser', icone: 'redemarrer', action: actualiser },
      ]);
    },
  });
  const champRecherche = el('input', {
    type: 'text',
    classe: 'code-recherche',
    placeholder: 'Aller au fichier… (Ctrl+P)',
    spellcheck: 'false',
    onInput: () => { choixResultat = 0; rendreResultats(); },
    onKeydown: toucheRecherche,
  });
  const resultats = el('div', { classe: 'code-resultats', hidden: true });
  const barreFichiers = el('div', { classe: 'code-fichiers' });
  const zoneEditeur = el('div', { classe: 'code-editeur' });
  const zoneMessage = el('div', { classe: 'code-message' });
  const statut = el('div', { classe: 'code-statut' });
  const boutonEnregistrer = el('button', { classe: 'bouton petit', title: 'Enregistrer le fichier (Ctrl+S)', disabled: true, onClick: () => enregistrer(actif) }, 'Enregistrer');

  // Panneau « Rechercher dans tous les fichiers » (Ctrl+Maj+F), à la place de l'arborescence.
  const optionsRecherche = { casse: false, motEntier: false, regex: false };
  let minuterieRecherche = null;
  const champCherche = el('input', {
    type: 'text',
    classe: 'code-recherche',
    placeholder: 'Rechercher dans tous les fichiers',
    spellcheck: 'false',
    onInput: () => { clearTimeout(minuterieRecherche); minuterieRecherche = setTimeout(lancerRecherche, 350); },
    onKeydown: (e) => { if (e.key === 'Enter') lancerRecherche(); },
  });
  const bascule = (cle, libelle, titre) => {
    const bouton = el('button', {
      classe: 'bascule-recherche',
      title: titre,
      onClick: () => {
        optionsRecherche[cle] = !optionsRecherche[cle];
        bouton.classList.toggle('actif', optionsRecherche[cle]);
        lancerRecherche();
      },
    }, libelle);
    return bouton;
  };
  const champRemplacer = el('input', { type: 'text', classe: 'code-recherche', placeholder: 'Remplacer par (facultatif)', spellcheck: 'false' });
  const resumeRecherche = el('div', { classe: 'resume-recherche' });
  const resultatsRecherche = el('div', { classe: 'resultats-recherche' });
  const panneauRecherche = el('div', { classe: 'code-panneau-recherche', hidden: true },
    el('div', { classe: 'ligne-recherche' }, champCherche,
      bascule('casse', 'Aa', 'Respecter les majuscules'),
      bascule('motEntier', 'ab|', 'Mot entier seulement'),
      bascule('regex', '.*', 'Expression régulière (pour les connaisseurs)')),
    el('div', { classe: 'ligne-recherche' }, champRemplacer,
      el('button', { classe: 'bouton petit', title: 'Remplacer dans tous les fichiers trouvés (sauvegarde Git avant)', onClick: remplacerTout }, 'Tout remplacer')),
    resumeRecherche,
    resultatsRecherche);
  const vueFichiers = el('div', { classe: 'code-vue-fichiers' }, champRecherche, resultats, arbre);
  const ongletVue = (vue, nom, libelle, titre) => el('button', { classe: 'onglet-vue', 'data-vue': vue, title: titre, onClick: () => changerVue(vue) }, icone(nom), libelle);

  const explorateur = el('div', { classe: 'code-explorateur' },
    el('div', { classe: 'code-vues' },
      ongletVue('fichiers', 'dossier', 'Fichiers', 'Arborescence des fichiers'),
      ongletVue('recherche', 'recherche', 'Rechercher', 'Rechercher dans tous les fichiers (Ctrl+Maj+F)')),
    el('div', { classe: 'code-entete' },
      el('span', { classe: 'code-titre', title: o.nomCible }, o.nomCible),
      el('button', { classe: 'bouton-icone', title: 'Nouveau fichier', onClick: () => creerElement(dossierDeSelection(), 'fichier') }, icone('plus')),
      el('button', { classe: 'bouton-icone', title: 'Nouveau dossier', onClick: () => creerElement(dossierDeSelection(), 'dossier') }, icone('nouveauDossier')),
      el('button', { classe: 'bouton-icone', title: 'Actualiser', onClick: actualiser }, icone('redemarrer')),
      el('button', { classe: 'bouton-icone', title: 'Tout replier', onClick: () => { deplies.clear(); deplies.add(''); rendreArbre(); } }, icone('liste'))),
    vueFichiers,
    panneauRecherche);

  function changerVue(vue) {
    vueFichiers.hidden = vue !== 'fichiers';
    panneauRecherche.hidden = vue !== 'recherche';
    explorateur.querySelector('.code-entete').hidden = vue !== 'fichiers';
    explorateur.querySelectorAll('.onglet-vue').forEach((b) => b.classList.toggle('actif', b.dataset.vue === vue));
    if (vue === 'recherche') {
      champCherche.focus();
      champCherche.select();
    }
  }

  function ouvrirRechercheGlobale() {
    // Texte sélectionné dans l'éditeur (une ligne) : cherché directement.
    const choisi = editeur && documents.get(actif)?.modele ? editeur.getModel().getValueInRange(editeur.getSelection()) : '';
    if (choisi && !choisi.includes('\n')) champCherche.value = choisi;
    changerVue('recherche');
    if (champCherche.value) lancerRecherche();
  }

  let numeroRecherche = 0;
  let derniersResultats = null;
  async function lancerRecherche() {
    clearTimeout(minuterieRecherche);
    const texte = champCherche.value;
    const numero = ++numeroRecherche;
    if (!texte) {
      derniersResultats = null;
      resumeRecherche.replaceChildren();
      resultatsRecherche.replaceChildren();
      return;
    }
    resumeRecherche.textContent = 'Recherche…';
    let r;
    try {
      r = await api.rechercher(cible, { texte, ...optionsRecherche });
    } catch (erreur) {
      if (numero === numeroRecherche) resumeRecherche.replaceChildren(el('span', { classe: 'dialogue-erreur' }, erreur.message));
      return;
    }
    if (numero !== numeroRecherche) return;
    derniersResultats = { ...r, texte, options: { ...optionsRecherche } };
    resumeRecherche.textContent = r.total
      ? `${r.total} résultat(s) dans ${r.fichiers.length} fichier(s)${r.tronque ? ' (seuls les 2000 premiers sont affichés)' : ''}`
      : 'Aucun résultat.';
    resultatsRecherche.replaceChildren(...r.fichiers.map((f) => {
      const lignes = el('div', { classe: 'lignes-resultat' }, f.resultats.map((res) => el('div', {
        classe: 'resultat-ligne',
        title: `Ligne ${res.ligne}`,
        onClick: () => ouvrirFichier(f.chemin, new monaco.Range(res.ligne, res.debut + 1, res.ligne, res.fin + 1)),
      }, el('span', {}, res.avant), el('mark', {}, res.trouve), el('span', {}, res.apres))));
      return el('div', { classe: 'fichier-resultat' },
        el('div', {
          classe: 'entete-resultat',
          title: f.chemin,
          onClick: (e) => e.currentTarget.parentElement.classList.toggle('replie'),
        },
        el('span', { classe: 'chevron-code ouvert' }, icone('chevron')),
        iconeFichier({ nom: nomDe(f.chemin), dossier: false }),
        el('span', { classe: 'nom-noeud' }, nomDe(f.chemin)),
        el('span', { classe: 'dossier-resultat' }, parent(f.chemin)),
        el('span', { classe: 'compte-resultat' }, f.resultats.length)),
        lignes);
    }));
  }

  async function remplacerTout() {
    const r = derniersResultats;
    if (!r || r.texte !== champCherche.value || !r.total) {
      notifier('Lance d\'abord une recherche qui trouve quelque chose.', 'erreur');
      return;
    }
    const chemins = r.fichiers.map((f) => f.chemin);
    const nonEnregistres = chemins.filter((c) => estModifie(documents.get(c)));
    if (nonEnregistres.length) {
      notifier(`Enregistre d'abord : ${nonEnregistres.join(', ')}.`, 'erreur');
      return;
    }
    let aGit = false;
    try {
      aGit = (await window.toolkit.git.etat(cible)).estDepot;
    } catch { /* sans Git */ }
    const ok = await confirmer({
      titre: 'Tout remplacer',
      message: `Remplacer ${r.total}${r.tronque ? '+' : ''} occurrence(s) de « ${r.texte} » par « ${champRemplacer.value} » dans ${chemins.length} fichier(s) ?\n\n`
        + (aGit
          ? 'Une sauvegarde Git est faite juste avant : tu pourras tout annuler avec l\'historique des versions.'
          : 'Attention : ce projet n\'a pas d\'historique Git, ce remplacement ne pourra pas être annulé automatiquement.'),
      bouton: 'Tout remplacer',
      danger: !aGit,
    });
    if (!ok) return;
    try {
      const resultat = await api.remplacer(cible, { texte: r.texte, ...r.options }, champRemplacer.value, chemins);
      notifier(`${resultat.remplacements} remplacement(s) dans ${resultat.fichiers} fichier(s).`, 'succes');
    } catch (erreur) {
      notifier(erreur.message, 'erreur');
      return;
    }
    lancerRecherche();
  }

  const element = el('section', { classe: 'panneau panneau-code', onKeydown: touchesPanneau },
    explorateur,
    el('div', { classe: 'code-poignee', title: 'Glisser pour changer la largeur', onMousedown: redimensionner }),
    el('div', { classe: 'code-principal' },
      el('div', { classe: 'code-barre-fichiers' }, barreFichiers, boutonEnregistrer),
      el('div', { classe: 'code-zone' }, zoneEditeur, zoneMessage),
      statut));
  try {
    const largeur = Number(localStorage.getItem('toolkit:code:largeur'));
    if (largeur >= 160 && largeur <= 700) element.style.setProperty('--largeur-explorateur', `${largeur}px`);
  } catch { /* stockage indisponible : largeur par défaut */ }
  zone.append(element);
  changerVue('fichiers');
  // Ctrl+Maj+F pressé hors du panneau (voir renderer.js).
  element.addEventListener('rechercher', ouvrirRechercheGlobale);

  // --- Arbre des fichiers ----------------------------------------------------------------------

  async function chargerDossier(dossier) {
    try {
      contenus.set(dossier, await api.lister(cible, dossier));
    } catch (erreur) {
      contenus.delete(dossier);
      deplies.delete(dossier);
      if (dossier === '') notifier(erreur.message, 'erreur');
    }
  }

  async function basculerDossier(dossier) {
    if (deplies.has(dossier)) {
      deplies.delete(dossier);
    } else {
      deplies.add(dossier);
      if (!contenus.has(dossier)) await chargerDossier(dossier);
    }
    rendreArbre();
  }

  // Déplie les dossiers parents d'un fichier (pour le montrer dans l'arbre).
  async function reveler(chemin) {
    const morceaux = chemin.split('/');
    for (let i = 1; i < morceaux.length; i += 1) {
      const dossier = morceaux.slice(0, i).join('/');
      deplies.add(dossier);
      if (!contenus.has(dossier)) await chargerDossier(dossier);
    }
    rendreArbre();
    arbre.querySelector(`[data-chemin="${CSS.escape(chemin)}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  async function actualiser() {
    listeTout = null;
    await Promise.all([...contenus.keys()].map(chargerDossier));
    rendreArbre();
  }

  function iconeFichier(entree, ouvert) {
    if (entree.dossier) return el('span', { classe: `ico-code dossier${ouvert ? ' ouvert' : ''}` }, icone('dossier'));
    const extension = entree.nom.includes('.') ? entree.nom.slice(entree.nom.lastIndexOf('.') + 1).toLowerCase() : '';
    return el('span', { classe: 'ico-code', style: { '--couleur-fichier': COULEURS_EXTENSIONS[extension] || '#8b8b8b' } }, icone('note'));
  }

  function noeud(entree, profondeur) {
    const ouvert = entree.dossier && deplies.has(entree.chemin);
    const documentOuvert = documents.get(entree.chemin);
    const ligne = el('div', {
      classe: `noeud-code${entree.genere ? ' genere' : ''}${selection === entree.chemin ? ' choisi' : ''}${actif === entree.chemin ? ' actif' : ''}`,
      style: { '--profondeur': profondeur },
      title: entree.chemin,
      'data-chemin': entree.chemin,
      onClick: () => {
        selection = entree.chemin;
        if (entree.dossier) basculerDossier(entree.chemin);
        else ouvrirFichier(entree.chemin);
        rendreArbre();
      },
      onContextmenu: (e) => {
        e.preventDefault();
        e.stopPropagation();
        selection = entree.chemin;
        rendreArbre();
        ouvrirMenu({ x: e.clientX, y: e.clientY }, menuEntree(entree));
      },
    },
    el('span', { classe: `chevron-code${entree.dossier ? '' : ' vide'}${ouvert ? ' ouvert' : ''}` }, entree.dossier ? icone('chevron') : null),
    iconeFichier(entree, ouvert),
    el('span', { classe: 'nom-noeud' }, entree.nom),
    documentOuvert && estModifie(documentOuvert) ? el('span', { classe: 'point-modifie', title: 'Modifications non enregistrées' }, '●') : null);
    if (!ouvert) return [ligne];
    const enfants = contenus.get(entree.chemin);
    if (!enfants) return [ligne];
    if (enfants.length === 0) return [ligne, el('div', { classe: 'noeud-code vide', style: { '--profondeur': profondeur + 1 } }, 'Dossier vide')];
    return [ligne, ...enfants.flatMap((e) => noeud(e, profondeur + 1))];
  }

  function rendreArbre() {
    const racine = contenus.get('');
    if (!racine) {
      arbre.replaceChildren(el('div', { classe: 'noeud-code vide' }, 'Chargement…'));
      return;
    }
    arbre.replaceChildren(...(racine.length ? racine.flatMap((e) => noeud(e, 0)) : [el('div', { classe: 'noeud-code vide' }, 'Dossier vide')]));
  }

  function entreeDe(chemin) {
    return contenus.get(parent(chemin))?.find((e) => e.chemin === chemin) || null;
  }

  function dossierDeSelection() {
    if (!selection) return '';
    const entree = entreeDe(selection);
    return entree?.dossier ? selection : parent(selection);
  }

  function menuEntree(entree) {
    const elements = entree.dossier
      ? [
        { libelle: 'Nouveau fichier…', icone: 'plus', action: () => creerElement(entree.chemin, 'fichier') },
        { libelle: 'Nouveau dossier…', icone: 'nouveauDossier', action: () => creerElement(entree.chemin, 'dossier') },
      ]
      : [{ libelle: 'Ouvrir', icone: 'lecture', action: () => ouvrirFichier(entree.chemin) }];
    return [
      ...elements,
      'separateur',
      entree.dossier ? null : { libelle: 'Historique de ce fichier…', icone: 'historique', action: () => afficherHistorique(cible, o.nomCible, { chemin: entree.chemin }) },
      { libelle: 'Renommer…', icone: 'crayon', detail: 'F2', action: () => renommerEntree(entree) },
      { libelle: 'Mettre à la Corbeille…', icone: 'effacer', detail: 'Suppr', action: () => mettreALaCorbeille(entree) },
      'separateur',
      { libelle: 'Copier le chemin relatif', icone: 'note', action: () => navigator.clipboard.writeText(entree.chemin).then(() => notifier('Chemin copié.')).catch(() => {}) },
    ].filter(Boolean);
  }

  function toucheArbre(e) {
    const entree = selection ? entreeDe(selection) : null;
    if (!entree) return;
    if (e.key === 'F2') {
      e.preventDefault();
      renommerEntree(entree);
    } else if (e.key === 'Delete') {
      e.preventDefault();
      mettreALaCorbeille(entree);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (entree.dossier) basculerDossier(entree.chemin);
      else ouvrirFichier(entree.chemin);
    }
  }

  // --- Création, renommage, Corbeille -----------------------------------------------------------

  async function creerElement(dossier, type) {
    const nom = await demanderTexte({
      titre: type === 'dossier' ? 'Nouveau dossier' : 'Nouveau fichier',
      message: `Dans « ${dossier || o.nomCible} » :`,
      exemple: type === 'dossier' ? 'Par exemple : images' : 'Par exemple : outils.py',
      bouton: 'Créer',
    });
    if (!nom) return;
    try {
      const chemin = await api.creer(cible, dossier, nom, type);
      listeTout = null;
      deplies.add(dossier);
      await chargerDossier(dossier);
      selection = chemin;
      if (type === 'dossier') {
        deplies.add(chemin);
        await chargerDossier(chemin);
      }
      rendreArbre();
      if (type === 'fichier') ouvrirFichier(chemin);
    } catch (erreur) {
      notifier(erreur.message, 'erreur');
    }
  }

  // Documents ouverts touchés par une entrée (le fichier, ou ce qui est dans le dossier).
  const documentsDans = (chemin) => [...documents.values()].filter((d) => dansDossier(d.chemin, chemin));

  function oublierDocument(doc) {
    if (doc.modele) {
      lsp.clientExistant(cle)?.fermer(doc.modele);
      doc.modele.dispose();
    }
    documents.delete(doc.chemin);
  }

  async function renommerEntree(entree) {
    const touches = documentsDans(entree.chemin);
    if (touches.some(estModifie)) {
      notifier('Enregistre d\'abord les fichiers modifiés de cet élément, puis renomme-le.', 'erreur');
      return;
    }
    const nom = await demanderTexte({ titre: 'Renommer', message: `Nouveau nom pour « ${entree.nom} » :`, valeur: entree.nom, bouton: 'Renommer' });
    if (!nom || nom === entree.nom) return;
    let nouveau;
    try {
      nouveau = await api.renommer(cible, entree.chemin, nom);
    } catch (erreur) {
      notifier(erreur.message, 'erreur');
      return;
    }
    // Les fichiers ouverts suivent leur nouveau nom (rouverts depuis le disque).
    const remplace = (c) => nouveau + c.slice(entree.chemin.length);
    const etaitActif = actif && dansDossier(actif, entree.chemin) ? remplace(actif) : null;
    touches.forEach(oublierDocument);
    ouverts.forEach((c, i) => { if (dansDossier(c, entree.chemin)) ouverts[i] = remplace(c); });
    for (const d of [...deplies]) {
      if (dansDossier(d, entree.chemin)) {
        deplies.delete(d);
        deplies.add(remplace(d));
      }
    }
    for (const d of [...contenus.keys()]) if (dansDossier(d, entree.chemin)) contenus.delete(d);
    listeTout = null;
    selection = nouveau;
    await chargerDossier(parent(entree.chemin));
    for (const d of deplies) if (!contenus.has(d)) await chargerDossier(d);
    rendreArbre();
    if (etaitActif) await ouvrirFichier(etaitActif);
    else rendreFichiers();
  }

  async function mettreALaCorbeille(entree) {
    const touches = documentsDans(entree.chemin);
    const ok = await confirmer({
      titre: 'Mettre à la Corbeille',
      message: `Mettre « ${entree.chemin} » à la Corbeille de Windows ?`
        + `${entree.dossier ? '\nTout ce que contient ce dossier part avec lui.' : ''}`
        + `${touches.some(estModifie) ? '\nAttention : des modifications non enregistrées seront perdues.' : ''}`
        + '\nTu pourras le récupérer depuis la Corbeille.',
      bouton: 'Mettre à la Corbeille',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.corbeille(cible, entree.chemin);
    } catch (erreur) {
      notifier(erreur.message, 'erreur');
      return;
    }
    touches.forEach((d) => {
      const index = ouverts.indexOf(d.chemin);
      if (index >= 0) ouverts.splice(index, 1);
      oublierDocument(d);
    });
    if (actif && dansDossier(actif, entree.chemin)) actif = null;
    for (const d of [...contenus.keys()]) if (dansDossier(d, entree.chemin)) contenus.delete(d);
    listeTout = null;
    selection = null;
    await chargerDossier(parent(entree.chemin));
    rendreArbre();
    if (!actif && ouverts.length) await activer(ouverts[ouverts.length - 1]);
    else afficher();
    notifier(`« ${entree.nom} » est dans la Corbeille.`, 'succes');
  }

  // --- Documents (fichiers chargés) -------------------------------------------------------------

  const estModifie = (doc) => Boolean(doc?.modele) && doc.modele.getAlternativeVersionId() !== doc.versionSauvee;
  const uriDe = (chemin) => monaco.Uri.from({ scheme: 'file', path: `/${cle}/${chemin}` });

  // Lit un fichier et crée son modèle (sans l'afficher). Renvoie le document.
  async function chargerDocument(chemin) {
    if (documents.has(chemin)) return documents.get(chemin);
    const lu = await api.lire(cible, chemin);
    const doc = { chemin, mtime: lu.mtime, encodage: lu.encodage, finLigne: lu.finLigne, vue: null, modifieAilleurs: false, supprime: false };
    if (lu.image) doc.image = lu.image;
    else if (lu.binaire) doc.raison = lu.raison;
    else {
      const uri = uriDe(chemin);
      monaco.editor.getModel(uri)?.dispose();
      doc.modele = monaco.editor.createModel(lu.texte, langageDe(monaco, nomDe(chemin)), uri);
      doc.versionSauvee = doc.modele.getAlternativeVersionId();
      doc.modele.onDidChangeContent(() => surModification());
      if (doc.modele.getLanguageId() === 'python') lsp.client(cle, cible, o.nomCible).ouvrir(doc.modele);
    }
    documents.set(chemin, doc);
    return doc;
  }

  // Les .js / .ts du projet en modèles : Monaco peut alors suivre les import et les
  // fonctions définies dans un autre fichier.
  async function chargerJsDuProjet() {
    if (jsCharges) return;
    jsCharges = true;
    try {
      listeTout ||= await api.listerTout(cible);
      const fichiers = listeTout.fichiers.filter((c) => EXTENSIONS_JS.test(c) && !documents.has(c)).slice(0, MAX_FICHIERS_JS);
      for (const chemin of fichiers) await chargerDocument(chemin).catch(() => null);
    } catch { /* aide réduite au fichier ouvert */ }
  }

  async function ouvrirFichier(chemin, selectionMonaco = null) {
    if (!monaco) return;
    let doc;
    try {
      doc = await chargerDocument(chemin);
    } catch (erreur) {
      notifier(erreur.message, 'erreur');
      return;
    }
    if (!ouverts.includes(chemin)) {
      // Nouvel onglet juste après l'onglet actif, comme dans VS Code.
      const index = actif ? ouverts.indexOf(actif) : -1;
      ouverts.splice(index >= 0 ? index + 1 : ouverts.length, 0, chemin);
    }
    await activer(chemin);
    recents.noter({ type: 'fichier', cible, chemin, nom: nomDe(chemin), detail: o.nomCible });
    if (selectionMonaco && doc.modele) {
      const zoneChoisie = monaco.Range.isIRange(selectionMonaco)
        ? selectionMonaco
        : new monaco.Range(selectionMonaco.lineNumber, selectionMonaco.column, selectionMonaco.lineNumber, selectionMonaco.column);
      editeur.setSelection(zoneChoisie);
      editeur.revealRangeInCenterIfOutsideViewport(zoneChoisie);
    }
    if (EXTENSIONS_JS.test(chemin)) chargerJsDuProjet();
  }

  async function activer(chemin) {
    const precedent = documents.get(actif);
    if (precedent?.modele && editeur.getModel() === precedent.modele) precedent.vue = editeur.saveViewState();
    actif = chemin;
    selection = chemin;
    afficher();
    await reveler(chemin);
    const doc = documents.get(chemin);
    if (doc?.modele) editeur.focus();
  }

  // Montre le document actif (éditeur, image ou message) et met à jour onglets et statut.
  function afficher() {
    const doc = documents.get(actif);
    if (doc?.modele) {
      if (editeur.getModel() !== doc.modele) {
        editeur.setModel(doc.modele);
        if (doc.vue) editeur.restoreViewState(doc.vue);
      }
      zoneEditeur.hidden = false;
      zoneMessage.hidden = true;
    } else {
      editeur?.setModel(null);
      zoneEditeur.hidden = true;
      zoneMessage.hidden = false;
      if (doc?.image) {
        zoneMessage.replaceChildren(el('div', { classe: 'code-image' }, el('img', { src: doc.image, alt: doc.chemin })));
      } else if (doc?.raison) {
        zoneMessage.replaceChildren(el('div', { classe: 'code-accueil' }, icone('info'), el('p', {}, doc.raison)));
      } else {
        zoneMessage.replaceChildren(el('div', { classe: 'code-accueil' },
          el('h2', {}, o.nomCible),
          el('p', {}, 'Clique sur un fichier à gauche pour l\'ouvrir.'),
          el('dl', { classe: 'infos' },
            el('dt', {}, 'Ctrl+P'), el('dd', {}, 'Aller à un fichier'),
            el('dt', {}, 'Ctrl+S'), el('dd', {}, 'Enregistrer'),
            el('dt', {}, 'Ctrl+W'), el('dd', {}, 'Fermer le fichier'),
            el('dt', {}, 'F12 / Ctrl+clic'), el('dd', {}, 'Aller à la définition'),
            el('dt', {}, 'Ctrl+Espace'), el('dd', {}, 'Suggestions'),
            el('dt', {}, 'Ctrl+F / Ctrl+H'), el('dd', {}, 'Chercher / remplacer dans le fichier'),
            el('dt', {}, 'F1'), el('dd', {}, 'Toutes les commandes de l\'éditeur'))));
      }
    }
    rendreFichiers();
    rendreStatut();
    rendreArbre();
  }

  function rendreFichiers() {
    barreFichiers.replaceChildren(...ouverts.map((chemin) => {
      const doc = documents.get(chemin);
      const modifie = estModifie(doc);
      return el('div', {
        classe: `fichier-ouvert${chemin === actif ? ' actif' : ''}${doc?.supprime ? ' supprime' : ''}`,
        title: chemin + (doc?.supprime ? ' (supprimé du disque)' : ''),
        onClick: () => activer(chemin),
        onAuxclick: (e) => { if (e.button === 1) fermerFichier(chemin); },
      },
      iconeFichier({ nom: nomDe(chemin), dossier: false }),
      el('span', { classe: 'nom-fichier-ouvert' }, nomDe(chemin)),
      el('button', {
        classe: `fermer-fichier${modifie ? ' modifie' : ''}`,
        title: modifie ? 'Modifications non enregistrées — fermer' : 'Fermer (Ctrl+W)',
        onClick: (e) => { e.stopPropagation(); fermerFichier(chemin); },
      }, modifie ? el('span', { classe: 'point-modifie' }, '●') : null, icone('croix')));
    }));
    barreFichiers.querySelector('.fichier-ouvert.actif')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    boutonEnregistrer.disabled = !estModifie(documents.get(actif));
  }

  function rendreStatut() {
    const doc = documents.get(actif);
    if (!doc) {
      statut.replaceChildren(el('span', {}, messageStatut));
      return;
    }
    const parties = [];
    if (doc.modele) {
      const position = editeur.getPosition();
      const marques = monaco.editor.getModelMarkers({ resource: doc.modele.uri });
      const erreurs = marques.filter((m) => m.severity === monaco.MarkerSeverity.Error).length;
      const avertissements = marques.filter((m) => m.severity === monaco.MarkerSeverity.Warning).length;
      if (erreurs || avertissements) {
        parties.push(el('button', {
          classe: `statut-problemes${erreurs ? ' erreurs' : ''}`,
          title: 'Aller au problème suivant (F8)',
          onClick: () => { editeur.focus(); editeur.trigger('statut', 'editor.action.marker.next'); },
        }, icone('attention'), `${erreurs} erreur(s), ${avertissements} avertissement(s)`));
      }
      if (position) parties.push(el('span', {}, `Ligne ${position.lineNumber}, col. ${position.column}`));
      parties.push(el('span', {}, nomLangage(monaco, doc.modele.getLanguageId())));
      parties.push(el('span', {}, ENCODAGES[doc.encodage] || doc.encodage));
      parties.push(el('span', { title: 'Fins de ligne' }, doc.modele.getEOL() === '\r\n' ? 'CRLF' : 'LF'));
      if (doc.modele.getLanguageId() === 'python') {
        const client = lsp.clientExistant(cle);
        const etatPython = { demarrage: 'Python : analyse en préparation…', pret: 'Python : aide active (Pyright)', arrete: 'Python : aide indisponible' }[client?.etat] || '';
        if (client) client.surEtat = rendreStatut;
        parties.push(el('span', { classe: `statut-python ${client?.etat || ''}` }, etatPython));
      }
    }
    statut.replaceChildren(
      el('span', { classe: 'statut-chemin', title: doc.chemin },
        doc.chemin,
        doc.supprime ? ' — supprimé du disque' : '',
        doc.modifieAilleurs ? el('span', { classe: 'statut-alerte' }, ' — modifié ailleurs') : '',
        messageStatut ? el('span', { classe: 'statut-message' }, ` — ${messageStatut}`) : ''),
      el('span', { classe: 'statut-droite' }, parties));
  }

  // Après chaque frappe : point « modifié » sur l'onglet du fichier, et sur celui du panneau.
  let minuterieModif = null;
  function surModification() {
    clearTimeout(minuterieModif);
    minuterieModif = setTimeout(() => {
      rendreFichiers();
      const nonEnregistre = [...documents.values()].some(estModifie);
      if (nonEnregistre !== dernierNonEnregistre) {
        dernierNonEnregistre = nonEnregistre;
        rendreArbre();
        etat.modifier({ onglets: etat.obtenir().onglets.map((x) => (x.id === o.id ? { ...x, nonEnregistre } : x)) });
      }
    }, 120);
  }

  function annoncer(texte) {
    messageStatut = texte;
    rendreStatut();
    setTimeout(() => {
      if (messageStatut === texte) {
        messageStatut = '';
        rendreStatut();
      }
    }, 2500);
  }

  // --- Enregistrer, fermer --------------------------------------------------------------------

  // Renvoie true si le fichier est enregistré.
  async function enregistrer(chemin, forcer = false) {
    const doc = documents.get(chemin);
    if (!doc?.modele) return false;
    const version = doc.modele.getAlternativeVersionId();
    let resultat;
    try {
      resultat = await api.ecrire(cible, chemin, doc.modele.getValue(), { encodage: doc.encodage, mtimeAttendu: doc.mtime, forcer });
    } catch (erreur) {
      notifier(erreur.message, 'erreur');
      return false;
    }
    if (resultat.modifieAilleurs) {
      const choix = await choisir({
        titre: 'Fichier modifié ailleurs',
        message: `« ${chemin} » a été modifié en dehors de l'éditeur (par Claude ou un autre programme) depuis que tu l'as ouvert.\nQue faire ?`,
        boutons: [
          { libelle: 'Recharger (perdre mes changements)', valeur: 'recharger' },
          { libelle: 'Garder ma version (écraser)', valeur: 'ecraser', style: 'danger' },
        ],
      });
      if (choix === 'ecraser') return enregistrer(chemin, true);
      if (choix === 'recharger') await recharger(doc, true);
      return false;
    }
    doc.mtime = resultat.mtime;
    doc.versionSauvee = version;
    doc.modifieAilleurs = false;
    doc.supprime = false;
    lsp.clientExistant(cle)?.enregistre(doc.modele);
    surModification();
    rendreFichiers();
    annoncer('Enregistré');
    return true;
  }

  async function fermerFichier(chemin) {
    const doc = documents.get(chemin);
    if (estModifie(doc)) {
      const choix = await choisir({
        titre: 'Enregistrer les modifications ?',
        message: `« ${nomDe(chemin)} » a des modifications non enregistrées.`,
        boutons: [
          { libelle: 'Ne pas enregistrer', valeur: 'non' },
          { libelle: 'Enregistrer', valeur: 'oui', style: 'principal' },
        ],
      });
      if (!choix) return;
      if (choix === 'oui' && !(await enregistrer(chemin))) return;
    }
    const index = ouverts.indexOf(chemin);
    if (index >= 0) ouverts.splice(index, 1);
    // Les .js / .ts restent chargés (aide entre fichiers) sauf s'ils n'ont pas été enregistrés.
    const garder = jsCharges && EXTENSIONS_JS.test(chemin) && !estModifie(doc);
    if (doc && !garder) oublierDocument(doc);
    if (actif === chemin) {
      actif = null;
      const suivant = ouverts[Math.min(index, ouverts.length - 1)];
      if (suivant) await activer(suivant);
      else afficher();
    } else {
      rendreFichiers();
    }
    surModification();
  }

  // Fichiers modifiés hors de l'éditeur : relus s'ils n'ont pas de modification en cours.
  async function recharger(doc, forcer = false) {
    let lu;
    try {
      lu = await api.lire(cible, doc.chemin);
    } catch {
      doc.supprime = true;
      return;
    }
    doc.supprime = false;
    if (lu.image) {
      doc.image = lu.image;
      doc.mtime = lu.mtime;
      return;
    }
    if (!doc.modele || lu.binaire) return;
    if (estModifie(doc) && !forcer) {
      if (Math.abs(lu.mtime - doc.mtime) > 1) doc.modifieAilleurs = true;
      return;
    }
    if (lu.texte !== doc.modele.getValue()) {
      // pushEditOperations garde l'historique : Ctrl+Z revient à la version d'avant.
      doc.modele.pushEditOperations([], [{ range: doc.modele.getFullModelRange(), text: lu.texte }], () => null);
    }
    doc.versionSauvee = doc.modele.getAlternativeVersionId();
    doc.mtime = lu.mtime;
    doc.encodage = lu.encodage;
    doc.modifieAilleurs = false;
  }

  async function changements(chemins) {
    listeTout = null;
    const dossiers = new Set();
    for (const chemin of chemins) {
      dossiers.add(parent(chemin));
      if (contenus.has(chemin)) dossiers.add(chemin);
    }
    await Promise.all([...dossiers].filter((d) => contenus.has(d)).map(chargerDossier));
    const touches = [...documents.values()].filter((d) => chemins.some((c) => dansDossier(d.chemin, c)));
    for (const doc of touches) await recharger(doc);
    if (touches.some((d) => d.chemin === actif)) afficher();
    else {
      rendreArbre();
      rendreFichiers();
    }
  }

  // --- Aller au fichier (Ctrl+P) --------------------------------------------------------------

  let choixResultat = 0;
  let trouves = [];

  function score(chemin, texte) {
    const nom = nomDe(chemin);
    if (nom.startsWith(texte)) return 5;
    if (nom.includes(texte)) return 4;
    if (chemin.includes(texte)) return 3;
    let i = 0;
    for (const c of chemin) if (c === texte[i]) i += 1;
    return i === texte.length ? 1 : 0;
  }

  async function rendreResultats() {
    const texte = normaliser(champRecherche.value.trim()).replace(/\\/g, '/');
    if (!texte) {
      resultats.hidden = true;
      arbre.hidden = false;
      return;
    }
    try {
      listeTout ||= await api.listerTout(cible);
    } catch (erreur) {
      notifier(erreur.message, 'erreur');
      return;
    }
    trouves = listeTout.fichiers
      .map((chemin) => [chemin, score(normaliser(chemin), texte)])
      .filter(([, s]) => s > 0)
      .sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)
      .slice(0, 80)
      .map(([chemin]) => chemin);
    choixResultat = Math.min(choixResultat, Math.max(0, trouves.length - 1));
    arbre.hidden = true;
    resultats.hidden = false;
    resultats.replaceChildren(...(trouves.length
      ? trouves.map((chemin, i) => el('div', {
        classe: `resultat-code${i === choixResultat ? ' choisi' : ''}`,
        title: chemin,
        onClick: () => choisirResultat(chemin),
      }, iconeFichier({ nom: nomDe(chemin), dossier: false }), el('span', { classe: 'nom-noeud' }, nomDe(chemin)), el('span', { classe: 'dossier-resultat' }, parent(chemin))))
      : [el('div', { classe: 'noeud-code vide' }, 'Aucun fichier ne correspond.')]));
    resultats.querySelector('.choisi')?.scrollIntoView({ block: 'nearest' });
  }

  function choisirResultat(chemin) {
    champRecherche.value = '';
    rendreResultats();
    ouvrirFichier(chemin);
  }

  function toucheRecherche(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      choixResultat = Math.max(0, Math.min(trouves.length - 1, choixResultat + (e.key === 'ArrowDown' ? 1 : -1)));
      rendreResultats();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (trouves[choixResultat]) choisirResultat(trouves[choixResultat]);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      champRecherche.value = '';
      rendreResultats();
      if (editeur && documents.get(actif)?.modele) editeur.focus();
    }
  }

  // --- Clavier et largeur ---------------------------------------------------------------------

  function touchesPanneau(e) {
    if (!e.ctrlKey || e.altKey) return;
    const touche = e.key.toLowerCase();
    if (touche === 'f' && e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      ouvrirRechercheGlobale();
    } else if (touche === 's') {
      e.preventDefault();
      e.stopPropagation();
      if (actif) enregistrer(actif);
    } else if (touche === 'p') {
      e.preventDefault();
      e.stopPropagation();
      champRecherche.focus();
      champRecherche.select();
    } else if (touche === 'w' && actif) {
      e.preventDefault();
      e.stopPropagation();
      fermerFichier(actif);
    } else if (e.target.closest?.('.monaco-editor') && ['f', 'h', 'k', 'd', 'g', 'l', '/'].includes(touche)) {
      // Raccourcis de l'éditeur (chercher, commenter…) : ne pas déclencher ceux de Toolkit.
      e.stopPropagation();
    }
  }

  function redimensionner(e) {
    e.preventDefault();
    const depart = e.clientX;
    const largeurDepart = explorateur.getBoundingClientRect().width;
    let largeur = largeurDepart;
    const bouger = (m) => {
      largeur = Math.max(160, Math.min(700, largeurDepart + m.clientX - depart));
      element.style.setProperty('--largeur-explorateur', `${largeur}px`);
    };
    const lacher = () => {
      document.removeEventListener('mousemove', bouger);
      document.removeEventListener('mouseup', lacher);
      try { localStorage.setItem('toolkit:code:largeur', String(Math.round(largeur))); } catch { /* sans importance */ }
    };
    document.addEventListener('mousemove', bouger);
    document.addEventListener('mouseup', lacher);
  }

  // --- Démarrage ----------------------------------------------------------------------------

  const panneau = {
    element,
    chargerDocument: (chemin) => (monaco ? chargerDocument(chemin) : null),
    ouvrirFichier: (chemin, sel) => ouvrirFichier(chemin, sel),
    changements: (chemins) => changements(chemins),
    focus() {
      if (editeur && documents.get(actif)?.modele) editeur.focus();
      else arbre.focus();
    },
    mettreAJour(nouveau) {
      if (nouveau.demande && nouveau.demande !== derniereDemande) {
        derniereDemande = nouveau.demande;
        if (monaco) ouvrirFichier(nouveau.demande.chemin);
      }
    },
    detruire() {
      panneaux.delete(cle);
      api.arreterSurveillance(cle).catch(() => {});
      lsp.arreter(cle);
      for (const doc of documents.values()) doc.modele?.dispose();
      documents.clear();
      abonnementMarques?.dispose();
      editeur?.dispose();
      element.remove();
    },
  };
  panneaux.set(cle, panneau);
  derniereDemande = o.demande || null;

  (async () => {
    rendreArbre();
    await chargerDossier('');
    rendreArbre();
    api.surveiller(cle, cible).catch(() => {});
    zoneEditeur.hidden = true;
    zoneMessage.replaceChildren(el('div', { classe: 'code-accueil' }, el('p', {}, 'Chargement de l\'éditeur…')));
    try {
      monaco = await chargerMonaco();
    } catch (erreur) {
      zoneMessage.replaceChildren(el('div', { classe: 'code-accueil' }, icone('erreur'), el('p', {}, erreur.message)));
      return;
    }
    if (!panneaux.has(cle)) return; // onglet fermé pendant le chargement
    preparerMonaco(monaco);
    editeur = monaco.editor.create(zoneEditeur, { ...OPTIONS_EDITEUR, model: null });
    editeur.onDidChangeCursorPosition(() => rendreStatut());
    abonnementMarques = monaco.editor.onDidChangeMarkers((uris) => {
      const doc = documents.get(actif);
      if (doc?.modele && uris.some((u) => u.toString() === doc.modele.uri.toString())) rendreStatut();
    });
    afficher();
    if (o.demande) await ouvrirFichier(o.demande.chemin);
  })();

  return panneau;
}
