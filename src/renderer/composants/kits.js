// Onglet « Kits et skills » : bibliothèque personnelle (voir docs/kits.md et src/main/kits.js).
// sectionKitsDuProjet() sert aussi au panneau de détails d'un projet.
import { el } from './dom.js';
import { icone } from './icones.js';
import { ouvrirMenu } from './menu.js';
import { notifier } from './notifications.js';
import { choisir, cocher, confirmer, formulaire } from './dialogue.js';
import * as etat from './etat.js';
import * as actions from './actions.js';
import * as actionsGit from './actions-git.js';
import { boutonVerifier, sectionRapport } from './verification.js';

export const ID_KITS = 'kits';

const api = window.toolkit.kits;
const CIBLE_KITS = { type: 'kits' };
const DUREE_DONNEES = 30000; // relues de temps en temps quand un projet avec des kits est affiché
const TYPES = [
  { valeur: 'html', libelle: 'Outil HTML' },
  { valeur: 'script', libelle: 'Script' },
  { valeur: 'java', libelle: 'Java / Gradle' },
  { valeur: 'android', libelle: 'Android' },
  { valeur: 'autre', libelle: 'Autre' },
];
const FILTRES = [
  { valeur: '', libelle: 'Tous les types de projets' },
  { valeur: 'html', libelle: 'Outil HTML', type: 'html' },
  { valeur: 'python', libelle: 'Script Python', type: 'script', langage: 'python' },
  { valeur: 'node', libelle: 'Script Node', type: 'script', langage: 'node' },
  { valeur: 'java', libelle: 'Java / Gradle', type: 'java' },
  { valeur: 'android', libelle: 'Android', type: 'android' },
  { valeur: 'autre', libelle: 'Autre', type: 'autre' },
];
const LANGAGES = [
  { valeur: '', libelle: 'Tous' },
  { valeur: 'python', libelle: 'Python' },
  { valeur: 'node', libelle: 'Node' },
  { valeur: 'java', libelle: 'Java' },
  { valeur: 'kotlin', libelle: 'Kotlin' },
];

const panneau = el('section', { id: 'kits', classe: 'panneau panneau-reglages inactif' });
document.getElementById('zone-contenu').append(panneau);

export function element() {
  return panneau;
}

// --- Données ---------------------------------------------------------------------------------

let lecture = null;

export function chargerKits() {
  if (lecture) return lecture;
  lecture = api.lister()
    .then((donnees) => {
      const avant = etat.obtenir().kits?.propositions?.length;
      etat.modifier({ kits: donnees, kitsDate: Date.now() });
      if (avant !== undefined && donnees.propositions.length > avant) {
        notifier('Claude propose un nouveau kit ou skill : à accepter ou à refuser dans l\'onglet « Kits et skills ».');
      }
    })
    .catch((erreur) => {
      etat.modifier({ kitsDate: Date.now() }); // pas de nouvel essai à chaque rendu
      notifier(erreur.message, 'erreur');
    })
    .finally(() => { lecture = null; });
  return lecture;
}

// Compare deux versions X.Y.Z : > 0 si a est plus récente que b.
function comparerVersions(a, b) {
  const x = String(a).split('.').map(Number);
  const y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i += 1) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
}

function libelleTypes(k) {
  if (k.types === 'tous') return 'Tous les types';
  const noms = (Array.isArray(k.types) ? k.types : []).map((t) => TYPES.find((x) => x.valeur === t)?.libelle || t);
  return k.langages?.length ? `${noms.join(', ')} (${k.langages.join(', ')})` : noms.join(', ');
}

function correspondAuFiltre(k, filtre) {
  if (!filtre) return true;
  if (k.erreur) return true; // à corriger : reste visible quel que soit le filtre
  const f = FILTRES.find((x) => x.valeur === filtre);
  if (!f) return true;
  if (k.types !== 'tous' && !k.types.includes(f.type)) return false;
  return !f.langage || !k.langages || k.langages.includes(f.langage);
}

