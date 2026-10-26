// Fabrique l'installateur graphique dist/Installer-Toolkit-<version>.exe (npm run installateur).
// - Sources incluses : le DERNIER COMMIT de app/ (git archive), donc rien de personnel ni de
//   non enregistré ; node_modules n'en fait pas partie (téléchargé à l'installation).
// - Compilation avec le compilateur C# fourni par Windows (.NET Framework 4) : rien à installer.
// Le .exe n'est pas signé : Windows SmartScreen affichera un avertissement au premier lancement.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const app = path.join(__dirname, '..');
const version = require(path.join(app, 'package.json')).version;
const construction = path.join(app, 'build');
const sortie = path.join(app, 'dist');
const csc = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');

if (!fs.existsSync(csc)) {
  console.error('Compilateur C# introuvable (.NET Framework 4) : ' + csc);
  process.exit(1);
}
const modifs = execFileSync('git', ['status', '--porcelain'], { cwd: app, encoding: 'utf8' }).trim();
if (modifs) console.warn('Attention : des modifications ne sont pas dans un commit ; l\'installateur contiendra la version du DERNIER commit.\n');

fs.mkdirSync(construction, { recursive: true });
fs.mkdirSync(sortie, { recursive: true });
const zip = path.join(construction, 'app.zip');
execFileSync('git', ['archive', '--format=zip', '-o', zip, 'HEAD'], { cwd: app });
fs.writeFileSync(path.join(construction, 'Version.cs'),
  `namespace InstallateurToolkit { static class Infos { public const string Version = "${version}"; } }\n`, 'utf8');

const exe = path.join(sortie, `Installer-Toolkit-${version}.exe`);
const sortieCsc = execFileSync(csc, [
  '/nologo', '/codepage:65001', '/optimize+', '/target:winexe', `/out:${exe}`,
  `/win32icon:${path.join(app, 'assets', 'icone.ico')}`,
  `/resource:${zip},app.zip`,
  '/r:System.dll', '/r:System.Core.dll', '/r:System.Drawing.dll', '/r:System.Windows.Forms.dll',
  '/r:System.IO.Compression.dll', '/r:System.IO.Compression.FileSystem.dll', '/r:Microsoft.CSharp.dll',
  path.join(app, 'installateur', 'Installateur.cs'), path.join(construction, 'Version.cs'),
], { encoding: 'utf8' });
if (sortieCsc.trim()) console.log(sortieCsc.trim());
console.log(`Installateur créé : ${path.relative(app, exe)} (${(fs.statSync(exe).size / 1048576).toFixed(1)} Mo)`);
