// Panneau d'un terminal intégré (xterm.js) : Claude Code ou PowerShell.
// Le processus tourne dans le processus principal (src/main/terminal.js, node-pty).
import { Terminal } from '../../../node_modules/@xterm/xterm/lib/xterm.mjs';
import { FitAddon } from '../../../node_modules/@xterm/addon-fit/lib/addon-fit.mjs';
import { el } from './dom.js';
import { icone } from './icones.js';
import { informer } from './dialogue.js';
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
  selectionBackground: '#264f78',
  black: '#000000', red: '#cd3131', green: '#0dbc79', yellow: '#e5e510',
  blue: '#2472c8', magenta: '#bc3fbc', cyan: '#11a8cd', white: '#e5e5e5',
  brightBlack: '#666666', brightRed: '#f14c4c', brightGreen: '#23d18b', brightYellow: '#f5f543',
  brightBlue: '#3b8eea', brightMagenta: '#d670d6', brightCyan: '#29b8db', brightWhite: '#e5e5e5',
};

const AIDE_CLAUDE_INTROUVABLE = 'Claude Code est introuvable sur ce PC.\n\n'
  + '1. Ouvre PowerShell (menu Démarrer > tape « PowerShell »).\n'
  + '2. Tape cette commande puis Entrée :\n    irm https://claude.ai/install.ps1 | iex\n'
  + '3. Ferme PowerShell, rouvre-le et tape : claude\n'
  + '   Connecte-toi avec ton compte Claude (abonnement Pro, Max…) quand il te le demande.\n'
  + '4. Redémarre Toolkit (Toolkit > Redémarrer Toolkit).';

// onglet : { id, mode: 'claude' | 'powershell', cible, demande?, chemin? }
// parent : élément où insérer le panneau (il doit être dans la page pour mesurer le terminal).
export function creerPanneauTerminal(onglet, parent) {
  const term = new Terminal({
    fontFamily: "'Cascadia Mono', 'Cascadia Code', Consolas, monospace",
    fontSize: 13,
    cursorBlink: true,
    scrollback: 5000,
    theme: THEME,
  });
  const ajustement = new FitAddon();
  term.loadAddon(ajustement);

  const puce = el('span', { classe: 'statut' });
  const chemin = el('code', { classe: 'chemin-outil' });
  const boutonRelancer = el('button', { classe: 'bouton petit', hidden: true, onClick: () => demarrer({ continuer: true }) },
    icone('redemarrer'), onglet.mode === 'claude' ? 'Reprendre la conversation' : 'Relancer');
  const zone = el('div', { classe: 'conteneur-terminal' });
  const element = el('section', { classe: 'panneau panneau-terminal' },
    el('div', { classe: 'barre-outil' },
      puce,
      boutonRelancer,
      onglet.mode === 'claude'
        ? el('button', { classe: 'bouton petit', title: 'Ouvrir un terminal PowerShell dans le même dossier', onClick: () => actions.ouvrirPowerShell(onglet.cible, onglet.nomCible) }, icone('terminal'), 'PowerShell ici')
        : null,
      onglet.cible.type === 'toolkit'
        ? el('button', { classe: 'bouton petit principal', title: 'Applique les modifications faites au code de Toolkit', onClick: actions.redemarrerToolkit }, icone('redemarrer'), 'Redémarrer Toolkit')
        : null,
      chemin),
    zone);
  parent.append(element);
  term.open(zone);

  let idProcessus = null;

  const ajuster = () => {
    // Pas de mesure possible si le panneau n'a pas de taille (fenêtre réduite…).
    if (zone.clientWidth === 0 || zone.clientHeight === 0) return;
    try {
      ajustement.fit();
    } catch {
      // Mesure impossible pour l'instant : on réessaiera au prochain redimensionnement.
    }
  };
  const observateur = new ResizeObserver(ajuster);
  observateur.observe(zone);

  term.onData((donnees) => { if (idProcessus) api.ecrire(idProcessus, donnees); });
  term.onResize(({ cols, rows }) => { if (idProcessus) api.redimensionner(idProcessus, cols, rows); });

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
    term.write(`\r\n\x1b[90m[Terminé — code ${code}. Clique sur « ${boutonRelancer.textContent} » pour recommencer.]\x1b[0m\r\n`);
    afficherEtat(false, code);
  }

  // premier lancement : avec la demande initiale ; relance : reprend la conversation.
  async function demarrer({ continuer = false } = {}) {
    ajuster();
    const id = crypto.randomUUID();
    idProcessus = id;
    actifs.set(id, { term, surFin });
    afficherEtat(true);
    try {
      const resultat = await api.creer(id, {
        mode: onglet.mode,
        cible: onglet.cible,
        demande: continuer ? undefined : onglet.demande,
        continuer,
        colonnes: term.cols,
        lignes: term.rows,
      });
      chemin.replaceChildren(resultat.chemin || '');
      chemin.title = resultat.chemin || '';
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

  demarrer({ continuer: Boolean(onglet.continuer) });

  return {
    element,
    focus: () => term.focus(),
    estEnCours: () => idProcessus !== null,
    detruire() {
      observateur.disconnect();
      if (idProcessus) api.fermer(idProcessus).catch(() => {});
      actifs.delete(idProcessus);
      term.dispose();
      element.remove();
    },
  };
}
