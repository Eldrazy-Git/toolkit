// Pont Claude des outils HTML : une page HTML ouverte dans Toolkit peut demander un texte
// à Claude, avec le compte Claude Code connecté sur ce PC (aucune clé API).
//
// La page appelle des adresses de sa propre origine (voir outils-html.js > repondre) :
//   GET  /__toolkit__/claude/etat      -> { installe, connecte, email, abonnement, autorise }
//   POST /__toolkit__/claude/connexion -> ouvre l'onglet de connexion de Toolkit (« claude auth login »)
//   POST /__toolkit__/claude/generer   { id, demande, modele? } -> { texte }
//   POST /__toolkit__/claude/annuler   { id }
// Erreurs : statut HTTP >= 400 et { code, message } (codes : non_autorise, refuse, non_installe,
// non_connecte, occupe, annule, delai, echec).
//
// Sécurité :
// - seuls les outils dont projet.json contient « "permissions": ["claude"] » y ont accès ;
// - la première fois, Toolkit demande l'accord de l'utilisateur (retenu dans
//   reglages.outilsClaude, liste d'identifiants de projets) ;
// - une page ne peut appeler que le pont de SA partition (vérifié dans outils-html.js) ;
// - Claude est lancé sans aucun outil (--tools ""), sans serveur MCP, dans un dossier
//   temporaire, et la conversation n'est pas enregistrée : il ne peut que répondre du texte.
'use strict';

const { BrowserWindow, dialog } = require('electron');
const { spawn } = require('node:child_process');
const os = require('node:os');
const projets = require('./projets');
const reglages = require('./reglages');
const journal = require('./journal');
const { environnementPropre } = require('./processus');
const { trouverClaude } = require('./terminal');
const comptes = require('./comptes');

const PREFIXE = '/__toolkit__/claude/';
const DELAI = 5 * 60 * 1000;
const TAILLE_MAX_DEMANDE = 200 * 1024;
const MODELE = /^[a-z0-9.\-[\]]{1,60}$/i;
const CONSIGNE = 'Tu es appelé par un outil HTML local (Toolkit). Réponds uniquement avec le contenu demandé, '
  + 'sans introduction ni commentaire. Tu n\'as accès à aucun outil.';

// hote -> { id, enfant, annule }
const enCours = new Map();

function estCheminPont(chemin) {
  return chemin.startsWith(PREFIXE);
}

