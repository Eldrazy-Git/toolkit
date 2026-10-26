// Panneau d'un terminal intégré (xterm.js) : Claude Code ou PowerShell.
// Le processus tourne dans le processus principal (src/main/terminal.js, node-pty).
// Pour Claude : boutons « modèle et effort » et « conversations » (reprendre une session).
import { Terminal } from '../../../node_modules/@xterm/xterm/lib/xterm.mjs';
import { FitAddon } from '../../../node_modules/@xterm/addon-fit/lib/addon-fit.mjs';
import { Unicode11Addon } from '../../../node_modules/@xterm/addon-unicode11/lib/addon-unicode11.mjs';
import { el, ilYA } from './dom.js';
import { icone } from './icones.js';
import { informer, choisir, confirmer } from './dialogue.js';
import { notifier } from './notifications.js';
import { ouvrirMenu } from './menu.js';
import * as preferences from './preferences.js';
import * as actions from './actions.js';

const api = window.toolkit.terminal;

// Identifiant du processus -> { term, surFin }
const actifs = new Map();
api.surDonnees((id, donnees) => actifs.get(id)?.term.write(donnees));
api.surFin((id, code) => actifs.get(id)?.surFin(code));

const THEME = {
  background: '#1e1e1e',
  foreground: '#cccccc',
  cursor: '#aeafad',
  cursorAccent: '#1e1e1e',
  selectionBackground: '#264f78',
  scrollbarSliderBackground: 'rgba(121, 121, 121, 0.3)',
  scrollbarSliderHoverBackground: 'rgba(100, 100, 100, 0.6)',
  scrollbarSliderActiveBackground: 'rgba(191, 191, 191, 0.4)',
  black: '#000000', red: '#cd3131', green: '#0dbc79', yellow: '#e5e510',
  blue: '#2472c8', magenta: '#bc3fbc', cyan: '#11a8cd', white: '#e5e5e5',
  brightBlack: '#666666', brightRed: '#f14c4c', brightGreen: '#23d18b', brightYellow: '#f5f543',
  brightBlue: '#3b8eea', brightMagenta: '#d670d6', brightCyan: '#29b8db', brightWhite: '#e5e5e5',
};

// Valeurs acceptées par « claude --model » et « claude --effort » ('' = réglage de Claude Code).
export const MODELES = [
  ['', 'Par défaut', 'celui choisi dans Claude Code'],
  ['fable', 'Fable', 'le plus capable'],
  ['opus', 'Opus', 'très capable'],
  ['sonnet', 'Sonnet', 'équilibré et rapide'],
  ['haiku', 'Haiku', 'le plus rapide'],
];
export const EFFORTS = [
  ['', 'Par défaut', 'celui de Claude Code'],
  ['low', 'Faible', 'réponses rapides'],
  ['medium', 'Moyen', ''],
  ['high', 'Élevé', ''],
  ['xhigh', 'Très élevé', ''],
  ['max', 'Maximum', 'réfléchit le plus longtemps'],
];
const nomDe = (liste, valeur) => liste.find(([v]) => v === valeur)?.[1] || valeur;

const AIDE_CLAUDE_INTROUVABLE = 'Claude Code est introuvable sur ce PC.\n\n'
  + '1. Ouvre PowerShell (menu Démarrer > tape « PowerShell »).\n'
  + '2. Tape cette commande puis Entrée :\n    irm https://claude.ai/install.ps1 | iex\n'
  + '3. Ferme PowerShell, rouvre-le et tape : claude\n'
  + '   Connecte-toi avec ton compte Claude (abonnement Pro, Max…) quand il te le demande.\n'
  + '4. Redémarre Toolkit (Toolkit > Redémarrer Toolkit).';

