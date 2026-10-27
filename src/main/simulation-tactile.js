// Simulation du tactile dans UNE page HTML (outil ou aperçu de l'onglet Code) : la souris
// agit comme un doigt, sans toucher au reste de Toolkit.
//
// Pourquoi pas simplement Emulation.setEmitTouchEventsForMouse (ce que fait F12) ? Chromium
// convertit alors la souris de TOUTE la fenêtre (la <webview> partage le circuit d'entrée de
// l'interface) : les boutons de Toolkit ne répondaient plus qu'au « toucher ». On fait donc :
// - Emulation.setTouchEmulationEnabled sur la page : elle se sait tactile
//   (navigator.maxTouchPoints, ontouchstart) ; cela ne concerne qu'elle (vérifié) ;
// - un script ajouté à la page (avant ses propres scripts) qui arrête les événements de
//   souris et transmet appui / glissement / relâchement par une « binding » du protocole ;
// - Input.dispatchTouchEvent envoyé à la FENÊTRE de Toolkit, aux coordonnées de la page
//   dans la fenêtre (bornées à la page) : Chromium la trouve lui-même. Envoyés directement à
//   la page, les touchers faisaient défiler mais le tap ne cliquait pas (le geste était
//   placé dans la fenêtre sans tenir compte de la position de la page).
'use strict';

const LIEN = '__toolkitTactile';

// Exécuté dans la page (cadre principal seulement : les coordonnées d'un iframe seraient
// relatives à lui). Les événements produits par nos touchers (firesTouchEvents) passent.
const SCRIPT_PAGE = `(() => {
  if (window !== window.top || window.__toolkitTactileArret) return;
  const envoyer = window.${LIEN};
  let appui = false;
  const deSouris = (e) => e.pointerType ? e.pointerType === 'mouse' : !(e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents);
  const bloquer = (e) => { if (deSouris(e)) { if (!e.pointerType) e.preventDefault(); e.stopImmediatePropagation(); } };
  const point = (t, e) => envoyer(JSON.stringify({ t, x: e.clientX, y: e.clientY, l: innerWidth, h: innerHeight }));
  const surSouris = (e) => {
    if (!deSouris(e)) return;
    if (e.type === 'pointerdown' && e.button === 0) { appui = true; point('debut', e); }
    else if (e.type === 'pointermove' && appui) { if (e.buttons & 1) point('deplacer', e); else { appui = false; point('fin', e); } }
    else if (e.type === 'pointerup' && appui && e.button === 0) { appui = false; point('fin', e); }
    bloquer(e);
  };
  const annuler = () => { if (appui) { appui = false; envoyer(JSON.stringify({ t: 'annuler' })); } };
  // (Écouter les « pointer » : bloquer pointerdown supprime le mousedown qui suit.)
  const souris = ['pointerdown', 'pointermove', 'pointerup'];
  const autres = ['mousedown', 'mousemove', 'mouseup', 'click', 'dblclick', 'auxclick', 'contextmenu', 'mouseover',
    'mouseout', 'mouseenter', 'mouseleave', 'pointerover', 'pointerout', 'pointerenter', 'pointerleave', 'dragstart'];
  for (const t of souris) window.addEventListener(t, surSouris, true);
  for (const t of autres) window.addEventListener(t, bloquer, true);
  window.addEventListener('blur', annuler);
  window.__toolkitTactileArret = () => {
    annuler();
    for (const t of souris) window.removeEventListener(t, surSouris, true);
    for (const t of autres) window.removeEventListener(t, bloquer, true);
    window.removeEventListener('blur', annuler);
    delete window.__toolkitTactileArret;
  };
})();`;

const TYPES = { debut: 'touchStart', deplacer: 'touchMove', fin: 'touchEnd', annuler: 'touchCancel' };

// webContents (id) de la page -> { fenetre, surMessage, surDetache, script }.
const actives = new Map();

// Plus aucune page simulée dans cette fenêtre : son débogueur est libéré.
function libererFenetre(fenetre) {
  if (!fenetre || fenetre.isDestroyed()) return;
  if ([...actives.values()].some((a) => a.fenetre === fenetre)) return;
  if (fenetre.debugger.isAttached()) fenetre.debugger.detach();
}

