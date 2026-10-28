// Onglet « Importer un projet » : assistant en plusieurs étapes.
// choix de la source -> analyse -> rapport (réglages + risques) -> import -> résultat.
// L'état de l'assistant est local à ce module ; seul l'affichage de l'onglet passe par etat.js.
import { el } from './dom.js';
import { icone } from './icones.js';
import { LIBELLES_TYPES } from './bibliotheque.js';
import * as etat from './etat.js';
import * as actions from './actions.js';

export const ID_IMPORT = 'import';

// Valeurs spéciales de la liste des dépôts partagés (même principe que actions-git.js).
const NOUVEAU = '\u0000nouveau';
const ADRESSE = '\u0000adresse';

const api = window.toolkit.importation;

const panneau = el('section', { id: 'import', classe: 'panneau panneau-reglages inactif' });
document.getElementById('zone-contenu').append(panneau);

// etape : 'choix' | 'analyse' | 'rapport' | 'execution' | 'fini' | 'erreur'
const assistant = {
  etape: 'choix',
  url: '',
  rapport: null,
  choix: null,
  progression: null,
  resultat: null,
  erreur: null,
};

api.surProgression((p) => {
  assistant.progression = p;
  if (assistant.etape === 'analyse' || assistant.etape === 'execution') majProgression();
});

export function element() {
  return panneau;
}

// L'import peut-il être interrompu (fermeture de l'onglet) ?
export function estOccupe() {
  return assistant.etape === 'analyse' || assistant.etape === 'execution';
}

export function abandonner() {
  if (assistant.rapport && assistant.etape === 'rapport') api.abandonner(assistant.rapport.id).catch(() => {});
  Object.assign(assistant, { etape: 'choix', rapport: null, choix: null, resultat: null, erreur: null });
  dessiner();
}

function aller(etape, donnees = {}) {
  Object.assign(assistant, { etape, ...donnees });
  dessiner();
}

// --- Étapes ---------------------------------------------------------------------------------

async function lancerAnalyse(fonction) {
  aller('analyse', { progression: { texte: 'Préparation…' } });
  try {
    const rapport = await fonction();
    const p = rapport.proposition;
    // Dépôts partagés déjà utilisés (pour les proposer) : sans eux, on peut toujours en créer un.
    rapport.depotsPartages = await window.toolkit.git.depotsPartages().catch(() => []);
    aller('rapport', {
      rapport,
      erreurGithub: null,
      choix: {
        nom: p.nom,
        idProjet: p.idProjet,
        type: p.type,
        categorie: p.categorie,
        description: p.description,
        point_entree: p.point_entree || '',
        ouvrir_avec: p.ouvrir_avec,
        technologies: p.technologies,
        lancer: p.lancer,
        actions: p.actions.map((a) => ({ ...a, garder: true })),
        outilsLies: p.outilsHtml.map((o) => ({ ...o, garder: true })),
        exclus: rapport.stats.exclus.filter((e) => !e.suiviParGit).map((e) => e.chemin),
        garderOriginal: false,
        initialiserGit: !rapport.git.estDepot,
        commiterFiche: true,
        github: 'aucun', // 'aucun' | 'prive' | 'partage'
        partageDepot: rapport.depotsPartages[0]?.remote || NOUVEAU,
        partageTexte: rapport.depotsPartages.length ? '' : 'pages-html',
        partageDossier: p.idProjet,
      },
    });
  } catch (e) {
    aller('erreur', { erreur: e.message });
  }
}

async function choisirDossier() {
  const chemin = await api.choisirDossier().catch((e) => aller('erreur', { erreur: e.message }));
  if (chemin) lancerAnalyse(() => api.analyser(chemin));
}

async function choisirFichier() {
  const chemin = await api.choisirFichier().catch((e) => aller('erreur', { erreur: e.message }));
  if (chemin) lancerAnalyse(() => api.analyser(chemin));
}

function cloner() {
  if (!assistant.url.trim()) return;
  lancerAnalyse(() => api.cloner(assistant.url.trim()));
}

function reanalyser() {
  const { rapport } = assistant;
  if (rapport.mode !== 'clone') lancerAnalyse(() => api.analyser(rapport.source));
}

