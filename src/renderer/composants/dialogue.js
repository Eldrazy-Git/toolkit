// Boîtes de dialogue simples (prompt() et confirm() n'existent pas dans Electron).
import { el } from './dom.js';

// Affiche une boîte modale ; « construire(fermer) » renvoie { contenu, valider }.
// Entrée valide, Échap ou un clic à côté annule.
function ouvrir(construire) {
  return new Promise((resoudre) => {
    let voile;
    const fermer = (resultat) => {
      document.removeEventListener('keydown', surTouche, true);
      voile.remove();
      resoudre(resultat);
    };
    const { contenu, valider, focus } = construire(fermer);
    const surTouche = (evenement) => {
      if (evenement.key === 'Escape') {
        evenement.stopPropagation();
        fermer(null);
      } else if (evenement.key === 'Enter') {
        evenement.preventDefault();
        valider();
      }
    };
    voile = el('div', { classe: 'voile', onMousedown: (e) => { if (e.target === voile) fermer(null); } },
      el('div', { classe: 'dialogue', role: 'dialog', 'aria-modal': 'true' }, contenu));
    document.body.append(voile);
    document.addEventListener('keydown', surTouche, true);
    (focus || voile.querySelector('button:last-child'))?.focus();
  });
}

// Renvoie le texte saisi (éventuellement vide) ou null si annulé.
export function demanderTexte({ titre, message, valeur = '', suggestions = [], bouton = 'Valider', exemple = '' }) {
  return ouvrir((fermer) => {
    const idListe = `suggestions-${Date.now()}`;
    const champ = el('input', { type: 'text', value: valeur, placeholder: exemple, list: suggestions.length ? idListe : null, spellcheck: 'false' });
    const valider = () => fermer(champ.value.trim());
    queueMicrotask(() => champ.select());
    return {
      focus: champ,
      valider,
      contenu: [
        el('h2', {}, titre),
        message ? el('p', {}, message) : null,
        champ,
        suggestions.length ? el('datalist', { id: idListe }, suggestions.map((s) => el('option', { value: s }))) : null,
        el('div', { classe: 'dialogue-boutons' },
          el('button', { classe: 'bouton', onClick: () => fermer(null) }, 'Annuler'),
          el('button', { classe: 'bouton principal', onClick: valider }, bouton)),
      ],
    };
  });
}

// Renvoie true si l'utilisateur confirme.
export async function confirmer({ titre, message, bouton = 'Confirmer', danger = false }) {
  const resultat = await ouvrir((fermer) => {
    const valider = () => fermer(true);
    return {
      valider,
      contenu: [
        el('h2', {}, titre),
        el('p', {}, message),
        el('div', { classe: 'dialogue-boutons' },
          el('button', { classe: 'bouton', onClick: () => fermer(false) }, 'Annuler'),
          el('button', { classe: `bouton ${danger ? 'danger' : 'principal'}`, onClick: valider }, bouton)),
      ],
    };
  });
  return resultat === true;
}