// Projets qui utilisent ce kit : [{ projet, version, retard }]
function projetsUtilisateurs(k) {
  return etat.obtenir().projets
    .map((projet) => ({ projet, entree: projet.fiche.kits?.find((e) => e.id === k.id) }))
    .filter((u) => u.entree)
    .map(({ projet, entree }) => ({ projet, version: entree.version, retard: comparerVersions(k.version, entree.version) > 0 }));
}

// --- Actions ---------------------------------------------------------------------------------

async function essayer(fonction) {
  try {
    return await fonction();
  } catch (erreur) {
    notifier(erreur.message, 'erreur');
    return undefined;
  }
}

function demandeAmeliorerKit(k) {
  return `Je veux améliorer le kit « ${k.nom} » (dossier \`${k.id}/\`). Commence par lire son kit.json, son guide et ses fichiers, `
    + 'puis demande-moi ce que je veux changer. Quand c\'est fait, augmente sa version et fais un commit local.';
}

function demandeCorrigerKit(k) {
  return `Le kit « ${k.id} » est inutilisable : ${k.erreur}\nCorrige son kit.json en suivant le format décrit dans CLAUDE.md, puis fais un commit local.`;
}

function demandeAmeliorerSkill(s) {
  return `Je veux améliorer le skill « ${s.id} » (\`.claude/skills/${s.id}/SKILL.md\`). Lis-le, puis demande-moi ce que je veux changer. Quand c'est fait, fais un commit local.`;
}

function demandeContenuKit(cree, valeurs) {
  return `Écris le contenu du kit « ${cree.nom} » (dossier \`${cree.id}/\`), que je viens de créer. Ce qu'il doit faire : ${valeurs.description}\n`
    + 'Remplis ses fichiers et son guide (ou ses règles). Il doit rester réutilisable tel quel, sans rien de propre à un projet. '
    + 'Pose-moi tes questions avant de commencer, puis fais un commit local.';
}

function demandeContenuSkill(cree, valeurs) {
  return `Écris le skill « ${cree.id} » (\`.claude/skills/${cree.id}/SKILL.md\`), que je viens de créer. Ce qu'il doit faire : ${valeurs.description}\n`
    + 'Pose-moi tes questions avant de commencer, puis fais un commit local.';
}

function demandeKitDepuisProjet(cree) {
  return `Le kit « ${cree.nom} » (dossier \`${cree.id}/\`) vient d'être copié depuis le projet « ${cree.projet} », qui n'a pas été modifié. `
    + 'Rends-le réutilisable tel quel : lis ses fichiers, retire ou remplace par des variables tout ce qui est propre à ce projet (noms, chemins, textes, réglages), '
    + `${cree.paquet ? `vérifie le remplacement du package \`${cree.paquet}\`, ` : ''}écris son guide et ajuste kit.json (destinations, variables, types, \`adaptation\`). `
    + 'Montre-moi ce que tu changes, puis fais un commit local.';
}

// Proposé après une création : le contenu du kit reste à écrire.
async function proposerClaude(titre, message, demande) {
  const choix = await choisir({
    titre,
    message,
    boutons: [
      { libelle: 'Plus tard', valeur: 'plus-tard' },
      { libelle: 'Continuer avec Claude', valeur: 'claude', style: 'principal' },
    ],
  });
  if (choix === 'claude') await actions.ameliorerKitsAvecClaude(demande);
}

function champsTypes(cochees = []) {
  return TYPES.map((t) => ({ id: `type_${t.valeur}`, libelle: t.libelle, type: 'case', valeur: cochees.includes(t.valeur) }));
}

function typesChoisis(valeurs) {
  const types = TYPES.filter((t) => valeurs[`type_${t.valeur}`]).map((t) => t.valeur);
  return types.length ? types : 'tous';
}

const AIDE_TYPES = 'Types de projets : coche ceux qui conviennent ci-dessous. Aucune case cochée = tous les types.';