// Choix du dépôt partagé -> { choix: { remote } | { nouveau }, dossier }, ou { erreur }.
function choixPartage(c) {
  const dossier = c.partageDossier.trim();
  const texte = c.partageTexte.trim();
  if (!dossier) return { erreur: 'Indique le nom du dossier de ce projet dans le dépôt partagé.' };
  if (c.partageDepot === NOUVEAU) {
    return texte ? { choix: { nouveau: texte }, dossier } : { erreur: 'Indique le nom du nouveau dépôt partagé (par exemple : pages-html).' };
  }
  if (c.partageDepot === ADRESSE) {
    return /^(https:\/\/|git@)/i.test(texte) ? { choix: { remote: texte }, dossier }
      : { erreur: 'Indique l\'adresse du dépôt partagé, par exemple https://github.com/moi/mes-pages' };
  }
  return { choix: { remote: c.partageDepot }, dossier };
}

async function importer() {
  const c = assistant.choix;
  const partage = c.github === 'partage' ? choixPartage(c) : null;
  if (partage?.erreur) {
    assistant.erreurGithub = partage.erreur;
    dessiner();
    return;
  }
  const { github, partageDepot, partageTexte, partageDossier, ...reste } = c;
  const choix = {
    ...reste,
    creerGithub: github === 'prive',
    partage,
    actions: c.actions.filter((a) => a.garder).map(({ garder, ...a }) => a),
    outilsLies: c.outilsLies.filter((o) => o.garder).map(({ garder, ...o }) => o),
  };
  assistant.erreurGithub = null;
  aller('execution', { progression: { texte: 'Démarrage…' } });
  try {
    const resultat = await api.executer(assistant.rapport.id, choix);
    aller('fini', { resultat });
    actions.chargerProjets();
  } catch (e) {
    aller('erreur', { erreur: e.message });
  }
}

// --- Petits éléments de formulaire ----------------------------------------------------------

function champTexte(libelle, cle, { zone = false, aide, suggestions } = {}) {
  const idListe = suggestions?.length ? `import-${cle}` : null;
  const controle = zone
    ? el('textarea', { rows: 3, onInput: (e) => { assistant.choix[cle] = e.target.value; } })
    : el('input', { type: 'text', list: idListe, onInput: (e) => { assistant.choix[cle] = e.target.value; } });
  controle.value = assistant.choix[cle] || '';
  return el('label', { classe: 'champ-formulaire' },
    el('span', { classe: 'champ-libelle' }, libelle), controle,
    idListe ? el('datalist', { id: idListe }, suggestions.map((s) => el('option', { value: s }))) : null,
    aide ? el('span', { classe: 'champ-aide' }, aide) : null);
}

function champChoix(libelle, cle, options, { aide, desactive, redessiner } = {}) {
  const select = el('select', {
    disabled: Boolean(desactive),
    onChange: (e) => {
      assistant.choix[cle] = e.target.value;
      if (redessiner) dessiner();
    },
  }, options.map(([valeur, texte]) => el('option', { value: valeur }, texte)));
  select.value = assistant.choix[cle] || '';
  return el('label', { classe: 'champ-formulaire' }, el('span', { classe: 'champ-libelle' }, libelle), select,
    aide ? el('span', { classe: 'champ-aide' }, aide) : null);
}

// objet[cle] est modifié par la case ; redessiner : true si d'autres éléments en dépendent.
function caseACocher(libelle, objet, cle, { aide, desactive, redessiner } = {}) {
  const c = el('input', {
    type: 'checkbox',
    disabled: Boolean(desactive),
    onChange: (e) => {
      objet[cle] = e.target.checked;
      if (redessiner) dessiner();
    },
  });
  c.checked = Boolean(objet[cle]);
  return el('label', { classe: `champ-formulaire champ-case${desactive ? ' desactive' : ''}` }, c,
    el('span', { classe: 'champ-libelle' }, libelle),
    aide ? el('span', { classe: 'champ-aide' }, aide) : null);
}

function section(titre, ...contenu) {
  return el('section', { classe: 'section-reglages' }, el('h2', {}, titre), contenu);
}

// --- Rendu des étapes -----------------------------------------------------------------------

