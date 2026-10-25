// Terminaux intégrés (node-pty) : Claude Code et PowerShell.
//
// L'interface affiche le terminal avec xterm.js et dialogue avec ce module par IPC :
// les frappes arrivent par ecrire(), la sortie repart par l'événement « terminal:donnees ».
// La sortie est regroupée toutes les quelques millisecondes pour ne pas inonder l'IPC.
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const pty = require('node-pty');
const activite = require('./activite');
const journal = require('./journal');
const { environnementPropre, sortieDe } = require('./processus');

const DELAI_ENVOI = 8;

// --- Claude a fini / attend une réponse ---------------------------------------------------------
// Pendant qu'il travaille, Claude Code redessine sans cesse son écran (animation, minuteur).
// Quand la sortie a été continue au moins 3 s puis s'arrête 4 s, il a fini ou attend une
// réponse : l'interface est prévenue (« terminal:claude-attend »). La frappe de l'utilisateur
// (son écho) et les premières secondes (écran d'accueil) ne comptent pas. Un « bip » du
// terminal (caractère BEL hors des séquences de titre) prévient aussitôt.
const ACTIVITE_MINIMUM = 3000;
const ECART_MAXIMUM = 1500;
const SILENCE = 4000;
const DEMARRAGE = 6000;

// signaler() : appelé quand Claude a fini ou attend.
function suivreClaude(c, donnees, signaler) {
  const maintenant = Date.now();
  // Les séquences OSC (titre de la fenêtre…) se terminent aussi par BEL : on les retire.
  if (donnees.replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '').includes('\x07')) {
    clearTimeout(c.minuterie);
    c.travaille = false;
    signaler();
    return;
  }
  if (maintenant - c.debut < DEMARRAGE || maintenant - c.derniereSaisie < 400) return;
  if (!c.derniere || maintenant - c.derniere > ECART_MAXIMUM) c.debutActivite = maintenant;
  c.derniere = maintenant;
  if (maintenant - c.debutActivite >= ACTIVITE_MINIMUM) c.travaille = true;
  clearTimeout(c.minuterie);
  c.minuterie = setTimeout(() => {
    if (!c.travaille) return;
    c.travaille = false;
    signaler();
  }, SILENCE);
}

// id -> { processus, contenu, tampon, minuteur }
const terminaux = new Map();

// --- Trouver Claude Code --------------------------------------------------------------

async function fichierExiste(chemin) {
  try {
    return (await fs.stat(chemin)).isFile();
  } catch {
    return false;
  }
}

let cacheClaude = null;