async function creerKit() {
  const valeurs = await formulaire({
    titre: 'Créer un kit',
    message: AIDE_TYPES,
    champs: [
      { id: 'nom', libelle: 'Nom', obligatoire: true, exemple: 'Par exemple : Journal d\'erreurs' },
      { id: 'description', libelle: 'Ce qu\'il fait, en une ligne', obligatoire: true },
      { id: 'genre', libelle: 'Contenu', type: 'choix', valeur: 'code', options: [
        { valeur: 'code', libelle: 'Du code à copier dans les projets' },
        { valeur: 'regles', libelle: 'Seulement des règles pour Claude' },
      ] },
      ...champsTypes(),
      { id: 'langage', libelle: 'Langage (pour un kit de code)', type: 'choix', valeur: '', options: LANGAGES },
    ],
    bouton: 'Créer',
  });
  if (!valeurs) return;
  const cree = await essayer(() => api.creer({
    nom: valeurs.nom,
    description: valeurs.description,
    genre: valeurs.genre,
    types: typesChoisis(valeurs),
    langages: valeurs.langage ? [valeurs.langage] : null,
  }));
  if (!cree) return;
  await chargerKits();
  actionsGit.rafraichir(CIBLE_KITS);
  await proposerClaude('Kit créé', `« ${cree.nom} » est dans ta bibliothèque (dossier kits/${cree.id}). Il reste à écrire son contenu : Claude peut s'en charger.`, demandeContenuKit(cree, valeurs));
}

async function creerSkill() {
  const valeurs = await formulaire({
    titre: 'Créer un skill',
    message: 'Un skill donne à Claude des instructions pour une tâche précise, dans tous tes projets.',
    champs: [
      { id: 'nom', libelle: 'Nom', obligatoire: true, exemple: 'Par exemple : Revue de code' },
      { id: 'description', libelle: 'Ce qu\'il fait et quand l\'utiliser', obligatoire: true, aide: 'Claude s\'en sert pour décider quand utiliser ce skill.' },
    ],
    bouton: 'Créer',
  });
  if (!valeurs) return;
  const cree = await essayer(() => api.creerSkill(valeurs));
  if (!cree) return;
  await chargerKits();
  actionsGit.rafraichir(CIBLE_KITS);
  await proposerClaude('Skill créé', `« ${cree.id} » est dans ta bibliothèque. Il reste à écrire ses instructions : Claude peut s'en charger.`, demandeContenuSkill(cree, valeurs));
}

async function creerDepuisProjet() {
  const { projets, selection } = etat.obtenir();
  const utilisables = projets.filter((p) => !p.erreur);
  if (!utilisables.length) {
    notifier('Aucun projet disponible pour créer un kit.', 'erreur');
    return;
  }
  const depart = await formulaire({
    titre: 'Créer un kit depuis un projet',
    message: 'Tu choisis ensuite les fichiers à reprendre. Le projet n\'est pas modifié.',
    champs: [{
      id: 'projet',
      libelle: 'Projet',
      type: 'choix',
      valeur: utilisables.some((p) => p.id === selection) ? selection : utilisables[0].id,
      options: utilisables.map((p) => ({ valeur: p.id, libelle: p.fiche.nom })),
    }],
    bouton: 'Choisir les fichiers',
  });
  if (!depart) return;
  const analyse = await essayer(() => api.analyserProjet(depart.projet));
  if (!analyse) return;
  if (!analyse.fichiers.length) {
    notifier('Ce projet n\'a aucun fichier utilisable dans un kit.', 'erreur');
    return;
  }
  const selectionFichiers = await cocher({
    titre: `Fichiers de « ${analyse.nom} » à mettre dans le kit`,
    message: `Coche seulement ce qui est réutilisable. Fichiers sensibles, fichiers ignorés par Git et dossiers générés ne sont pas proposés.${analyse.tronque ? ` Seuls les ${analyse.fichiers.length} premiers fichiers sont affichés.` : ''}`,
    elements: analyse.fichiers.map((f) => ({ valeur: f, libelle: f })),
    filtrable: true,
    bouton: 'Continuer',
  });
  if (!selectionFichiers) return;
  if (!selectionFichiers.choisis.length) {
    notifier('Coche au moins un fichier à mettre dans le kit.', 'erreur');
    return;
  }
  const valeurs = await formulaire({
    titre: 'Créer un kit depuis un projet',
    message: `${selectionFichiers.choisis.length} fichier(s) de « ${analyse.nom} ». ${AIDE_TYPES}`,
    champs: [
      { id: 'nom', libelle: 'Nom du kit', obligatoire: true },
      { id: 'description', libelle: 'Ce qu\'il fait, en une ligne', obligatoire: true },
      ...champsTypes([analyse.type]),
    ],
    bouton: 'Créer le kit',
  });
  if (!valeurs) return;
  const cree = await essayer(() => api.creerDepuisProjet({
    projet: analyse.id,
    chemins: selectionFichiers.choisis,
    nom: valeurs.nom,
    description: valeurs.description,
    types: typesChoisis(valeurs),
  }));
  if (!cree) return;
  await chargerKits();
  actionsGit.rafraichir(CIBLE_KITS);
  await proposerClaude('Kit créé : à relire',
    `${cree.fichiers} fichier(s) copié(s) dans kits/${cree.id}.${cree.paquet ? ` Le package ${cree.paquet} est remplacé par une variable.` : ''}\n\nCes fichiers peuvent encore contenir des éléments propres à « ${cree.projet} » : Claude peut les retirer et écrire le guide.`,
    demandeKitDepuisProjet(cree));
}

