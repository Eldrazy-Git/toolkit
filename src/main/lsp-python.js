// Aide au code Python dans l'éditeur : Pyright (le « serveur de langage » Python de VS Code),
// lancé avec le Node intégré à Electron, un serveur par onglet « Code » qui a ouvert un .py.
// Les messages (protocole LSP, JSON) sont relayés entre Pyright et l'interface.
//
// L'interface ne connaît pas les vrais chemins : elle utilise des adresses virtuelles
// « file:///<cle>/<chemin relatif> », traduites ici dans les deux sens. Une adresse hors du
// dossier (bibliothèque Python installée) est transmise telle quelle (lecture seule).
// Les questions de Pyright (réglages, dossiers) sont répondues ici, sans passer par l'interface.
'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');
const { fileURLToPath, pathToFileURL } = require('node:url');
const journal = require('./journal');
const { environnementPropre, sortieDe } = require('./processus');
const { trouverPython } = require('./executions');

const SCRIPT = path.join(__dirname, '..', '..', 'node_modules', 'pyright', 'langserver.index.js');
const serveurs = new Map(); // cle -> { enfant, dossier, contenu }
const contenusSuivis = new WeakSet();
let pythonTrouve; // promesse : chemin de python.exe (ou null)

// « py.exe » (lanceur) ne convient pas à Pyright : on demande le vrai python.exe.
function cheminPython() {
  if (!pythonTrouve) {
    pythonTrouve = (async () => {
      const lanceur = await trouverPython();
      if (!lanceur) return null;
      const sortie = await sortieDe(lanceur, ['-c', 'import sys; print(sys.executable)']);
      return sortie?.trim() || lanceur;
    })();
  }
  return pythonTrouve;
}

// --- Traduction des adresses ----------------------------------------------------------------

function versReel(valeur, cle, dossier) {
  if (typeof valeur === 'string') {
    // (Monaco et encodeURIComponent n'encodent pas tous les caractères pareil : on décode.)
    if (!valeur.startsWith('file:///')) return valeur;
    let decode;
    try {
      decode = decodeURIComponent(valeur.slice('file:///'.length));
    } catch {
      return valeur;
    }
    if (decode !== cle && !decode.startsWith(`${cle}/`)) return valeur;
    return pathToFileURL(path.resolve(dossier, decode.slice(cle.length + 1))).href;
  }
  if (Array.isArray(valeur)) return valeur.map((v) => versReel(v, cle, dossier));
  if (valeur && typeof valeur === 'object') {
    return Object.fromEntries(Object.entries(valeur).map(([k, v]) => [k, versReel(v, cle, dossier)]));
  }
  return valeur;
}

function versVirtuel(valeur, cle, dossier) {
  if (typeof valeur === 'string') {
    if (!valeur.startsWith('file:')) return valeur;
    let reel;
    try {
      reel = fileURLToPath(valeur);
    } catch {
      return valeur;
    }
    const relatif = path.relative(dossier, reel);
    const dedans = relatif === '' || (!relatif.startsWith('..') && !path.isAbsolute(relatif));
    if (!dedans) return valeur;
    const morceaux = relatif ? relatif.split(path.sep).map(encodeURIComponent) : [];
    return [`file:///${encodeURIComponent(cle)}`, ...morceaux].join('/');
  }
  if (Array.isArray(valeur)) return valeur.map((v) => versVirtuel(v, cle, dossier));
  if (valeur && typeof valeur === 'object') {
    return Object.fromEntries(Object.entries(valeur).map(([k, v]) => [k, versVirtuel(v, cle, dossier)]));
  }
  return valeur;
}

// --- Échanges avec Pyright ------------------------------------------------------------------

function ecrireServeur(serveur, message) {
  if (!serveur.enfant.stdin.writable) return;
  const corps = Buffer.from(JSON.stringify(message), 'utf8');
  serveur.enfant.stdin.write(`Content-Length: ${corps.length}\r\n\r\n`);
  serveur.enfant.stdin.write(corps);
}

async function reglagesPython(section) {
  const analyse = {
    typeCheckingMode: 'standard',
    diagnosticMode: 'openFilesOnly',
    autoImportCompletions: true,
    autoSearchPaths: true,
    useLibraryCodeForTypes: true,
  };
  if (section === 'python') return { pythonPath: (await cheminPython()) || undefined, analysis: analyse };
  if (section === 'python.analysis') return analyse;
  return {};
}

