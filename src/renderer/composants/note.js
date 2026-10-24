// Onglet d'une note Markdown : lecture (rendu, liens [[…]], rétroliens) et modification.
import { el } from './dom.js';
import { icone } from './icones.js';
import { notifier } from './notifications.js';
import { confirmer } from './dialogue.js';
import * as actions from './actions.js';

const api = window.toolkit.notes;

// onglet : { id, chemin, modeEdition? }
export function creerPanneauNote(onglet, parent) {
  let note = null; // dernière version lue
  let enEdition = Boolean(onglet.modeEdition);
  let modifiee = false;

  const titre = el('strong', { classe: 'titre-note' });
  const chemin = el('code', { classe: 'chemin-outil' }, onglet.chemin);
  const boutons = el('div', { classe: 'groupe-boutons-note' });
  const corps = el('div', { classe: 'corps-note', onClick: (e) => {
    if (e.target.closest('a')) actions.suivreLien(e);
  } });
  const element = el('section', { classe: 'panneau panneau-note' },
    el('div', { classe: 'barre-outil' }, icone('note'), titre, boutons, chemin),
    corps);
  parent.append(element);

  function signalerModification(valeur) {
    if (modifiee === valeur) return;
    modifiee = valeur;
    // Différé : peut être appelé pendant le rendu des onglets (voir terminal.js).
    queueMicrotask(() => actions.marquerNote(onglet.id, { nonEnregistre: valeur }));
  }

  function dessinerLecture() {
    titre.textContent = note.titre;
    boutons.replaceChildren(
      el('button', { classe: 'bouton petit principal', onClick: () => basculer(true) }, icone('crayon'), 'Modifier'),
      el('button', { classe: 'bouton-icone', title: 'Relire le fichier', onClick: charger }, icone('redemarrer')));
    const article = el('article', { classe: 'markdown' });
    article.innerHTML = note.html; // rendu sûr : HTML brut désactivé côté processus principal
    // (replaceChildren écrirait « null » : la section n'est ajoutée que si elle existe.)
    corps.replaceChildren(article);
    if (note.retroliens.length) {
      corps.append(el('section', { classe: 'retroliens' },
        el('h3', {}, `Cité dans (${note.retroliens.length})`),
        el('ul', {}, note.retroliens.map((r) => el('li', {},
          el('a', { href: '#', 'data-note': r.chemin }, icone('note'), r.titre),
          el('span', { classe: 'details-aide' }, ` — ${r.chemin}`))))));
    }
  }

  function dessinerEdition() {
    titre.textContent = `${note.titre} (modification)`;
    const zone = el('textarea', {
      classe: 'editeur-note',
      spellcheck: 'true',
      onInput: () => signalerModification(zone.value !== note.contenu),
      onKeydown: (e) => {
        if (e.ctrlKey && e.key.toLowerCase() === 's') {
          e.preventDefault();
          enregistrer(zone.value);
        }
      },
    });
    zone.value = note.contenu;
    boutons.replaceChildren(
      el('button', { classe: 'bouton petit principal', title: 'Ctrl+S', onClick: () => enregistrer(zone.value) }, icone('coche'), 'Enregistrer'),
      el('button', { classe: 'bouton petit', onClick: () => annuler() }, 'Annuler'));
    corps.replaceChildren(
      el('p', { classe: 'details-aide aide-edition' },
        'Markdown : # Titre, **gras**, *italique*, - liste, [texte](https://…), [[nom-du-projet]] ou [[nom-de-note]] pour un lien interne. Ctrl+S pour enregistrer.'),
      zone);
    zone.focus();
  }

  function dessiner() {
    if (!note) return;
    if (enEdition) dessinerEdition();
    else dessinerLecture();
  }

  async function basculer(edition) {
    enEdition = edition;
    dessiner();
  }

  async function annuler() {
    if (modifiee && !(await confirmer({ titre: 'Abandonner les modifications', message: 'Tes modifications de cette note ne seront pas enregistrées.', bouton: 'Abandonner', danger: true }))) return;
    signalerModification(false);
    basculer(false);
  }

  async function enregistrer(contenu, forcer = false) {
    try {
      const resultat = await api.enregistrer(note.chemin, contenu, note.mtime, forcer);
      if (resultat.modifieeAilleurs) {
        const ok = await confirmer({
          titre: 'Note modifiée ailleurs',
          message: 'Ce fichier a été modifié depuis que tu l\'as ouvert (par exemple dans VS Code ou par Claude).\n\nRemplacer son contenu par ta version ?',
          bouton: 'Remplacer',
          danger: true,
        });
        if (ok) await enregistrer(contenu, true);
        return;
      }
      note = resultat;
      signalerModification(false);
      queueMicrotask(() => actions.marquerNote(onglet.id, { titre: note.titre }));
      enEdition = false;
      dessiner();
      notifier('Note enregistrée.', 'succes');
    } catch (erreur) {
      notifier(erreur.message, 'erreur');
    }
  }

  async function charger() {
    try {
      note = await api.lire(onglet.chemin);
      queueMicrotask(() => actions.marquerNote(onglet.id, { titre: note.titre }));
      dessiner();
    } catch (erreur) {
      titre.textContent = 'Note introuvable';
      corps.replaceChildren(el('div', { classe: 'alerte erreur' }, icone('erreur'), el('div', {}, erreur.message)));
    }
  }

  charger();

  return { element, detruire: () => element.remove() };
}