// --- Propositions de Claude ------------------------------------------------------------------

async function accepterProposition(p) {
  const ou = p.genre === 'kit' ? `kits/${p.id}` : `kits/.claude/skills/${p.id}`;
  const ok = await confirmer({
    titre: `Accepter « ${p.nom} »`,
    message: `${p.fichiers.length} fichier(s) entreront dans ta bibliothèque (${ou}) et dans son historique Git. Claude pourra ensuite ${p.genre === 'kit' ? 'l\'utiliser dans tes projets' : 'utiliser ce skill'}.`
      + (p.avertissements.length ? `\n\nÀ vérifier avant d'accepter :\n${p.avertissements.map((a) => `• ${a}`).join('\n')}` : ''),
    bouton: 'Accepter',
  });
  if (!ok) return;
  const resultat = await essayer(() => api.accepterProposition(p.id));
  await chargerKits();
  if (resultat) {
    actionsGit.rafraichir(CIBLE_KITS);
    notifier(`« ${resultat.nom} » est dans ta bibliothèque.`, 'succes');
  }
}

async function refuserProposition(p) {
  const ok = await confirmer({
    titre: `Refuser « ${p.nom} »`,
    message: 'La proposition part à la Corbeille et n\'entre pas dans ta bibliothèque. Toolkit note ce refus pour que Claude ne la propose plus.',
    bouton: 'Refuser',
    danger: true,
  });
  if (!ok) return;
  await essayer(() => api.refuserProposition(p.id));
  await chargerKits();
}

function demandeProposition(p) {
  const correction = p.problemes.length ? ` Elle ne peut pas être acceptée pour l'instant :\n${p.problemes.map((t) => `- ${t}`).join('\n')}\nCorrige ces problèmes.` : ' Lis-la, puis demande-moi ce que je veux changer.';
  return `Je veux retoucher la proposition \`propositions/${p.id}/\` avant de décider.${correction} Reste dans ce dossier : elle n'entre pas dans la bibliothèque tant que je ne l'ai pas acceptée dans Toolkit.`;
}