function rendreChoix() {
  const champUrl = el('input', {
    type: 'text',
    placeholder: 'https://github.com/moi/mon-projet  ou  moi/mon-projet',
    onInput: (e) => { assistant.url = e.target.value; },
    onKeydown: (e) => { if (e.key === 'Enter') cloner(); },
  });
  champUrl.value = assistant.url;
  return [
    el('p', { classe: 'details-aide' },
      'Toolkit range le projet dans son dossier « projets ». Rien n\'est modifié avant que tu aies vu le rapport et confirmé.'),
    el('div', { classe: 'cartes-import' },
      el('div', { classe: 'carte-import' },
        icone('dossier'),
        el('h3', {}, 'Un dossier de ce PC'),
        el('p', {}, 'Le projet est copié, la copie est vérifiée, puis l\'original part à la Corbeille.'),
        el('button', { classe: 'bouton principal', onClick: choisirDossier }, 'Choisir un dossier…')),
      el('div', { classe: 'carte-import' },
        icone('code'),
        el('h3', {}, 'Un fichier seul'),
        el('p', {}, 'Une page HTML autonome, un script… Toolkit lui crée son propre dossier de projet, puis l\'original part à la Corbeille.'),
        el('button', { classe: 'bouton principal', onClick: choisirFichier }, 'Choisir un fichier…')),
      el('div', { classe: 'carte-import' },
        icone('git'),
        el('h3', {}, 'Un dépôt GitHub'),
        el('p', {}, 'Le dépôt est téléchargé (cloné) directement dans Toolkit.'),
        el('div', { classe: 'champ-chemin page-formulaire' }, champUrl,
          el('button', { classe: 'bouton principal', onClick: cloner }, 'Cloner')))),
    el('p', { classe: 'details-aide' },
      'Avant d\'importer un dossier, ferme les programmes qui l\'utilisent (Android Studio, VS Code, un terminal ouvert dedans…).'),
  ];
}

const barre = el('div', { classe: 'barre-progression' }, el('div'));
const texteProgression = el('p', { classe: 'texte-progression' });

function majProgression() {
  const p = assistant.progression || {};
  texteProgression.textContent = p.texte || '';
  const pourcentage = p.total ? Math.round((p.faits / p.total) * 100) : null;
  barre.classList.toggle('indeterminee', pourcentage === null);
  barre.firstChild.style.setProperty('width', pourcentage === null ? '30%' : `${pourcentage}%`);
}

function rendreProgression(titre) {
  majProgression();
  return [el('div', { classe: 'bloc-progression' }, el('h2', {}, titre), barre, texteProgression)];
}

const ICONES_RISQUES = { bloquant: 'erreur', attention: 'attention', info: 'info' };

function rendreRisques(risques) {
  if (risques.length === 0) return el('p', { classe: 'statut ok' }, icone('coche'), 'Aucun problème détecté.');
  return risques.map((r) => el('div', { classe: `alerte risque-${r.niveau}` },
    icone(ICONES_RISQUES[r.niveau]),
    el('div', {},
      el('strong', {}, r.titre),
      el('p', {}, r.detail),
      r.elements.length
        ? el('details', {}, el('summary', {}, `Voir la liste (${r.elements.length})`),
          el('ul', {}, r.elements.map((e) => el('li', {}, el('code', {}, e)))))
        : null)));
}

