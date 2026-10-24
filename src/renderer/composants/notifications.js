// Petits messages en bas à droite de la fenêtre.
import { el } from './dom.js';
import { icone } from './icones.js';

// type : 'info' | 'succes' | 'erreur'
export function notifier(message, type = 'info') {
  const zone = document.getElementById('notifications');
  const fermer = () => notification.remove();
  const notification = el('div', { classe: `notification ${type}`, role: type === 'erreur' ? 'alert' : 'status' },
    el('div', { classe: 'texte' }, message),
    el('button', { classe: 'bouton-icone', title: 'Fermer', onClick: fermer }, icone('croix')),
  );
  zone.append(notification);
  // Les erreurs restent plus longtemps pour laisser le temps de les lire.
  setTimeout(fermer, type === 'erreur' ? 10000 : 4000);
}