function ligneProposition(p) {
  const fichierPrincipal = p.genre === 'skill' ? 'SKILL.md' : p.genre === 'kit' ? 'kit.json' : p.fichiers[0];
  const menu = el('button', {
    classe: 'bouton-icone',
    title: 'Autres actions',
    onClick: () => ouvrirMenu(menu, [
      { libelle: 'Voir les fichiers', icone: 'code', action: () => actions.ouvrirCode(CIBLE_KITS, 'Kits et skills', fichierPrincipal ? `propositions/${p.id}/${fichierPrincipal}` : null) },
      { libelle: 'Retoucher avec Claude', icone: 'claude', action: () => actions.ameliorerKitsAvecClaude(demandeProposition(p)) },
    ]),
  }, icone('points'));
  const bloquee = p.problemes.length > 0;
  return el('div', { classe: 'ligne-git ligne-kit ligne-proposition' },
    el('div', { classe: 'ligne-git-infos' },
      el('div', { classe: 'ligne-git-nom' },
        el('strong', {}, p.nom),
        p.version ? el('span', { classe: 'etiquette' }, p.version) : null,
        el('span', { classe: 'etiquette type' }, p.genre === 'skill' ? 'Skill' : 'Kit'),
        el('span', { classe: 'details-aide' }, p.genre === 'kit' && !bloquee ? libelleTypes(p) : '')),
      p.description ? el('p', { classe: 'kit-description' }, p.description) : null,
      p.motif ? el('p', { classe: 'details-aide proposition-motif' }, p.motif) : null,
      bloquee ? el('div', { classe: 'alerte erreur proposition-alerte' }, icone('erreur'),
        el('div', {}, 'À corriger avant de pouvoir l\'accepter :', el('ul', {}, p.problemes.map((t) => el('li', {}, t))))) : null,
      p.avertissements.length ? el('div', { classe: 'alerte attention proposition-alerte' }, icone('attention'),
        el('div', {}, 'Peut-être propre à un projet ou à ce PC :', el('ul', {}, p.avertissements.map((t) => el('li', {}, t))))) : null),
    el('div', { classe: 'ligne-git-boutons' },
      el('button', { classe: 'bouton petit principal', disabled: bloquee, title: bloquee ? 'À corriger d\'abord (voir la liste)' : 'Faire entrer cette proposition dans ta bibliothèque', onClick: () => accepterProposition(p) }, icone('coche'), 'Accepter'),
      el('button', { classe: 'bouton petit', title: 'Envoyer cette proposition à la Corbeille', onClick: () => refuserProposition(p) }, icone('croix'), 'Refuser'),
      menu));
}

function sectionPropositions(propositions) {
  if (!propositions.length) return null;
  return [
    el('h2', { classe: 'titre-kits' }, `Propositions de Claude (${propositions.length})`),
    el('p', { classe: 'details-aide' }, 'Rien de tout cela n\'est utilisé tant que tu ne l\'as pas accepté.'),
    el('div', { classe: 'liste-git' }, propositions.map(ligneProposition)),
  ];
}

// --- Affichage -------------------------------------------------------------------------------

function ligneUtilisateurs(k) {
  const utilisateurs = projetsUtilisateurs(k);
  if (!utilisateurs.length) return el('p', { classe: 'details-aide kit-utilisateurs' }, 'Utilisé par aucun projet.');
  return el('div', { classe: 'kit-utilisateurs' },
    el('span', { classe: 'details-aide' }, `Utilisé par ${utilisateurs.length} projet(s) :`),
    utilisateurs.map((u) => el('button', {
      classe: `etiquette${u.retard ? ' kit-retard' : ''}`,
      title: u.retard ? `Ce projet a la version ${u.version} ; la bibliothèque a la version ${k.version}. Clique pour voir le projet.` : `Version ${u.version}. Clique pour voir le projet.`,
      onClick: () => actions.allerAuProjet(u.projet.id),
    }, u.projet.fiche.nom, ` · ${u.version}`)));
}

function ligneKit(k) {
  const menu = el('button', {
    classe: 'bouton-icone',
    title: 'Autres actions',
    onClick: () => ouvrirMenu(menu, [
      { libelle: 'Voir les fichiers', icone: 'code', action: () => actions.ouvrirCode(CIBLE_KITS, 'Kits et skills', `${k.id}/kit.json`) },
    ]),
  }, icone('points'));
  return el('div', { classe: 'ligne-git ligne-kit' },
    el('div', { classe: 'ligne-git-infos' },
      el('div', { classe: 'ligne-git-nom' },
        el('strong', {}, k.nom),
        k.version ? el('span', { classe: 'etiquette' }, k.version) : null,
        el('span', { classe: 'etiquette type' }, k.genre === 'regles' ? 'Règles' : 'Code'),
        el('span', { classe: 'details-aide' }, k.erreur ? '' : libelleTypes(k))),
      k.erreur
        ? el('div', { classe: 'liste-pastilles' }, el('span', { classe: 'pastille-git rouge', title: k.erreur }, 'À corriger'), el('span', { classe: 'details-aide' }, k.erreur))
        : el('p', { classe: 'kit-description' }, k.description),
      k.erreur ? null : ligneUtilisateurs(k)),
    el('div', { classe: 'ligne-git-boutons' },
      el('button', {
        classe: 'bouton petit',
        title: 'Sauvegarde la bibliothèque avec Git puis ouvre Claude dans son dossier',
        onClick: () => actions.ameliorerKitsAvecClaude(k.erreur ? demandeCorrigerKit(k) : demandeAmeliorerKit(k)),
      }, icone('claude'), k.erreur ? 'Corriger avec Claude' : 'Améliorer avec Claude'),
      menu));
}