// onglet : { id, mode: 'claude' | 'powershell', cible, demande?, continuer?, chemin? }
// parent : élément où insérer le panneau (il doit être dans la page pour mesurer le terminal).
export function creerPanneauTerminal(onglet, parent) {
  const estClaude = onglet.mode === 'claude';
  const term = new Terminal({
    fontFamily: "'Cascadia Mono', 'Cascadia Code', Consolas, monospace",
    fontSize: 13,
    lineHeight: 1.1,
    cursorBlink: true,
    scrollback: 10000,
    theme: THEME,
    // Symboles un peu trop larges pour leur case (icônes de Claude Code) : réduits au lieu
    // de déborder sur la case voisine.
    rescaleOverlappingGlyphs: true,
    // ConPTY (Windows) redessine lui-même l'écran quand la taille change : xterm.js ne doit
    // pas aussi réorganiser les lignes, sinon elles se mélangent (zone de saisie de Claude).
    windowsPty: api.buildWindows ? { backend: 'conpty', buildNumber: api.buildWindows } : undefined,
    allowProposedApi: true, // nécessaire pour Unicode 11
  });
  const ajustement = new FitAddon();
  term.loadAddon(ajustement);
  // Largeurs des caractères selon Unicode 11 (comme Claude Code) : sans cela, un symbole
  // compté 1 case par xterm et 2 par Claude décale la suite de la ligne.
  term.loadAddon(new Unicode11Addon());
  term.unicode.activeVersion = '11';

  const puce = el('span', { classe: 'statut' });
  const chemin = el('code', { classe: 'chemin-outil' });
  const boutonRelancer = el('button', { classe: 'bouton petit', hidden: true, onClick: () => demarrer(reprise()) },
    icone('redemarrer'), estClaude ? 'Reprendre la conversation' : 'Relancer');
  const libelleModele = el('span', { classe: 'texte-bouton' });
  const boutonModele = el('button', { classe: 'bouton petit choix-claude', onClick: () => menuModele(boutonModele) },
    icone('claude'), libelleModele, el('span', { classe: 'fleche-menu' }, '▾'));
  const boutonSessions = el('button', { classe: 'bouton petit', title: 'Reprendre une conversation précédente ou en commencer une nouvelle', onClick: () => menuSessions(boutonSessions) },
    icone('historique'), el('span', { classe: 'texte-bouton' }, 'Conversations'), el('span', { classe: 'fleche-menu' }, '▾'));

  // L'hôte du terminal n'a AUCUNE marge intérieure : FitAddon mesure la taille de son parent
  // en comptant les marges (box-sizing: border-box), le terminal aurait sinon une colonne ou
  // une ligne de trop, cachée, et la saisie déborderait sur les lignes voisines.
  const hote = el('div', { classe: 'hote-terminal' });
  const zone = el('div', { classe: 'conteneur-terminal' }, hote);
  const element = el('section', { classe: 'panneau panneau-terminal' },
    el('div', { classe: 'barre-outil' },
      puce,
      boutonRelancer,
      estClaude ? boutonModele : null,
      estClaude ? boutonSessions : null,
      estClaude
        ? el('button', { classe: 'bouton petit', title: 'Ouvrir un terminal PowerShell dans le même dossier', onClick: () => actions.ouvrirPowerShell(onglet.cible, onglet.nomCible) }, icone('terminal'), el('span', { classe: 'texte-bouton' }, 'PowerShell ici'))
        : null,
      onglet.cible.type === 'toolkit'
        ? el('button', { classe: 'bouton petit principal', title: 'Applique les modifications faites au code de Toolkit', onClick: actions.redemarrerToolkit }, icone('redemarrer'), el('span', { classe: 'texte-bouton' }, 'Redémarrer Toolkit'))
        : null,
      chemin),
    zone);
  parent.append(element);
  term.open(hote);

  let idProcessus = null;
  let idSession = null; // conversation Claude affichée (pour la reprendre)
  let dejaLance = false;
  let relanceEnAttente = null; // paramètres de demarrer() après l'arrêt du processus actuel
  // Modèle et effort de cet onglet (undefined = ceux des Réglages).
  let choix = { modele: onglet.modele, effort: onglet.effort };

  const ajuster = () => {
    // Pas de mesure possible si le panneau n'a pas de taille (fenêtre réduite…).
    if (hote.clientWidth === 0 || hote.clientHeight === 0) return;
    try {
      ajustement.fit();
    } catch {
      // Mesure impossible pour l'instant : on réessaiera au prochain redimensionnement.
    }
  };
  const observateur = new ResizeObserver(ajuster);
  observateur.observe(hote);

  term.onData((donnees) => { if (idProcessus) api.ecrire(idProcessus, donnees); });
  // Redimensionnement transmis une fois la taille stable : pendant qu'on tire le bord de la
  // fenêtre, chaque taille intermédiaire ferait redessiner tout l'écran à Claude.
  let minuteurTaille = null;
  term.onResize(() => {
    clearTimeout(minuteurTaille);
    minuteurTaille = setTimeout(() => { if (idProcessus) api.redimensionner(idProcessus, term.cols, term.rows); }, 60);
  });

  // Copier / coller comme dans le Terminal Windows.
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown') return true;
    const touche = e.key.toLowerCase();
    // Ctrl+Tab : laissé à Toolkit (changer d'onglet).
    if (e.ctrlKey && e.key === 'Tab') return false;
    // Ctrl+C avec une sélection : copier (sans sélection, Ctrl+C interrompt comme d'habitude).
    if (e.ctrlKey && touche === 'c' && term.hasSelection()) {
      navigator.clipboard.writeText(term.getSelection());
      term.clearSelection();
      return false;
    }
    // Ctrl+V : laissé au navigateur, qui déclenche le collage géré par xterm.
    if (e.ctrlKey && touche === 'v') return false;
    // Maj+Entrée : retour à la ligne dans la demande à Claude, sans l'envoyer
    // (Échap + Entrée, compris par Claude Code comme Alt+Entrée).
    if (estClaude && e.key === 'Enter' && e.shiftKey && !e.ctrlKey && !e.altKey) {
      if (idProcessus) api.ecrire(idProcessus, '\x1b\r');
      return false;
    }
    return true;
  });
  // Clic droit : copie la sélection, ou colle s'il n'y en a pas.
  zone.addEventListener('contextmenu', async (e) => {
    e.preventDefault();
    if (term.hasSelection()) {
      await navigator.clipboard.writeText(term.getSelection());
      term.clearSelection();
    } else {
      term.paste(await navigator.clipboard.readText());
    }
  });
  // Clic dans la marge autour du terminal : le curseur y revient.
  zone.addEventListener('mousedown', (e) => { if (e.target === zone) queueMicrotask(() => term.focus()); });

  function afficherEtat(enCours, code) {
    puce.className = `statut ${enCours ? 'ok' : 'termine'}`;
    puce.replaceChildren(enCours ? '● En cours' : `Terminé${code === null || code === undefined ? '' : ` (code ${code})`}`);
    boutonRelancer.hidden = enCours;
    // Différé : ce panneau peut être en train d'être créé pendant le rendu des onglets,
    // et modifier l'état maintenant relancerait ce rendu (création en double).
    queueMicrotask(() => actions.marquerTerminal(onglet.id, enCours));
  }

  function surFin(code) {
    actifs.delete(idProcessus);
    idProcessus = null;
    // Arrêt demandé pour relancer (autre modèle, autre conversation) : on enchaîne.
    if (relanceEnAttente) {
      const parametres = relanceEnAttente;
      relanceEnAttente = null;
      term.reset();
      demarrer(parametres);
      return;
    }
    term.write(`\r\n\x1b[90m[Terminé — code ${code}. Clique sur « ${boutonRelancer.textContent} » pour recommencer.]\x1b[0m\r\n`);
    afficherEtat(false, code);
    // Connexion à un compte terminée : la page « Comptes » se met à jour.
    if (onglet.mode === 'connexion') window.dispatchEvent(new CustomEvent('toolkit:comptes'));
  }

  // Reprendre la conversation de cet onglet (ou, à défaut, la plus récente du dossier).
  const reprise = () => (idSession ? { reprendre: idSession } : { continuer: true });

  // Premier lancement : avec la demande initiale. Ensuite : reprise d'une conversation
  // (« reprendre » = son id, « continuer » = la plus récente) ou nouvelle conversation vide.
  async function demarrer({ continuer = false, reprendre } = {}) {
    ajuster();
    const id = crypto.randomUUID();
    idProcessus = id;
    actifs.set(id, { term, surFin });
    afficherEtat(true);
    const premier = !dejaLance;
    dejaLance = true;
    try {
      const resultat = await api.creer(id, {
        mode: onglet.mode,
        cible: onglet.cible,
        connexion: onglet.connexion,
        demande: premier && !continuer ? onglet.demande : undefined,
        continuer,
        reprendre,
        modele: choix.modele,
        effort: choix.effort,
        colonnes: term.cols,
        lignes: term.rows,
      });
      chemin.replaceChildren(resultat.chemin || '');
      chemin.title = resultat.chemin || '';
      if (resultat.idSession) idSession = resultat.idSession;
      if (!resultat.ok) {
        actifs.delete(id);
        idProcessus = null;
        term.write(`\x1b[31m${AIDE_CLAUDE_INTROUVABLE.replace(/\n/g, '\r\n')}\x1b[0m\r\n`);
        afficherEtat(false);
        informer({ titre: 'Claude Code introuvable', message: AIDE_CLAUDE_INTROUVABLE });
      }
    } catch (erreur) {
      actifs.delete(id);
      idProcessus = null;
      term.write(`\x1b[31m${erreur.message}\x1b[0m\r\n`);
      afficherEtat(false);
    }
  }

  // Arrête Claude (s'il tourne) puis le relance avec ces paramètres, dans le même onglet.
  function relancer(parametres) {
    if (!idProcessus) {
      term.reset();
      demarrer(parametres);
      return;
    }
    relanceEnAttente = parametres;
    api.fermer(idProcessus).catch(() => {});
  }

  // --- Modèle et effort ---------------------------------------------------------------------

  const effectif = (cle) => choix[cle] ?? preferences.lire('claude')[cle] ?? '';

  function afficherChoix() {
    const modele = effectif('modele');
    const effort = effectif('effort');
    libelleModele.replaceChildren(!modele && !effort
      ? 'Modèle'
      : `${modele ? nomDe(MODELES, modele) : 'Modèle par défaut'}${effort ? ` · ${nomDe(EFFORTS, effort)}` : ''}`);
    boutonModele.title = `Modèle : ${nomDe(MODELES, modele)} — Effort : ${nomDe(EFFORTS, effort)}\n`
      + 'Pour cet onglet. Les valeurs par défaut se règlent dans Réglages > Claude.';
  }
  if (estClaude) {
    afficherChoix();
    // Réglages > Claude modifiés : le bouton suit (s'il n'a pas de choix propre à l'onglet).
    window.addEventListener('toolkit:preferences', afficherChoix);
  }

  function menuModele(bouton) {
    const element = (cle, [valeur, libelle, detail]) => ({
      libelle,
      detail,
      icone: effectif(cle) === valeur ? 'coche' : null,
      action: () => appliquerChoix({ [cle]: valeur }),
    });
    ouvrirMenu(bouton, [
      { titre: 'Modèle' },
      ...MODELES.map((m) => element('modele', m)),
      'separateur',
      { titre: 'Effort (temps de réflexion)' },
      ...EFFORTS.map((e) => element('effort', e)),
    ]);
  }

  async function appliquerChoix(changement) {
    const cle = Object.keys(changement)[0];
    if (effectif(cle) === changement[cle]) return;
    choix = { ...choix, ...changement };
    afficherChoix();
    if (!idProcessus) return; // utilisé au prochain lancement
    const reponse = await choisir({
      titre: cle === 'modele' ? 'Changer de modèle' : 'Changer l\'effort',
      message: 'Claude doit redémarrer pour en tenir compte : il reprend la même conversation, '
        + 'rien n\'est perdu (une réponse en cours d\'écriture serait seulement interrompue).\n\n'
        + 'Si tu annules, le choix sera utilisé au prochain lancement.',
      boutons: [{ libelle: 'Redémarrer Claude', valeur: true, style: 'principal' }],
    });
    if (reponse) relancer(reprise());
  }

  // --- Conversations précédentes ------------------------------------------------------------

  async function menuSessions(bouton) {
    let sessions;
    try {
      sessions = await api.sessions(onglet.cible);
    } catch (erreur) {
      notifier(erreur.message, 'erreur');
      return;
    }
    ouvrirMenu(bouton, [
      { libelle: 'Nouvelle conversation', icone: 'plus', action: () => changerConversation(null) },
      'separateur',
      { titre: sessions.length ? 'Conversations récentes dans ce dossier' : 'Aucune conversation précédente dans ce dossier' },
      ...sessions.map((s) => ({
        libelle: s.titre,
        detail: s.id === idSession && idProcessus ? 'ouverte ici' : ilYA(s.date),
        icone: s.id === idSession ? 'coche' : 'note',
        infobulle: s.demande && s.demande !== s.titre ? `${s.titre}\n\n${s.demande}` : s.titre,
        action: () => { if (s.id !== idSession || !idProcessus) changerConversation(s); },
      })),
    ]);
  }

  async function changerConversation(session) {
    if (idProcessus) {
      const ok = await confirmer({
        titre: session ? 'Reprendre une conversation' : 'Nouvelle conversation',
        message: `Claude s'arrête dans cet onglet puis ${session ? `reprend « ${session.titre} »` : 'démarre une nouvelle conversation'}.\n\n`
          + 'La conversation actuelle reste enregistrée : tu pourras la reprendre depuis ce même menu.',
        bouton: session ? 'Reprendre' : 'Nouvelle conversation',
      });
      if (!ok) return;
    }
    if (!session) idSession = null;
    relancer(session ? { reprendre: session.id } : {});
  }

  demarrer({ continuer: Boolean(onglet.continuer) });

  return {
    element,
    focus: () => term.focus(),
    estEnCours: () => idProcessus !== null,
    detruire() {
      observateur.disconnect();
      clearTimeout(minuteurTaille);
      window.removeEventListener('toolkit:preferences', afficherChoix);
      relanceEnAttente = null;
      if (idProcessus) api.fermer(idProcessus).catch(() => {});
      actifs.delete(idProcessus);
      term.dispose();
      element.remove();
    },
  };
}
