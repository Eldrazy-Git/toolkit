// Icône de Toolkit dans la zone de notification (près de l'horloge).
'use strict';

const { Tray, Menu } = require('electron');
const chemins = require('./chemins');

let icone = null;

function creer({ afficher, quitter }) {
  icone = new Tray(chemins.icone);
  icone.setToolTip('Toolkit');
  icone.setContextMenu(Menu.buildFromTemplate([
    { label: 'Ouvrir Toolkit', click: afficher },
    { type: 'separator' },
    { label: 'Quitter Toolkit', click: quitter },
  ]));
  icone.on('click', afficher);
}

function afficherMessage(titre, contenu) {
  icone?.displayBalloon({ title: titre, content: contenu, iconType: 'info' });
}

function detruire() {
  icone?.destroy();
  icone = null;
}

module.exports = { creer, afficherMessage, detruire };