function rendreRapport() {
  const { rapport, choix } = assistant;
  const gh = rapport.github;
  const typesOptions = Object.entries(LIBELLES_TYPES);
  const raisonPasGithub = rapport.git.remote ? 'Ce projet est déjà relié à un dépôt distant.'
    : !gh.installe ? 'GitHub CLI (gh) n\'est pas installé : dans PowerShell, « winget install GitHub.cli » puis « gh auth login ».'
      : !gh.connecte ? 'Tu n\'es pas connecté à GitHub : dans PowerShell, tape « gh auth login ».'
        : rapport.git.secretsSuivis.length ? 'Impossible : des fichiers sensibles sont enregistrés dans Git (voir Points d\'attention).'
          : (!rapport.git.estDepot && !choix.initialiserGit) ? 'Il faut d\'abord activer l\'historique Git (case ci-dessus).'
            : null;
  if (raisonPasGithub) choix.github = 'aucun';
  const nomDepot = (remote) => remote.replace(/\.git$/i, '').split('/').pop();

  return [
    el('p', { classe: 'source-import' }, icone({ clone: 'git', fichier: 'code' }[rapport.mode] || 'dossier'), el('code', {}, rapport.source)),
    rapport.mode === 'fichier'
      ? el('p', { classe: 'details-aide' }, 'Ce fichier sera rangé dans un nouveau dossier de projet, à côté de sa fiche projet.json et de son CLAUDE.md.')
      : null,
    el('p', {}, 'Projet détecté : ', el('strong', {}, rapport.proposition.details), ` — ${rapport.stats.fichiers} fichier(s), ${rapport.stats.taille}.`),

    section('Points d\'attention', rendreRisques(rapport.risques)),

    section('Le projet',
      el('div', { classe: 'page-formulaire grille-formulaire' },
        champTexte('Nom', 'nom'),
        champChoix('Type', 'type', typesOptions),
        champTexte('Catégorie', 'categorie', { suggestions: actions.listeCategories().map(([c]) => c) }),
        champTexte('Point d\'entrée', 'point_entree', { aide: 'Fichier principal (page HTML d\'un outil, script…).' }),
        champChoix('Ouvrir avec', 'ouvrir_avec', [['vscode', 'VS Code'], ['android-studio', 'Android Studio'], ['notepad++', 'Notepad++'], ['explorateur', 'Explorateur Windows']])),
      el('div', { classe: 'page-formulaire' }, champTexte('Description', 'description', { zone: true })),
      rapport.ficheExistante ? el('p', { classe: 'details-aide' }, 'Ce projet a déjà une fiche projet.json : elle sera conservée (ces champs ne seront pas utilisés).') : null),

    rapport.stats.exclus.length
      ? section('Dossiers régénérables',
        el('p', { classe: 'details-aide' }, 'Ces dossiers sont recréés automatiquement (compilation, dépendances, configuration de l\'éditeur). Cochés = non copiés : ils partiront à la Corbeille avec l\'original.'),
        el('div', { classe: 'page-formulaire' }, rapport.stats.exclus.map((e) => {
          const c = el('input', {
            type: 'checkbox',
            onChange: (ev) => {
              choix.exclus = ev.target.checked ? [...choix.exclus, e.chemin] : choix.exclus.filter((x) => x !== e.chemin);
            },
          });
          c.checked = choix.exclus.includes(e.chemin);
          return el('label', { classe: 'champ-formulaire champ-case' }, c,
            el('span', { classe: 'champ-libelle' }, el('code', {}, e.chemin)),
            el('span', { classe: 'champ-aide en-ligne' }, `${e.tailleLisible}, ${e.fichiers} fichier(s)`
              + (e.suiviParGit ? ' — enregistré dans Git : copié par défaut' : '')));
        })))
      : null,

    choix.outilsLies.length
      ? section('Outils HTML trouvés dans le projet',
        el('p', { classe: 'details-aide' }, 'Ils apparaîtront dans le panneau du projet et s\'ouvriront dans Toolkit, sans être copiés (tu modifies toujours les mêmes fichiers).'),
        el('div', { classe: 'page-formulaire' }, choix.outilsLies.map((o) => caseACocher(o.nom, o, 'garder', { aide: o.point_entree }))))
      : null,

    choix.actions.length
      ? section('Boutons d\'action proposés',
        el('div', { classe: 'page-formulaire' }, choix.actions.map((a) => caseACocher(a.nom, a, 'garder', { aide: a.commande }))))
      : null,

    section('Git et GitHub',
      el('p', { classe: 'details-aide' }, rapport.git.estDepot
        ? `Historique Git présent${rapport.git.remote ? `, relié à ${rapport.git.remote}` : ', sans dépôt distant'}.`
        : 'Ce projet n\'a pas encore d\'historique Git.'),
      el('div', { classe: 'page-formulaire' },
        rapport.git.estDepot
          ? caseACocher('Enregistrer projet.json et CLAUDE.md dans Git (commit local)', choix, 'commiterFiche')
          : caseACocher('Activer l\'historique Git (recommandé)', choix, 'initialiserGit', { aide: 'Permet de revenir en arrière si une modification se passe mal. Rien n\'est envoyé sur Internet.', redessiner: true }),
        champChoix('Envoyer sur GitHub', 'github', [
          ['aucun', 'Non, pas maintenant'],
          ['prive', 'Dans un nouveau dépôt PRIVÉ, rien que pour ce projet'],
          ['partage', 'Dans un dépôt PARTAGÉ (un dossier par projet)'],
        ], {
          desactive: Boolean(raisonPasGithub),
          redessiner: true,
          aide: raisonPasGithub || `Sur le compte ${gh.compte}. Un .gitignore protège les fichiers sensibles (clés, keystores, .env).`,
        })),
      choix.github === 'partage'
        ? el('div', { classe: 'page-formulaire' },
          el('p', { classe: 'details-aide' }, 'Pratique pour les petits projets (pages HTML…) : un seul dépôt GitHub PRIVÉ commun, '
            + 'avec un dossier pour chacun. L\'historique et le retour arrière restent propres à chaque projet, sur ce PC.'),
          champChoix('Dépôt partagé', 'partageDepot', [
            ...rapport.depotsPartages.map((d) => [d.remote,
              `${nomDepot(d.remote)} (${d.projets.length} projet(s) : ${d.projets.slice(0, 3).join(', ')}${d.projets.length > 3 ? '…' : ''})`]),
            [NOUVEAU, 'Créer un nouveau dépôt privé…'],
            [ADRESSE, 'Un dépôt GitHub qui existe déjà (adresse)…'],
          ], { redessiner: true }),
          choix.partageDepot === NOUVEAU
            ? champTexte('Nom du nouveau dépôt', 'partageTexte', { aide: 'Par exemple : pages-html' })
            : choix.partageDepot === ADRESSE
              ? champTexte('Adresse du dépôt existant', 'partageTexte', { aide: 'Par exemple : https://github.com/moi/mes-pages' })
              : null,
          champTexte('Nom du dossier de ce projet dans le dépôt', 'partageDossier'))
        : null,
      assistant.erreurGithub ? el('div', { classe: 'alerte risque-bloquant' }, icone('erreur'), el('div', {}, assistant.erreurGithub)) : null),

    rapport.mode !== 'clone'
      ? section('L\'original',
        el('div', { classe: 'page-formulaire' },
          caseACocher('Garder aussi l\'original à son emplacement (copie seulement)', choix, 'garderOriginal', {
            aide: 'Sinon, une fois la copie vérifiée, l\'original est envoyé à la Corbeille (récupérable).',
          })))
      : null,

    el('div', { classe: 'boutons-import' },
      el('button', { classe: 'bouton', onClick: abandonner }, 'Annuler'),
      rapport.mode !== 'clone' ? el('button', { classe: 'bouton', onClick: reanalyser }, icone('redemarrer'), 'Analyser à nouveau') : null,
      el('button', {
        classe: 'bouton principal',
        disabled: rapport.bloquant,
        title: rapport.bloquant ? 'Règle d\'abord les points bloquants (en rouge), puis « Analyser à nouveau ».' : '',
        onClick: importer,
      }, icone('importer'), 'Importer')),
  ];
}

