// Publie la version actuelle de Toolkit (npm run publier) : c'est ce qui permet aux Toolkit
// installés de la détecter (Réglages > Mises à jour) et de s'y mettre à jour.
// 1. vérifie que tout est dans un commit et que la version n'est pas déjà publiée ;
// 2. fabrique l'installateur (dist/Installer-Toolkit-<version>.exe) ;
// 3. APRÈS CONFIRMATION : envoie les commits, crée l'étiquette v<version> et la Release
//    GitHub (notes : docs/notes-de-version/<version>.md si le fichier existe), installateur joint.
// Important : chaque version installée chez quelqu'un doit rester publiée (étiquette
// v<version>) : la mise à jour s'en sert pour savoir ce que la personne a modifié.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { execFileSync } = require('node:child_process');

const app = path.join(__dirname, '..');
const version = require(path.join(app, 'package.json')).version;
const tag = `v${version}`;
const executer = (programme, args) => execFileSync(programme, args, { cwd: app, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function arreter(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

if (executer('git', ['status', '--porcelain'])) arreter('Des modifications ne sont pas dans un commit : fais d\'abord un commit (panneau Git de Toolkit).');
try {
  executer('gh', ['auth', 'status']);
} catch {
  arreter('GitHub CLI n\'est pas connecté : Toolkit > Réglages > Comptes > Se connecter à GitHub.');
}
try {
  executer('gh', ['release', 'view', tag]);
  arreter(`La version ${version} est déjà publiée. Change le numéro de version dans package.json (par exemple ${version.replace(/\d+$/, (n) => Number(n) + 1)}), fais un commit, puis relance.`);
} catch { /* pas encore publiée : on continue */ }

console.log(`Fabrication de l'installateur de Toolkit ${version}…`);
execFileSync(process.execPath, [path.join(__dirname, 'construire-installateur.js')], { cwd: app, stdio: 'inherit' });
const exe = path.join(app, 'dist', `Installer-Toolkit-${version}.exe`);
const notes = path.join(app, 'docs', 'notes-de-version', `${version}.md`);
const avecNotes = fs.existsSync(notes);

const question = readline.createInterface({ input: process.stdin, output: process.stdout });
question.question(`\nPublier Toolkit ${version} sur GitHub (envoi des commits, étiquette ${tag}, Release avec l'installateur${avecNotes ? ', notes de version' : ''}) ? (o/N) `, (reponse) => {
  question.close();
  if (!/^\s*o/i.test(reponse)) arreter('Publication annulée : rien n\'a été envoyé.');
  executer('git', ['push']);
  executer('git', ['tag', '-a', tag, '-m', `Toolkit ${version}`]);
  executer('git', ['push', 'origin', tag]);
  const args = ['release', 'create', tag, exe, '--title', `Toolkit ${version}`, '--verify-tag'];
  if (avecNotes) args.push('--notes-file', notes);
  else args.push('--generate-notes');
  console.log(executer('gh', args));
  console.log(`\nToolkit ${version} est publié.`);
});
