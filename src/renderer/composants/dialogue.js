// Boîtes de dialogue simples (prompt() et confirm() n'existent pas dans Electron).
import { el, normaliser } from './dom.js';

// Affiche une boîte modale ; « construire(fermer) » renvoie { contenu, valider }.
// Entrée valide (si valider existe), Échap ou un clic à côté annule.
// classe : classe CSS en plus (ex. 'large' pour une grande fenêtre).
function ouvrir(construire, { classe = '' } = {}) {
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
      } else if (valider && evenement.key === 'Enter' && (evenement.target.tagName !== 'TEXTAREA' || evenement.ctrlKey)) {
        // Dans une zone de texte, Entrée va à la ligne ; Ctrl+Entrée valide.
        evenement.preventDefault();
        valider();
      }
    };
    voile = el('div', { classe: 'voile', onMousedown: (e) => { if (e.target === voile) fermer(null); } },
      el('div', { classe: `dialogue ${classe}`.trim(), role: 'dialog', 'aria-modal': 'true' }, contenu));
    document.body.append(voile);
    document.addEventListener('keydown', surTouche, true);
    (focus || voile.querySelector('button:last-child'))?.focus();
  });
}

// Grande fenêtre de consultation (listes, détails). corps : élément(s) affichés ;
// boutons : [{ libelle, style?, action(fermer) }] en plus du bouton « Fermer ».
// surOuverture(fermer) : pour fermer la fenêtre depuis son contenu.
// Entrée ne déclenche rien (on peut naviguer au clavier dans la liste).
export function fenetre({ titre, corps, boutons = [], surOuverture = null }) {
  return ouvrir((fermer) => {
    surOuverture?.(fermer);
    const boutonFermer = el('button', { classe: 'bouton', onClick: () => fermer(null) }, 'Fermer');
    return {
      valider: null,
      focus: boutonFermer,
      contenu: [
        el('h2', {}, titre),
        el('div', { classe: 'corps-fenetre' }, corps),
        el('div', { classe: 'dialogue-boutons' },
          boutons.map((b) => el('button', { classe: `bouton ${b.style || ''}`, onClick: () => b.action(fermer) }, b.libelle)),
          boutonFermer),
      ],
    };
  }, { classe: 'large' });
}

// Renvoie le texte saisi (éventuellement vide) ou null si annulé.
export function demanderTexte({ titre, message, valeur = '', suggestions = [], bouton = 'Valider', exemple = '', danger = false }) {
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
          el('button', { classe: `bouton ${danger ? 'danger' : 'principal'}`, onClick: valider }, bouton)),
      ],
    };
  });
}

// Choix entre plusieurs boutons. boutons : [{ libelle, valeur, style?: 'principal' | 'danger' }]
// Renvoie la valeur du bouton cliqué, ou null si annulé. Entrée = dernier bouton.
export function choisir({ titre, message, boutons }) {
  return ouvrir((fermer) => ({
    valider: () => fermer(boutons[boutons.length - 1].valeur),
    contenu: [
      el('h2', {}, titre),
      el('p', {}, message),
      el('div', { classe: 'dialogue-boutons' },
        el('button', { classe: 'bouton', onClick: () => fermer(null) }, 'Annuler'),
        boutons.map((b) => el('button', { classe: `bouton ${b.style || ''}`, onClick: () => fermer(b.valeur) }, b.libelle))),
    ],
  }));
}

// Message d'information avec un seul bouton.
export async function informer({ titre, message, bouton = 'Compris' }) {
  await ouvrir((fermer) => ({
    valider: () => fermer(true),
    contenu: [
      el('h2', {}, titre),
      el('p', {}, message),
      el('div', { classe: 'dialogue-boutons' }, el('button', { classe: 'bouton principal', onClick: () => fermer(true) }, bouton)),
    ],
  }));
}

