// Barre de raccourcis vers des logiciels du PC, au-dessus de la barre d'onglets.
// Clic = lancer ; clic droit = renommer, déplacer, retirer… ; glisser = changer l'ordre.
// Les chemins restent dans le processus principal (src/main/logiciels.js) : ici, des ids.
import { el } from './dom.js';
import { icone } from './icones.js';
import { ouvrirMenu } from './menu.js';
import { demanderTexte, choisir } from './dialogue.js';
import { notifier } from './notifications.js';

const api = window.toolkit.logiciels;
const barre = document.getElementById('logiciels');

let liste = []; // [{ id, nom, chemin, icone, existe }]
let glisse = null; // id du raccourci en cours de déplacement

async function essayer(fonction) {
  try {
    return await fonction();
  } catch (erreur) {
    notifier(erreur.message, 'erreur');
    return undefined;
  }
}

export async function charger() {
  await essayer(async () => {
    liste = await api.lister();
  });
  rendre();
}

async function puisRecharger(fonction) {
  await essayer(fonction);
  await charger();
}

async function ajouter() {
  const ajoute = await essayer(() => api.ajouter());
  if (!ajoute) return;
  await charger();
  const nom = await demanderTexte({ titre: 'Nom du raccourci', message: 'Le nom affiché dans la barre.', valeur: ajoute.nom, bouton: 'Ajouter' });
  if (nom && nom !== ajoute.nom) await puisRecharger(() => api.renommer(ajoute.id, nom));
  else if (nom === null) await puisRecharger(() => api.supprimer(ajoute.id)); // Annuler = ne pas l'ajouter
}

async function renommer(logiciel) {
  const nom = await demanderTexte({ titre: 'Renommer le raccourci', valeur: logiciel.nom, bouton: 'Renommer' });
  if (nom && nom !== logiciel.nom) await puisRecharger(() => api.renommer(logiciel.id, nom));
}

async function lancer(logiciel) {
  if (!logiciel.existe) {
    const choix = await choisir({
      titre: `« ${logiciel.nom} » est introuvable`,
      message: `Le programme n'est plus à cet emplacement (${logiciel.chemin}). Il a peut-être été déplacé ou désinstallé.`,
      boutons: [
        { libelle: 'Retirer de la barre', valeur: 'retirer' },
        { libelle: 'Choisir un autre emplacement…', valeur: 'changer', style: 'principal' },
      ],
    });
    if (choix === 'retirer') await puisRecharger(() => api.supprimer(logiciel.id));
    if (choix === 'changer') await puisRecharger(() => api.changer(logiciel.id));
    return;
  }
  if (await essayer(() => api.lancer(logiciel.id)) !== undefined) notifier(`${logiciel.nom} se lance…`);
}

function menu(logiciel, position) {
  const index = liste.indexOf(logiciel);
  ouvrirMenu(position, [
    { libelle: 'Lancer', icone: 'lecture', action: () => lancer(logiciel) },
    { libelle: 'Renommer…', icone: 'crayon', action: () => renommer(logiciel) },
    { libelle: 'Choisir un autre emplacement…', icone: 'dossier', action: () => puisRecharger(() => api.changer(logiciel.id)) },
    { libelle: 'Afficher dans l\'Explorateur', icone: 'ouvrirAvec', desactive: !logiciel.existe, action: () => essayer(() => api.afficher(logiciel.id)) },
    'separateur',
    { libelle: 'Déplacer à gauche', desactive: index <= 0, action: () => puisRecharger(() => api.deplacer(logiciel.id, index - 1)) },
    { libelle: 'Déplacer à droite', desactive: index >= liste.length - 1, action: () => puisRecharger(() => api.deplacer(logiciel.id, index + 1)) },
    'separateur',
    { libelle: 'Retirer de la barre', icone: 'croix', action: () => puisRecharger(() => api.supprimer(logiciel.id)) },
  ]);
}

function bouton(logiciel, index) {
  return el('button', {
    classe: `logiciel${logiciel.existe ? '' : ' introuvable'}`,
    title: logiciel.existe ? `${logiciel.nom}\n${logiciel.chemin}\n(clic droit : options)` : `${logiciel.nom} : introuvable`,
    draggable: 'true',
    onClick: () => lancer(logiciel),
    onContextmenu: (e) => {
      e.preventDefault();
      menu(logiciel, { x: e.clientX, y: e.clientY });
    },
    onDragstart: (e) => {
      glisse = logiciel.id;
      e.dataTransfer.effectAllowed = 'move';
    },
    onDragend: () => { glisse = null; },
    onDragover: (e) => {
      if (glisse && glisse !== logiciel.id) e.preventDefault();
    },
    onDrop: (e) => {
      e.preventDefault();
      const id = glisse;
      glisse = null;
      if (id && id !== logiciel.id) puisRecharger(() => api.deplacer(id, index));
    },
  },
  logiciel.icone ? el('img', { classe: 'logiciel-icone', src: logiciel.icone, alt: '' }) : icone(logiciel.existe ? 'outil' : 'attention'),
  el('span', { classe: 'logiciel-nom' }, logiciel.nom));
}

export function rendre() {
  barre.replaceChildren(
    ...liste.map(bouton),
    el('button', {
      classe: liste.length ? 'bouton-icone logiciel-ajouter' : 'logiciel logiciel-ajouter vide',
      title: 'Ajouter un raccourci vers un logiciel du PC',
      onClick: ajouter,
    }, icone('plus'), liste.length ? null : el('span', { classe: 'logiciel-nom' }, 'Ajouter un logiciel')),
  );
}