function rendreFini() {
  const { resultat } = assistant;
  return [
    el('div', { classe: 'alerte risque-info' }, icone('coche'), el('div', {}, el('strong', {}, 'Import terminé'))),
    el('ul', { classe: 'liste-etapes' }, resultat.etapes.map((e) => el('li', {}, icone('coche'), e))),
    resultat.avertissements.length
      ? el('div', { classe: 'alerte risque-attention' }, icone('attention'),
        el('div', {}, el('strong', {}, 'À savoir'), el('ul', {}, resultat.avertissements.map((a) => el('li', {}, a)))))
      : null,
    el('div', { classe: 'boutons-import' },
      el('button', { classe: 'bouton', onClick: () => aller('choix', { rapport: null, resultat: null }) }, 'Importer un autre projet'),
      el('button', { classe: 'bouton principal', onClick: () => { actions.choisirFiltre({ type: 'tous' }); actions.selectionner(resultat.id); } }, 'Voir le projet')),
  ];
}

function rendreErreur() {
  return [
    el('div', { classe: 'alerte risque-bloquant' }, icone('erreur'), el('div', {}, el('strong', {}, 'L\'import n\'a pas pu se faire'), el('p', {}, assistant.erreur))),
    el('div', { classe: 'boutons-import' }, el('button', { classe: 'bouton principal', onClick: () => aller('choix', { rapport: null }) }, 'Recommencer')),
  ];
}

function dessiner() {
  const contenus = {
    choix: rendreChoix,
    analyse: () => rendreProgression('Analyse du projet…'),
    rapport: rendreRapport,
    execution: () => rendreProgression('Import en cours… ne ferme pas Toolkit'),
    fini: rendreFini,
    erreur: rendreErreur,
  };
  panneau.replaceChildren(el('div', { classe: 'page-reglages page-import' },
    el('h1', {}, 'Importer un projet'),
    contenus[assistant.etape]()));
}

// Appelé à chaque changement d'état global : on ne redessine qu'à l'ouverture de l'onglet
// (les étapes de l'assistant se redessinent elles-mêmes).
let dejaDessine = false;
export function rendre() {
  if (etat.obtenir().importOuvert && !dejaDessine) {
    dejaDessine = true;
    dessiner();
  }
}