function ligneSkill(s) {
  const menu = el('button', {
    classe: 'bouton-icone',
    title: 'Autres actions',
    onClick: () => ouvrirMenu(menu, [
      { libelle: 'Voir le fichier', icone: 'code', action: () => actions.ouvrirCode(CIBLE_KITS, 'Kits et skills', `.claude/skills/${s.id}/SKILL.md`) },
    ]),
  }, icone('points'));
  return el('div', { classe: 'ligne-git ligne-kit' },
    el('div', { classe: 'ligne-git-infos' },
      el('div', { classe: 'ligne-git-nom' }, el('strong', {}, s.id), el('span', { classe: 'etiquette type' }, 'Skill')),
      el('p', { classe: 'kit-description' }, s.description || '(sans description)')),
    el('div', { classe: 'ligne-git-boutons' },
      el('button', {
        classe: 'bouton petit',
        title: 'Sauvegarde la bibliothèque avec Git puis ouvre Claude dans son dossier',
        onClick: () => actions.ameliorerKitsAvecClaude(demandeAmeliorerSkill(s)),
      }, icone('claude'), 'Améliorer avec Claude'),
      menu));
}

function pageAbsente() {
  return [
    el('p', { classe: 'details-aide' }, 'Tes kits et tes skills sont du code et des règles réutilisables dans tous tes projets. Toolkit n\'en fournit aucun : ils t\'appartiennent. La bibliothèque est créée à ta première utilisation.'),
    el('div', { classe: 'details-boutons' },
      el('button', { classe: 'bouton principal', onClick: actionsGit.creerBibliotheque }, icone('plus'), 'Créer la bibliothèque'),
      el('button', { classe: 'bouton', title: 'Sur un autre PC : copie ton dépôt GitHub privé de kits', onClick: recupererDepuisGithub }, icone('importer'), 'Récupérer depuis GitHub')),
  ];
}

async function recupererDepuisGithub() {
  await actionsGit.chargerGithub();
  await actionsGit.recupererBibliotheque();
}

