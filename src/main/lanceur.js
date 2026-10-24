// Crée ou met à jour « Lancer Toolkit.vbs » à la racine de Toolkit.
// Le script retrouve lui-même son dossier : il fonctionne même si Toolkit est déplacé.
// N'utilise pas Electron (appelé aussi par scripts/creer-lanceur.js après npm install).
'use strict';

const fs = require('node:fs/promises');
const chemins = require('./chemins');

// Les fichiers .vbs sont lus en encodage Windows (ANSI) : on écrit en latin1 pour que
// les accents des messages s'affichent correctement, avec des fins de ligne Windows.
const CONTENU = [
  "' Lance Toolkit sans fenêtre de console.",
  "' Fichier généré automatiquement par Toolkit : inutile de le modifier.",
  'Option Explicit',
  'Dim fso, shell, racine, electron, arguments, a',
  'Set fso = CreateObject("Scripting.FileSystemObject")',
  'Set shell = CreateObject("WScript.Shell")',
  'racine = fso.GetParentFolderName(WScript.ScriptFullName)',
  'electron = racine & "\\app\\node_modules\\electron\\dist\\electron.exe"',
  'If Not fso.FileExists(electron) Then',
  '  MsgBox "Toolkit n\'est pas encore installé." & vbCrLf & vbCrLf & _',
  '    "Ouvre le dossier app dans PowerShell et tape :" & vbCrLf & "npm install", 48, "Toolkit"',
  '  WScript.Quit 1',
  'End If',
  'arguments = ""',
  'For Each a In WScript.Arguments',
  '  arguments = arguments & " """ & a & """"',
  'Next',
  'shell.Run """" & electron & """ """ & racine & "\\app""" & arguments, 1, False',
  '',
].join('\r\n');

async function mettreAJour() {
  const attendu = Buffer.from(CONTENU, 'latin1');
  try {
    const actuel = await fs.readFile(chemins.lanceur);
    if (actuel.equals(attendu)) return false;
  } catch {
    // Fichier absent : on le crée.
  }
  await fs.writeFile(chemins.lanceur, attendu);
  return true;
}

module.exports = { mettreAJour };