// Formulaire. champs : [{ id, libelle, type, valeur?, options?, suggestions?, extensions?, exemple?, aide?, obligatoire? }]
// Types : 'texte' | 'zone' (texte sur plusieurs lignes) | 'choix' (options : [{ valeur, libelle }])
//       | 'case' (case à cocher) | 'fichier' | 'fichiers' | 'dossier' (bouton « Parcourir… »).
// Renvoie { id: valeur } ou null si annulé (« fichiers » : liste de chemins ; « case » : true/false).
export function formulaire({ titre, message, champs, bouton = 'Valider' }) {
  return ouvrir((fermer) => {
    // id -> { element (à focaliser), lire() }
    const controles = {};
    const erreur = el('p', { classe: 'dialogue-erreur', hidden: true });

    const lignes = champs.map((c) => {
      // (Une case à cocher n'est jamais « obligatoire » : pas d'astérisque.)
      const libelle = el('span', { classe: 'champ-libelle' }, c.libelle, c.obligatoire && c.type !== 'case' ? ' *' : '');
      const aide = c.aide ? el('span', { classe: 'champ-aide' }, c.aide) : null;

      if (c.type === 'case') {
        const caseACocher = el('input', { type: 'checkbox' });
        caseACocher.checked = c.valeur === true || c.valeur === 'true';
        controles[c.id] = { element: caseACocher, lire: () => caseACocher.checked };
        return el('label', { classe: 'champ-formulaire champ-case' }, caseACocher, libelle, aide);
      }

      if (['fichier', 'fichiers', 'dossier'].includes(c.type)) {
        let valeur = c.type === 'fichiers' ? (Array.isArray(c.valeur) ? c.valeur : []) : (c.valeur || '');
        const affichage = el('input', { type: 'text', readonly: true, placeholder: c.type === 'dossier' ? 'Aucun dossier choisi' : 'Aucun fichier choisi' });
        const afficher = () => {
          if (c.type !== 'fichiers') affichage.value = valeur;
          else affichage.value = valeur.length <= 1 ? (valeur[0] || '') : `${valeur.length} fichiers : ${valeur.map((f) => f.split(/[\\/]/).pop()).join(', ')}`;
          affichage.title = Array.isArray(valeur) ? valeur.join('\n') : valeur;
        };
        const parcourir = async () => {
          try {
            const choix = await window.toolkit.dialogues.choisirChemin({ type: c.type, titre: c.libelle, extensions: c.extensions || [] });
            if (choix) {
              valeur = choix;
              afficher();
            }
          } catch (e) {
            erreur.textContent = e.message;
            erreur.hidden = false;
          }
        };
        const bouton = el('button', { type: 'button', classe: 'bouton', onClick: parcourir }, 'Parcourir…');
        affichage.addEventListener('dblclick', parcourir);
        afficher();
        controles[c.id] = { element: bouton, lire: () => valeur };
        return el('div', { classe: 'champ-formulaire' }, libelle, el('div', { classe: 'champ-chemin' }, affichage, bouton), aide);
      }

      let controle;
      let suggestions = null;
      if (c.type === 'zone') {
        controle = el('textarea', { rows: 6, placeholder: c.exemple || '', spellcheck: 'true' });
        controle.value = c.valeur || '';
      } else if (c.type === 'choix') {
        controle = el('select', {}, c.options.map((o) => el('option', { value: o.valeur }, o.libelle)));
        if (c.valeur) controle.value = c.valeur;
      } else {
        const idListe = c.suggestions?.length ? `suggestions-${c.id}-${Date.now()}` : null;
        controle = el('input', { type: 'text', value: c.valeur || '', placeholder: c.exemple || '', list: idListe, spellcheck: 'false' });
        // Suggestions proposées pendant la saisie (ex. catégories existantes).
        if (idListe) suggestions = el('datalist', { id: idListe }, c.suggestions.map((s) => el('option', { value: s })));
      }
      controles[c.id] = { element: controle, lire: () => controle.value.trim() };
      return el('label', { classe: 'champ-formulaire' }, libelle, controle, suggestions, aide);
    });

    const valider = () => {
      const valeurs = Object.fromEntries(champs.map((c) => [c.id, controles[c.id].lire()]));
      const vide = (v) => (Array.isArray(v) ? v.length === 0 : v === '' || v === null || v === undefined);
      const manquant = champs.find((c) => c.obligatoire && c.type !== 'case' && vide(valeurs[c.id]));
      if (manquant) {
        erreur.textContent = `Le champ « ${manquant.libelle} » est obligatoire.`;
        erreur.hidden = false;
        controles[manquant.id].element.focus();
        return;
      }
      fermer(valeurs);
    };

    return {
      focus: controles[champs[0].id].element,
      valider,
      contenu: [
        el('h2', {}, titre),
        message ? el('p', {}, message) : null,
        lignes,
        erreur,
        el('div', { classe: 'dialogue-boutons' },
          el('button', { classe: 'bouton', onClick: () => fermer(null) }, 'Annuler'),
          el('button', { classe: 'bouton principal', onClick: valider }, bouton)),
      ],
    };
  });
}

// Liste de cases à cocher (ex. groupes d'un projet, projets d'un groupe).
// elements : [{ valeur, libelle, niveau? (décalage), coche?, visuel? }] ;
// filtrable : champ pour filtrer une longue liste ;
// nouveau : libellé d'un champ texte facultatif en dessous (ex. « Créer aussi un groupe »).
// Renvoie { choisis: [valeurs cochées], nouveau: texte saisi } ou null si annulé.
export function cocher({ titre, message, elements, bouton = 'Valider', filtrable = false, nouveau = null, vide = 'Aucun élément.' }) {
  return ouvrir((fermer) => {
    const lignes = elements.map((e) => {
      const caseACocher = el('input', { type: 'checkbox' });
      caseACocher.checked = Boolean(e.coche);
      const ligne = el('label', { classe: 'case-liste', style: { '--niveau': e.niveau || 0 } },
        caseACocher, e.visuel || null, el('span', { classe: 'case-libelle' }, e.libelle));
      return { e, caseACocher, ligne };
    });
    const champFiltre = filtrable
      ? el('input', {
        type: 'text',
        placeholder: 'Filtrer…',
        spellcheck: 'false',
        onInput: () => {
          const texte = normaliser(champFiltre.value.trim());
          lignes.forEach((l) => { l.ligne.hidden = Boolean(texte) && !normaliser(l.e.libelle).includes(texte); });
        },
      })
      : null;
    const champNouveau = nouveau ? el('input', { type: 'text', placeholder: 'Nom du nouveau groupe', spellcheck: 'false' }) : null;
    const valider = () => fermer({
      choisis: lignes.filter((l) => l.caseACocher.checked).map((l) => l.e.valeur),
      nouveau: champNouveau?.value.trim() || '',
    });
    return {
      focus: champFiltre || (lignes.length ? lignes[0].caseACocher : champNouveau),
      valider,
      contenu: [
        el('h2', {}, titre),
        message ? el('p', {}, message) : null,
        champFiltre,
        lignes.length
          ? el('div', { classe: 'liste-cases' }, lignes.map((l) => l.ligne))
          : el('p', { classe: 'details-aide' }, vide),
        champNouveau ? el('label', { classe: 'champ-formulaire champ-nouveau' }, el('span', { classe: 'champ-libelle' }, nouveau), champNouveau) : null,
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
