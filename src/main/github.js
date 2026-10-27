// GitHub via la commande « gh » (GitHub CLI) déjà connectée sur le PC.
// Toolkit ne stocke jamais de mot de passe ni de jeton : tout passe par « gh ».
'use strict';

const { execFile } = require('node:child_process');
const { environnementPropre } = require('./processus');

function gh(args, dossier) {
  return new Promise((resoudre) => {
    execFile('gh', args, { cwd: dossier, env: environnementPropre(), windowsHide: true, timeout: 120000 },
      (erreur, sortie, sortieErreur) => {
        resoudre({
          introuvable: erreur?.code === 'ENOENT',
          code: erreur ? (typeof erreur.code === 'number' ? erreur.code : 1) : 0,
          sortie: sortie || '',
          erreur: sortieErreur || '',
        });
      });
  });
}

// { installe, connecte, compte }
async function etat() {
  const version = await gh(['--version']);
  if (version.introuvable) return { installe: false, connecte: false, compte: null };
  const compte = await gh(['api', 'user', '--jq', '.login']);
  return { installe: true, connecte: compte.code === 0, compte: compte.code === 0 ? compte.sortie.trim() : null };
}

const AIDE_GH = 'Pour utiliser GitHub depuis Toolkit :\n'
  + '1. Dans PowerShell : winget install GitHub.cli\n'
  + '2. Ferme et rouvre PowerShell, puis : gh auth login\n'
  + '   (choisis GitHub.com > HTTPS > Login with a web browser)\n'
  + '3. Redémarre Toolkit.';

// Crée un dépôt PRIVÉ, l'ajoute comme « origin » et y envoie la branche actuelle.
// Renvoie l'adresse du dépôt.
async function creerDepotPrive(dossier, nom, description) {
  const args = ['repo', 'create', nom, '--private', '--source', '.', '--remote', 'origin', '--push'];
  if (description) args.push('--description', description.slice(0, 300));
  const r = await gh(args, dossier);
  if (r.introuvable) throw new Error(`GitHub CLI (gh) est introuvable.\n${AIDE_GH}`);
  if (r.code !== 0) {
    if (/already exists/i.test(r.erreur)) throw new Error(`Un dépôt nommé « ${nom} » existe déjà sur ton compte GitHub.`);
    if (/auth|login/i.test(r.erreur)) throw new Error(`Tu n'es pas connecté à GitHub.\n${AIDE_GH}`);
    throw new Error(`La création du dépôt GitHub a échoué : ${r.erreur.trim().split('\n').pop()}`);
  }
  const url = await gh(['repo', 'view', nom, '--json', 'url', '--jq', '.url'], dossier);
  return url.code === 0 ? url.sortie.trim() : null;
}

// Crée un dépôt PRIVÉ vide (dépôt partagé : les projets y seront envoyés ensuite).
// Renvoie l'adresse du dépôt.
async function creerDepotPriveVide(nom, description) {
  const args = ['repo', 'create', nom, '--private'];
  if (description) args.push('--description', description.slice(0, 300));
  const r = await gh(args, process.cwd());
  if (r.introuvable) throw new Error(`GitHub CLI (gh) est introuvable.\n${AIDE_GH}`);
  if (r.code !== 0) {
    if (/already exists/i.test(r.erreur)) throw new Error(`Un dépôt nommé « ${nom} » existe déjà sur ton compte GitHub : choisis-le dans la liste ou donne un autre nom.`);
    if (/auth|login/i.test(r.erreur)) throw new Error(`Tu n'es pas connecté à GitHub.\n${AIDE_GH}`);
    throw new Error(`La création du dépôt GitHub a échoué : ${r.erreur.trim().split('\n').pop()}`);
  }
  const url = /https:\/\/\S+/.exec(r.sortie)?.[0];
  if (url) return url.replace(/\/$/, '');
  const vue = await gh(['repo', 'view', nom, '--json', 'url', '--jq', '.url'], process.cwd());
  if (vue.code !== 0) throw new Error('Le dépôt a été créé, mais Toolkit n\'arrive pas à lire son adresse.');
  return vue.sortie.trim();
}

module.exports = { etat, creerDepotPrive, creerDepotPriveVide, AIDE_GH };