// Position de la <webview> dans la fenêtre (px CSS de l'interface, réduction du cadre
// smartphone / tablette comprise), lue au début de chaque appui.
function positionWebview(contenu) {
  const id = Number(contenu.id);
  return contenu.hostWebContents.executeJavaScript(`(() => {
    const w = [...document.querySelectorAll('webview')].find((v) => { try { return v.getWebContentsId() === ${id}; } catch { return false; } });
    if (!w) return null;
    const r = w.getBoundingClientRect();
    return { x: r.left, y: r.top, largeur: r.width, hauteur: r.height };
  })()`);
}

function debuggerFenetre(contenu) {
  const dbg = contenu.hostWebContents.debugger;
  if (!dbg.isAttached()) dbg.attach('1.3');
  return dbg;
}

async function activer(contenu) {
  if (actives.has(contenu.id)) return; // déjà en place (le script suit les rechargements)
  const dbg = contenu.debugger;
  if (!dbg.isAttached()) {
    try {
      dbg.attach('1.3');
    } catch {
      throw new Error('Impossible de simuler le tactile pendant que les outils de développement (F12) sont ouverts. Ferme-les puis réessaie.');
    }
  }
  // Les touchers sont envoyés un par un, dans l'ordre (la position est lue au début).
  let file = Promise.resolve();
  let position = null;
  const toucher = async (m) => {
    const type = TYPES[m.t];
    if (!type) return;
    if (type === 'touchStart') position = await positionWebview(contenu);
    if (!position) return;
    const points = [];
    if (type === 'touchStart' || type === 'touchMove') {
      const echelle = position.largeur / (m.l || position.largeur);
      const borner = (v, min, taille) => Math.min(Math.max(v, min), min + taille - 1);
      points.push({
        x: borner(position.x + m.x * echelle, position.x, position.largeur),
        y: borner(position.y + m.y * echelle, position.y, position.hauteur),
        id: 0, radiusX: 4, radiusY: 4, force: 1,
      });
    }
    await debuggerFenetre(contenu).sendCommand('Input.dispatchTouchEvent', { type, touchPoints: points });
    if (type === 'touchEnd' || type === 'touchCancel') position = null;
  };
  const surMessage = (_evenement, methode, params) => {
    if (methode !== 'Runtime.bindingCalled' || params.name !== LIEN) return;
    let m;
    try {
      m = JSON.parse(params.payload);
    } catch {
      return;
    }
    file = file.then(() => toucher(m)).catch(() => { position = null; });
  };
  const fenetre = contenu.hostWebContents;
  // Page fermée ou plantée : le débogueur se détache tout seul.
  const surDetache = () => {
    actives.delete(contenu.id);
    dbg.removeListener('message', surMessage);
    libererFenetre(fenetre);
  };
  dbg.on('message', surMessage);
  dbg.once('detach', surDetache);
  actives.set(contenu.id, { fenetre, surMessage, surDetache });

  try {
    await dbg.sendCommand('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await dbg.sendCommand('Runtime.enable'); // sinon Runtime.bindingCalled n'arrive pas
    await dbg.sendCommand('Page.enable'); // nécessaire au script ajouté à chaque chargement
    await dbg.sendCommand('Runtime.addBinding', { name: LIEN });
    const { identifier } = await dbg.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: SCRIPT_PAGE });
    actives.get(contenu.id).script = identifier;
    // Page déjà chargée : le script y est ajouté tout de suite (sans recharger).
    await dbg.sendCommand('Runtime.evaluate', { expression: SCRIPT_PAGE });
  } catch (erreur) {
    surDetache();
    dbg.removeListener('detach', surDetache);
    if (dbg.isAttached()) dbg.detach();
    throw erreur;
  }
}

async function desactiver(contenu) {
  const etat = actives.get(contenu.id);
  const dbg = contenu.debugger;
  if (!etat || !dbg.isAttached()) return;
  actives.delete(contenu.id);
  dbg.removeListener('message', etat.surMessage);
  dbg.removeListener('detach', etat.surDetache);
  try {
    await dbg.sendCommand('Runtime.evaluate', { expression: 'window.__toolkitTactileArret && window.__toolkitTactileArret()' });
    if (etat.script) await dbg.sendCommand('Page.removeScriptToEvaluateOnNewDocument', { identifier: etat.script });
    await dbg.sendCommand('Emulation.setTouchEmulationEnabled', { enabled: false });
  } finally {
    dbg.detach();
    libererFenetre(etat.fenetre);
  }
}

// contenu : webContents de la page ; actif : true / false.
function definir(contenu, actif) {
  return actif ? activer(contenu) : desactiver(contenu);
}

module.exports = { definir };
