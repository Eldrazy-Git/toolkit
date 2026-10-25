// Quel programme a réservé un raccourci clavier ? Windows ne le dit pas : on cherche, en
// lecture seule, dans les réglages des programmes connus pour réserver des raccourcis
// pour tout le PC : AMD Radeon Software et PowerToys.
// Renvoie, pour chaque combinaison (format de Toolkit, ex. « Ctrl+Shift+P »), une
// description (« AMD Radeon Software : capture d'écran ») ou rien si on ne sait pas.
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');

const NOMS_AMD = {
  'take screenshot': 'capture d\'écran',
  takescreenshothotkey: 'capture d\'écran',
  'toggle streaming': 'démarrer / arrêter la diffusion en direct',
  'toggle recording': 'démarrer / arrêter l\'enregistrement vidéo',
  'save instant replay': 'enregistrer le replay instantané',
  'toggle instant replay': 'activer / désactiver le replay instantané',
  'save instant gif': 'enregistrer un GIF instantané',
  'toggle performance metrics overlay': 'afficher les performances',
  'toggle radeon software overlay': 'ouvrir l\'interface Radeon en jeu',
  'toggle camera': 'activer / désactiver la caméra',
  'toggle microphone': 'activer / désactiver le micro',
  'push to talk': 'parler (appuyer pour parler)',
};

// « Ctrl+Shift,P » / « Shift + Ctrl + p » -> « Ctrl+Shift+P »
function normaliser(texte) {
  const morceaux = String(texte).split(/[+,]/).map((m) => m.trim()).filter(Boolean);
  const touche = morceaux.find((m) => !/^(ctrl|control|alt|shift|maj)$/i.test(m));
  if (!touche) return null;
  const a = (re) => morceaux.some((m) => re.test(m));
  return [a(/^(ctrl|control)$/i) && 'Ctrl', a(/^alt$/i) && 'Alt', a(/^(shift|maj)$/i) && 'Shift', touche.length === 1 ? touche.toUpperCase() : touche]
    .filter(Boolean).join('+');
}

function sortie(programme, args) {
  return new Promise((resoudre) => {
    execFile(programme, args, { windowsHide: true, timeout: 5000 }, (erreur, texte) => resoudre(erreur ? '' : texte));
  });
}

// AMD Radeon Software : registre (raccourcis modifiés) + fichier de diagnostic (tous).
async function raccourcisAmd(table) {
  const ajouter = (combi, nom) => {
    const c = normaliser(combi);
    if (c && !table.has(c)) table.set(c, `AMD Radeon Software : ${NOMS_AMD[nom.toLowerCase()] || nom}`);
  };
  const registre = await sortie('reg.exe', ['query', 'HKCU\\Software\\AMD\\DVR', '/s']);
  for (const ligne of registre.split(/\r?\n/)) {
    const m = /^\s+(\w*Hotkey\w*)\s+REG_SZ\s+(.+)$/i.exec(ligne);
    if (m && /ctrl|alt|shift/i.test(m[2])) ajouter(m[2], m[1]);
  }
  try {
    const fichier = path.join(process.env.LOCALAPPDATA || '', 'AMD', 'CN', 'Analytics', 'RadeonAnalytics_BugTool.JSON');
    const parcourir = (objet) => {
      if (!objet || typeof objet !== 'object') return;
      for (const [cle, valeur] of Object.entries(objet)) {
        if (valeur && Array.isArray(valeur.Value)) {
          valeur.Value.filter((v) => typeof v === 'string' && /ctrl|alt|shift/i.test(v)).forEach((v) => ajouter(v, cle));
        } else parcourir(valeur);
      }
    };
    parcourir(JSON.parse(await fs.readFile(fichier, 'utf8')));
  } catch { /* AMD absent ou fichier illisible */ }
}

// PowerToys : objets { win, ctrl, alt, shift, code } dans les settings.json des modules.
async function raccourcisPowerToys(table) {
  const racine = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'PowerToys');
  let modules = [];
  try {
    modules = (await fs.readdir(racine, { withFileTypes: true })).filter((d) => d.isDirectory());
  } catch {
    return;
  }
  for (const module of modules) {
    let doc;
    try {
      doc = JSON.parse(await fs.readFile(path.join(racine, module.name, 'settings.json'), 'utf8'));
    } catch {
      continue;
    }
    const parcourir = (objet) => {
      if (!objet || typeof objet !== 'object') return;
      if (typeof objet.code === 'number' && 'ctrl' in objet && !objet.win && (objet.ctrl || objet.alt)) {
        const touche = objet.code >= 48 && objet.code <= 90 ? String.fromCharCode(objet.code) : null;
        const c = touche && [objet.ctrl && 'Ctrl', objet.alt && 'Alt', objet.shift && 'Shift', touche].filter(Boolean).join('+');
        if (c && !table.has(c)) table.set(c, `PowerToys : ${module.name}`);
      }
      Object.values(objet).forEach(parcourir);
    };
    parcourir(doc);
  }
}

async function proprietaires(combinaisons) {
  const table = new Map();
  await Promise.all([raccourcisAmd(table), raccourcisPowerToys(table)]);
  return Object.fromEntries((Array.isArray(combinaisons) ? combinaisons : []).map((c) => [c, table.get(c) || null]));
}

module.exports = { proprietaires };