// Renvoie le chemin de claude.exe, ou null s'il est introuvable.
// L'installation npm fournit « claude.cmd », qui lance en fait
// node_modules/@anthropic-ai/claude-code/bin/claude.exe : on lance directement ce .exe
// (passer par cmd.exe abîmerait les guillemets et caractères spéciaux de la demande).
async function trouverClaude() {
  if (cacheClaude) return cacheClaude;
  const resultats = (await sortieDe('where', ['claude']))?.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) || [];
  const candidats = [
    ...resultats.filter((p) => /\.exe$/i.test(p)),
    ...resultats.filter((p) => /\.cmd$/i.test(p))
      .map((p) => path.join(path.dirname(p), 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')),
    path.join(os.homedir(), '.local', 'bin', 'claude.exe'),
    path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'),
  ];
  for (const candidat of candidats) {
    if (await fichierExiste(candidat)) {
      cacheClaude = candidat;
      return candidat;
    }
  }
  return null;
}

// --- Gestion des terminaux ---------------------------------------------------------------

function envoyer(id, canal, ...args) {
  const t = terminaux.get(id);
  if (t && !t.contenu.isDestroyed()) t.contenu.send(canal, id, ...args);
}

function viderTampon(id) {
  const t = terminaux.get(id);
  if (!t || t.tampon === '') return;
  const donnees = t.tampon;
  t.tampon = '';
  t.minuteur = null;
  envoyer(id, 'terminal:donnees', donnees);
}

// Démarre un terminal.
// mode : 'claude' ou 'powershell'. Pour Claude : « demande » = consigne initiale ;
// « continuer » = reprendre la dernière conversation de ce dossier (claude --continue).
// contenu : webContents de l'interface qui affiche ce terminal.
// Renvoie { ok: true } ou { ok: false, raison: 'claude-introuvable' }.
// dossiersLies : dossiers en plus que Claude peut lire et modifier (« --add-dir », projets liés).
async function creer(id, { mode, dossier, demande, continuer, colonnes, lignes, dossiersLies = [] }, contenu) {
  if (terminaux.has(id)) throw new Error('Ce terminal existe déjà.');

  let executable;
  let args;
  if (mode === 'claude') {
    executable = await trouverClaude();
    if (!executable) return { ok: false, raison: 'claude-introuvable' };
    // Préférences (Réglages > Claude) : modèle et autonomie.
    const pref = require('./reglages').obtenir().preferences?.claude || {};
    const options = [];
    if (/^[a-z0-9.-]+$/i.test(pref.modele || '')) options.push('--model', pref.modele);
    if (['manual', 'acceptEdits', 'auto', 'plan'].includes(pref.autonomie)) options.push('--permission-mode', pref.autonomie);
    if (continuer) args = [...options, '--continue'];
    else args = demande ? [...options, demande] : options;
    // Après la demande : « --add-dir » prend tous les arguments qui le suivent.
    if (dossiersLies.length) args.push('--add-dir', ...dossiersLies);
  } else if (mode === 'powershell') {
    executable = 'powershell.exe';
    args = ['-NoLogo'];
  } else {
    throw new Error(`Type de terminal inconnu : ${mode}`);
  }

  let processus;
  try {
    processus = pty.spawn(executable, args, {
      name: 'xterm-256color',
      cols: Math.max(20, colonnes || 100),
      rows: Math.max(5, lignes || 30),
      cwd: dossier,
      env: environnementPropre({ TERM_PROGRAM: 'Toolkit' }),
      useConpty: true,
    });
  } catch (erreur) {
    journal.erreur('Démarrage du terminal :', erreur);
    throw new Error(`Impossible de démarrer le terminal : ${erreur.message}`);
  }

  const t = { processus, contenu, tampon: '', minuteur: null, claude: mode === 'claude' ? { debut: Date.now(), debutActivite: 0, derniere: 0, derniereSaisie: 0, travaille: false, minuterie: null } : null };
  terminaux.set(id, t);
  activite.debut();

  processus.onData((donnees) => {
    t.tampon += donnees;
    if (!t.minuteur) t.minuteur = setTimeout(() => viderTampon(id), DELAI_ENVOI);
    if (t.claude) suivreClaude(t.claude, donnees, () => envoyer(id, 'terminal:claude-attend'));
  });
  processus.onExit(({ exitCode }) => {
    viderTampon(id);
    envoyer(id, 'terminal:fin', exitCode);
    clearTimeout(t.minuteur);
    if (t.claude) clearTimeout(t.claude.minuterie);
    terminaux.delete(id);
    activite.fin();
  });
  return { ok: true };
}

function ecrire(id, donnees) {
  const t = terminaux.get(id);
  if (!t) return;
  if (t.claude) t.claude.derniereSaisie = Date.now();
  t.processus.write(donnees);
}

function redimensionner(id, colonnes, lignes) {
  const t = terminaux.get(id);
  if (!t || !(colonnes > 0) || !(lignes > 0)) return;
  try {
    t.processus.resize(colonnes, lignes);
  } catch {
    // Le processus vient de se terminer : sans importance.
  }
}

function fermer(id) {
  const t = terminaux.get(id);
  if (!t) return;
  try {
    t.processus.kill();
  } catch (erreur) {
    journal.erreur('Arrêt du terminal :', erreur);
  }
}

function fermerTous() {
  for (const id of [...terminaux.keys()]) fermer(id);
}

module.exports = { trouverClaude, creer, ecrire, redimensionner, fermer, fermerTous, suivreClaude };