async function repondreAuServeur(serveur, message) {
  let resultat = null;
  if (message.method === 'workspace/configuration') {
    resultat = await Promise.all((message.params?.items || []).map((item) => reglagesPython(item.section)));
  } else if (message.method === 'workspace/workspaceFolders') {
    resultat = [{ uri: pathToFileURL(serveur.dossier).href, name: path.basename(serveur.dossier) }];
  }
  ecrireServeur(serveur, { jsonrpc: '2.0', id: message.id, result: resultat });
}

function lireMessages(serveur, cle) {
  let tampon = Buffer.alloc(0);
  serveur.enfant.stdout.on('data', (morceau) => {
    tampon = Buffer.concat([tampon, morceau]);
    for (;;) {
      const finEntete = tampon.indexOf('\r\n\r\n');
      if (finEntete < 0) return;
      const longueur = Number(/Content-Length: *(\d+)/i.exec(tampon.subarray(0, finEntete).toString('ascii'))?.[1]);
      if (!Number.isFinite(longueur)) {
        tampon = tampon.subarray(finEntete + 4);
        continue;
      }
      if (tampon.length < finEntete + 4 + longueur) return;
      const corps = tampon.subarray(finEntete + 4, finEntete + 4 + longueur).toString('utf8');
      tampon = tampon.subarray(finEntete + 4 + longueur);
      let message;
      try {
        message = JSON.parse(corps);
      } catch {
        continue;
      }
      if (message.method && message.id !== undefined) {
        repondreAuServeur(serveur, message).catch((erreur) => journal.erreur('Pyright :', erreur));
      } else if (!serveur.contenu.isDestroyed()) {
        serveur.contenu.send('lsp:message', cle, versVirtuel(message, cle, serveur.dossier));
      }
    }
  });
}

// Démarre le serveur de cette clé s'il ne tourne pas déjà.
function demarrer(contenu, cle, dossier) {
  if (serveurs.has(cle)) return { dejaDemarre: true };
  const enfant = spawn(process.execPath, [SCRIPT, '--stdio'], {
    cwd: dossier,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...environnementPropre(), ELECTRON_RUN_AS_NODE: '1', VSCODE_NLS_CONFIG: JSON.stringify({ locale: 'fr' }) },
  });
  const serveur = { enfant, dossier, contenu };
  serveurs.set(cle, serveur);
  lireMessages(serveur, cle);
  enfant.stderr.on('data', (d) => journal.info(`[Pyright] ${String(d).trim().slice(0, 500)}`));
  enfant.on('error', (erreur) => journal.erreur('Pyright n\'a pas pu démarrer :', erreur));
  enfant.on('exit', (code) => {
    if (serveurs.get(cle) === serveur) serveurs.delete(cle);
    if (!contenu.isDestroyed()) contenu.send('lsp:fin', cle, code);
  });
  if (!contenusSuivis.has(contenu)) {
    contenusSuivis.add(contenu);
    contenu.once('destroyed', () => {
      for (const [c, s] of serveurs) if (s.contenu === contenu) arreter(c);
    });
  }
  return { dejaDemarre: false };
}

function envoyer(cle, message) {
  const serveur = serveurs.get(cle);
  if (!serveur) return;
  // Pyright s'arrête de lui-même si Toolkit disparaît (même en cas de plantage).
  if (message?.method === 'initialize') message = { ...message, params: { ...message.params, processId: process.pid } };
  ecrireServeur(serveur, versReel(message, cle, serveur.dossier));
}

function arreter(cle) {
  const serveur = serveurs.get(cle);
  if (!serveur) return;
  serveurs.delete(cle);
  try {
    ecrireServeur(serveur, { jsonrpc: '2.0', method: 'exit' });
  } catch { /* déjà arrêté */ }
  setTimeout(() => { if (serveur.enfant.exitCode === null) serveur.enfant.kill(); }, 1000);
}

function arreterTout() {
  [...serveurs.keys()].forEach(arreter);
}

module.exports = { demarrer, envoyer, arreter, arreterTout };
