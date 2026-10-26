// Comptes utilisés par Toolkit : Claude (commande « claude auth ») et GitHub (« gh auth »).
// Toolkit ne voit et ne garde jamais de mot de passe ni de jeton : il lit seulement QUEL
// compte est connecté. La connexion elle-même se fait dans un terminal (navigateur web),
// avec les outils officiels ; la déconnexion et le changement de compte GitHub passent par
// leurs commandes.
'use strict';

const { execFile } = require('node:child_process');
const { environnementPropre } = require('./processus');
const { trouverClaude } = require('./terminal');

function lancer(executable, args, delai = 20000) {
  return new Promise((resoudre) => {
    execFile(executable, args, { env: environnementPropre(), windowsHide: true, timeout: delai }, (erreur, sortie, sortieErreur) => {
      resoudre({
        introuvable: erreur?.code === 'ENOENT',
        code: erreur ? (typeof erreur.code === 'number' ? erreur.code : 1) : 0,
        texte: `${sortie || ''}\n${sortieErreur || ''}`,
        sortie: sortie || '',
      });
    });
  });
}

// --- Claude ----------------------------------------------------------------------------------

// { installe, connecte, email, abonnement, organisation }
async function etatClaude() {
  const exe = await trouverClaude();
  if (!exe) return { installe: false, connecte: false };
  const r = await lancer(exe, ['auth', 'status', '--json']);
  try {
    const j = JSON.parse(r.sortie);
    return {
      installe: true,
      connecte: Boolean(j.loggedIn),
      email: j.email || null,
      abonnement: j.subscriptionType || null,
      organisation: j.orgName || null,
      methode: j.authMethod || null,
    };
  } catch {
    return { installe: true, connecte: false };
  }
}

async function deconnecterClaude() {
  const exe = await trouverClaude();
  if (!exe) throw new Error('Claude Code est introuvable sur ce PC.');
  const r = await lancer(exe, ['auth', 'logout']);
  if (r.code !== 0) throw new Error(`La déconnexion de Claude a échoué : ${r.texte.trim().split('\n').pop()}`);
}

// --- GitHub ------------------------------------------------------------------------------------

// { installe, comptes: [{ nom, actif }] } (plusieurs comptes possibles sur github.com)
async function etatGithub() {
  const r = await lancer('gh', ['auth', 'status', '--hostname', 'github.com']);
  if (r.introuvable) return { installe: false, comptes: [] };
  const comptes = [];
  let courant = null;
  for (const ligne of r.texte.split(/\r?\n/)) {
    const m = /Logged in to github\.com (?:account|as) (\S+)/i.exec(ligne);
    if (m) {
      courant = { nom: m[1], actif: false };
      comptes.push(courant);
    } else if (courant && /Active account:\s*true/i.test(ligne)) {
      courant.actif = true;
    }
  }
  if (comptes.length === 1) comptes[0].actif = true;
  return { installe: true, comptes };
}

const NOM_COMPTE = /^[A-Za-z0-9-]{1,39}$/;

async function changerCompteGithub(nom) {
  if (!NOM_COMPTE.test(nom || '')) throw new Error('Nom de compte GitHub invalide.');
  const r = await lancer('gh', ['auth', 'switch', '--hostname', 'github.com', '--user', nom]);
  if (r.code !== 0) throw new Error(`Impossible de passer au compte « ${nom} » : ${r.texte.trim().split('\n').pop()}`);
}

async function deconnecterGithub(nom) {
  if (!NOM_COMPTE.test(nom || '')) throw new Error('Nom de compte GitHub invalide.');
  const r = await lancer('gh', ['auth', 'logout', '--hostname', 'github.com', '--user', nom]);
  if (r.code !== 0) throw new Error(`La déconnexion de « ${nom} » a échoué : ${r.texte.trim().split('\n').pop()}`);
}

// Programme et arguments de la CONNEXION (interactive : faite dans un terminal de Toolkit).
async function commandeConnexion(service) {
  if (service === 'claude') {
    const exe = await trouverClaude();
    if (!exe) throw new Error('Claude Code est introuvable : installe-le d\'abord (Réglages > Général > Programmes).');
    return { executable: exe, args: ['auth', 'login', '--claudeai'] };
  }
  if (service === 'github') {
    // Le terminal (node-pty) exige le chemin complet du programme : on le cherche.
    const trouves = (await lancer('where', ['gh'])).sortie.split(/\r?\n/).map((l) => l.trim()).filter((l) => /\.exe$/i.test(l));
    if (!trouves.length) throw new Error('GitHub CLI (gh) est introuvable : installe-le (dans PowerShell : winget install GitHub.cli), puis redémarre Toolkit.');
    return { executable: trouves[0], args: ['auth', 'login', '--hostname', 'github.com', '--git-protocol', 'https', '--web'] };
  }
  throw new Error('Service inconnu.');
}

// Connexion à GitHub SANS terminal : « gh auth login --web » lancé sans console ne pose
// aucune question ; il donne un code à usage unique et attend qu'on le saisisse sur
// github.com/login/device. surCode({ code, url }) dès que le code est connu ;
// surFin(reussi) quand gh s'arrête. Renvoie une fonction pour annuler.
let connexionGithub = null;

async function connecterGithub(surCode, surFin) {
  annulerConnexionGithub();
  const { executable, args } = await commandeConnexion('github');
  const { spawn } = require('node:child_process');
  const enfant = spawn(executable, args, { env: environnementPropre(), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  connexionGithub = enfant;
  let texte = '';
  let codeEnvoye = false;
  const lire = (morceau) => {
    texte += morceau.toString();
    const code = /one-time code[^A-Z0-9]*([A-Z0-9]{4}-[A-Z0-9]{4})/i.exec(texte)?.[1];
    const url = /(https:\/\/github\.com\/login\/device\S*)/.exec(texte)?.[1];
    if (code && url && !codeEnvoye) {
      codeEnvoye = true;
      surCode({ code, url });
    }
  };
  enfant.stdout.on('data', lire);
  enfant.stderr.on('data', lire);
  enfant.on('error', () => surFin(false, 'GitHub CLI n\'a pas pu démarrer.'));
  enfant.on('exit', (code) => {
    if (connexionGithub === enfant) connexionGithub = null;
    surFin(code === 0, code === 0 ? null : (texte.trim().split('\n').pop() || 'connexion interrompue'));
  });
}

function annulerConnexionGithub() {
  if (connexionGithub && connexionGithub.exitCode === null) {
    try { connexionGithub.kill(); } catch { /* déjà terminé */ }
  }
  connexionGithub = null;
}

module.exports = {
  etatClaude, deconnecterClaude, etatGithub, changerCompteGithub, deconnecterGithub, commandeConnexion,
  connecterGithub, annulerConnexionGithub,
};
