// Bouton « Discuter » (à gauche des raccourcis vers les logiciels) : parler avec Claude de
// Toolkit et de tous les projets, sans rien modifier. C'est Claude Code lancé à la racine de
// Toolkit, en lecture seule (voir contexte-claude.js > preparerDiscussion). Chaque sujet est
// une conversation : un onglet par sujet, à reprendre plus tard depuis le menu du bouton.
import * as etat from './etat.js';
import * as actions from './actions.js';
import { ilYA } from './dom.js';
import { ouvrirMenu } from './menu.js';
import { notifier } from './notifications.js';

const CIBLE = { type: 'racine' };

const ongletsOuverts = () => etat.obtenir().onglets
  .filter((o) => o.genre === 'terminal' && o.mode === 'claude' && o.enCours && o.cible.type === CIBLE.type);

function ouvrir(options) {
  actions.ouvrirTerminal({ mode: 'claude', cible: CIBLE, nomCible: 'Discussion', ...options });
}

// Une discussion ouverte où rien n'a encore été demandé (absente de « sessions ») sert de
// nouvelle discussion : recliquer ne les empile pas.
function nouvelle(sessions = []) {
  const vide = ongletsOuverts().find((o) => !sessions.some((s) => s.id === o.idSession));
  if (vide) etat.modifier({ ongletActif: vide.id });
  else ouvrir({ nom: 'Discussion avec Claude' });
}

function reprendre(session) {
  const ouvert = ongletsOuverts().find((o) => o.idSession === session.id);
  if (ouvert) etat.modifier({ ongletActif: ouvert.id });
  else ouvrir({ nom: `Discussion · ${session.titre.slice(0, 40)}`, reprendre: session.id });
}

// Sans aucun sujet précédent, pas de menu : la discussion s'ouvre directement.
export async function ouvrirMenuDiscussion(bouton) {
  let sessions;
  try {
    sessions = await window.toolkit.terminal.sessions(CIBLE);
  } catch (erreur) {
    notifier(erreur.message, 'erreur');
    return;
  }
  if (!sessions.length) {
    nouvelle();
    return;
  }
  const ouverts = ongletsOuverts();
  ouvrirMenu(bouton, [
    { libelle: 'Nouvelle discussion', icone: 'plus', action: () => nouvelle(sessions) },
    'separateur',
    { titre: 'Sujets récents' },
    ...sessions.map((s) => ({
      libelle: s.titre,
      detail: ouverts.some((o) => o.idSession === s.id) ? 'ouverte' : ilYA(s.date),
      icone: 'note',
      infobulle: s.demande && s.demande !== s.titre ? `${s.titre}\n\n${s.demande}` : s.titre,
      action: () => reprendre(s),
    })),
  ]);
}

// Palette et raccourci clavier : pas de bouton sous lequel placer un menu.
export async function nouvelleDiscussion() {
  const sessions = await window.toolkit.terminal.sessions(CIBLE).catch(() => []);
  nouvelle(sessions);
}