export function rendre() {
  const { kitsOuvert, kits: donnees, kitsDate, kitsFiltre } = etat.obtenir();
  if (!kitsOuvert) return;
  if (!donnees && !kitsDate) queueMicrotask(chargerKits);
  const filtre = el('select', {
    classe: 'champ-select filtre-kits',
    title: 'Montrer seulement ce qui convient à ce type de projet',
    onChange: () => etat.modifier({ kitsFiltre: filtre.value }),
  }, FILTRES.map((f) => el('option', { value: f.valeur }, f.libelle)));
  filtre.value = kitsFiltre;
  const kits = (donnees?.kits || []).filter((k) => correspondAuFiltre(k, kitsFiltre));
  // Un skill vaut pour tous les types de projets : le filtre ne le cache pas.
  const skills = donnees?.skills || [];
  const entete = el('div', { classe: 'entete-git' },
    el('h1', {}, 'Kits et skills'),
    donnees?.existe ? el('div', { classe: 'details-boutons' },
      el('button', { classe: 'bouton', onClick: chargerKits }, icone('redemarrer'), 'Actualiser'),
      boutonVerifier(),
      el('button', { classe: 'bouton', title: 'Ouvre Claude dans la bibliothèque (sauvegarde Git avant)', onClick: () => actions.ameliorerKitsAvecClaude() }, icone('claude'), 'Améliorer avec Claude'),
      el('button', { classe: 'bouton', title: 'Commit, Push, Pull et dépôt GitHub privé de la bibliothèque', onClick: actions.ouvrirGit }, icone('git'), 'Git et GitHub')) : null);
  if (!donnees) {
    panneau.replaceChildren(el('div', { classe: 'page-reglages page-git' }, entete, el('p', { classe: 'details-aide' }, 'Chargement…')));
    return;
  }
  if (!donnees.existe) {
    panneau.replaceChildren(el('div', { classe: 'page-reglages page-git' }, entete, pageAbsente()));
    return;
  }
  panneau.replaceChildren(el('div', { classe: 'page-reglages page-git' },
    entete,
    el('p', { classe: 'details-aide legende-git' }, 'Du code et des règles réutilisables, à toi : Toolkit n\'en fournit aucun. Claude consulte ce catalogue avant de coder et ajoute les kits aux projets.'),
    el('div', { classe: 'details-boutons barre-kits' },
      filtre,
      el('button', { classe: 'bouton principal', onClick: creerKit }, icone('plus'), 'Créer un kit'),
      el('button', { classe: 'bouton', onClick: creerSkill }, icone('plus'), 'Créer un skill'),
      el('button', { classe: 'bouton', title: 'Reprendre des fichiers d\'un projet de n\'importe quel type', onClick: creerDepuisProjet }, icone('importer'), 'Créer depuis un projet')),
    sectionRapport(),
    sectionPropositions(donnees.propositions || []),
    el('h2', { classe: 'titre-kits' }, `Kits (${kits.length})`),
    kits.length
      ? el('div', { classe: 'liste-git' }, kits.map(ligneKit))
      : el('p', { classe: 'details-aide' }, kitsFiltre && donnees.kits.length ? 'Aucun kit pour ce type de projet.' : 'Aucun kit pour l\'instant.'),
    el('h2', { classe: 'titre-kits' }, `Skills (${skills.length})`),
    skills.length
      ? el('div', { classe: 'liste-git' }, skills.map(ligneSkill))
      : el('p', { classe: 'details-aide' }, 'Aucun skill pour l\'instant.')));
}

// --- Détails d'un projet : signal de mise à jour (jamais de mise à jour automatique) -------------

function demandeMiseAJour(projet, entree, kit) {
  return `Mets à jour le kit « ${kit.nom} » de ce projet, de la version ${entree.version} à la version ${kit.version}. `
    + `La bibliothèque est ouverte dans ta session : compare ce projet avec \`kits/${kit.id}/\` (kit.json, fichiers, guide, règles), `
    + 'reporte les changements en gardant ce qui a été adapté à ce projet, puis mets à jour la version dans projet.json (champ « kits ») '
    + `et la section \`toolkit:kit=${kit.id}=\` de CLAUDE.md. Ne modifie pas la bibliothèque. Montre-moi ce que tu changes, puis fais un commit local.`;
}

export function sectionKitsDuProjet(projet) {
  const entrees = projet.fiche.kits || [];
  if (!entrees.length) return null;
  const { kits: donnees, kitsDate } = etat.obtenir();
  if (Date.now() - kitsDate > DUREE_DONNEES) queueMicrotask(chargerKits);
  return el('section', { classe: 'details-section' },
    el('h3', {}, 'Kits'),
    el('div', { classe: 'liste-kits-projet' }, entrees.map((entree) => {
      const kit = donnees?.kits.find((k) => k.id === entree.id);
      const disponible = kit && !kit.erreur && comparerVersions(kit.version, entree.version) > 0;
      return el('div', { classe: 'ligne-kit-projet' },
        el('span', { classe: 'etiquette', title: kit?.description || entree.id }, kit?.nom || entree.id, ` · ${entree.version}`),
        disponible
          ? [
            el('span', { classe: 'pastille-git orange', title: 'Rien n\'est mis à jour automatiquement : c\'est toi qui décides.' }, `Version ${kit.version} disponible`),
            el('button', { classe: 'bouton petit', title: 'Sauvegarde le projet avec Git puis demande à Claude de reporter la nouvelle version', onClick: () => actions.modifierAvecClaude(projet, demandeMiseAJour(projet, entree, kit)) }, icone('claude'), 'Mettre à jour avec Claude'),
          ]
          : null,
        donnees && !kit ? el('span', { classe: 'details-aide' }, 'Absent de ta bibliothèque') : null);
    })));
}