function json(statut, donnees) {
  return new Response(JSON.stringify(donnees), { status: statut, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

function erreur(statut, code, message) {
  return json(statut, { code, message });
}

function fenetre() {
  return BrowserWindow.getAllWindows().find((f) => !f.isDestroyed()) || null;
}

function estAutorise(projetId) {
  return (reglages.obtenir().outilsClaude || []).includes(projetId);
}

async function demanderAccord(outil, email) {
  const f = fenetre();
  const options = {
    type: 'question',
    title: 'Toolkit',
    message: `« ${outil.nom} » veut utiliser Claude`,
    detail: `Cet outil va envoyer des demandes à Claude avec ton compte${email ? ` (${email})` : ''}. `
      + 'Chaque demande compte dans ton quota Claude. Claude ne peut que répondre du texte : il n\'a accès à aucun fichier.\n\n'
      + 'Ton choix est retenu pour cet outil.',
    buttons: ['Autoriser', 'Refuser'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  };
  const { response } = f ? await dialog.showMessageBox(f, options) : await dialog.showMessageBox(options);
  if (response !== 0) return false;
  await reglages.modifier({ outilsClaude: [...new Set([...(reglages.obtenir().outilsClaude || []), outil.projetId])] });
  return true;
}

async function lireCorps(requete) {
  const texte = await requete.text();
  if (texte.length > TAILLE_MAX_DEMANDE) throw new Error('trop long');
  return texte ? JSON.parse(texte) : {};
}

// Lance « claude -p » et renvoie le texte de la réponse.
function interroger(exe, demande, modele, suivi) {
  return new Promise((resoudre, rejeter) => {
    const args = ['-p', '--output-format', 'json', '--tools', '', '--strict-mcp-config',
      '--no-session-persistence', '--system-prompt', CONSIGNE];
    if (modele) args.push('--model', modele);
    const enfant = spawn(exe, args, { cwd: os.tmpdir(), env: environnementPropre(), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    suivi.enfant = enfant;
    let sortie = '';
    let sortieErreur = '';
    const minuterie = setTimeout(() => { suivi.delai = true; enfant.kill(); }, DELAI);
    enfant.stdout.on('data', (m) => { sortie += m; });
    enfant.stderr.on('data', (m) => { sortieErreur += m; });
    enfant.on('error', (e) => { clearTimeout(minuterie); rejeter(e); });
    enfant.on('close', (code) => {
      clearTimeout(minuterie);
      let resultat = null;
      try { resultat = JSON.parse(sortie); } catch { /* sortie non JSON : erreur ci-dessous */ }
      if (resultat && !resultat.is_error && typeof resultat.result === 'string') resoudre(resultat.result);
      else rejeter(Object.assign(new Error((resultat?.result || sortieErreur || `code ${code}`).trim().slice(0, 300)), { sortie: true }));
    });
    enfant.stdin.end(demande);
  });
}

// outil : { nom, projetId } ; hote : identifiant de l'outil (une génération à la fois par outil).
async function repondre(requete, outil, hote) {
  const action = new URL(requete.url).pathname.slice(PREFIXE.length);
  if (!outil.projetId) return erreur(403, 'non_autorise', 'Claude n\'est disponible que dans les outils de la bibliothèque.');
  const projet = await projets.chargerProjet(outil.projetId);
  if (!projet?.fiche?.permissions?.includes('claude')) {
    return erreur(403, 'non_autorise', 'Cet outil n\'a pas déclaré « "permissions": ["claude"] » dans son projet.json.');
  }

  if (action === 'etat' && requete.method === 'GET') {
    const etat = await comptes.etatClaude();
    return json(200, { ...etat, autorise: estAutorise(outil.projetId), occupe: enCours.has(hote) });
  }
  if (requete.method !== 'POST') return erreur(405, 'echec', 'Méthode non acceptée.');

  if (action === 'connexion') {
    const f = fenetre();
    if (f) {
      if (f.isMinimized()) f.restore();
      f.show();
      f.webContents.send('outils:connexion-claude');
    }
    return json(200, {});
  }

  if (action === 'annuler') {
    const { id } = await lireCorps(requete).catch(() => ({}));
    const suivi = enCours.get(hote);
    if (suivi && (!id || suivi.id === id)) {
      suivi.annule = true;
      try { suivi.enfant?.kill(); } catch { /* déjà terminé */ }
    }
    return json(200, {});
  }

  if (action === 'generer') {
    let corps;
    try {
      corps = await lireCorps(requete);
    } catch {
      return erreur(400, 'echec', 'Demande illisible ou trop longue.');
    }
    const demande = typeof corps.demande === 'string' ? corps.demande.trim() : '';
    if (!demande) return erreur(400, 'echec', 'La demande est vide.');
    const modele = typeof corps.modele === 'string' && MODELE.test(corps.modele) ? corps.modele : null;
    if (enCours.has(hote)) return erreur(409, 'occupe', 'Une génération est déjà en cours pour cet outil.');

    const exe = await trouverClaude();
    if (!exe) return erreur(503, 'non_installe', 'Claude Code n\'est pas installé sur ce PC.');
    const etat = await comptes.etatClaude();
    if (!etat.connecte) return erreur(401, 'non_connecte', 'Aucun compte Claude n\'est connecté.');
    if (!estAutorise(outil.projetId) && !(await demanderAccord(outil, etat.email))) {
      return erreur(403, 'refuse', 'Tu as refusé l\'accès à Claude pour cet outil.');
    }

    const suivi = { id: String(corps.id || ''), enfant: null, annule: false, delai: false };
    enCours.set(hote, suivi);
    try {
      return json(200, { texte: await interroger(exe, demande, modele, suivi) });
    } catch (e) {
      if (suivi.annule) return erreur(499, 'annule', 'Génération arrêtée.');
      if (suivi.delai) return erreur(504, 'delai', 'Claude n\'a pas répondu à temps.');
      journal.erreur('Pont Claude :', e);
      return erreur(502, 'echec', e.sortie ? `Claude a renvoyé une erreur : ${e.message}` : 'Claude n\'a pas pu démarrer.');
    } finally {
      enCours.delete(hote);
    }
  }
  return erreur(404, 'echec', 'Action inconnue.');
}

module.exports = { estCheminPont, repondre };
