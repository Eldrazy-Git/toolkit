// Pages « Claude », « Éditeur », « Interface » et « Raccourcis » des Réglages.
import { el } from './dom.js';
import { icone } from './icones.js';
import { notifier } from './notifications.js';
import { confirmer } from './dialogue.js';
import * as preferences from './preferences.js';
import * as raccourcis from './raccourcis.js';

// --- Petits contrôles ---------------------------------------------------------------------------

export function caseACocher(groupe, cle, libelle, aide) {
  const c = el('input', { type: 'checkbox', onChange: () => preferences.modifier(groupe, { [cle]: c.checked }) });
  c.checked = Boolean(preferences.lire(groupe)[cle]);
  return el('label', { classe: 'champ-formulaire champ-case' }, c, el('span', { classe: 'champ-libelle' }, libelle), aide ? el('span', { classe: 'champ-aide' }, aide) : null);
}

export function choix(groupe, cle, libelle, options, aide, convertir = (v) => v) {
  const s = el('select', { onChange: () => preferences.modifier(groupe, { [cle]: convertir(s.value) }) },
    options.map(([valeur, texte]) => el('option', { value: String(valeur) }, texte)));
  s.value = String(preferences.lire(groupe)[cle]);
  return el('label', { classe: 'champ-formulaire' }, el('span', { classe: 'champ-libelle' }, libelle), s, aide ? el('span', { classe: 'champ-aide' }, aide) : null);
}

function section(titre, aide, ...contenu) {
  return el('section', { classe: 'section-reglages' }, el('h2', {}, titre), aide ? el('p', { classe: 'details-aide' }, aide) : null, el('div', { classe: 'page-formulaire' }, contenu));
}

// --- Claude ----------------------------------------------------------------------------------

export function pageClaude() {
  const p = preferences.lire('claude');
  const zone = el('textarea', { rows: 8, spellcheck: 'true', placeholder: 'Par exemple :\n- Explique-moi toujours ce que tu vas faire avant de le faire.\n- Écris les commentaires du code en français.\n- Demande-moi avant de supprimer un fichier.\n- Pour les projets Android, vise Android 8 minimum.' });
  zone.value = p.consignes;
  let minuterie = null;
  const etatEnregistrement = el('span', { classe: 'details-aide' });
  zone.addEventListener('input', () => {
    etatEnregistrement.textContent = '…';
    clearTimeout(minuterie);
    minuterie = setTimeout(async () => {
      await preferences.modifier('claude', { consignes: zone.value.trim() });
      etatEnregistrement.textContent = 'Enregistré : Claude en tiendra compte à sa prochaine session.';
    }, 800);
  });
  return [
    section('Tes consignes pour Claude',
      'Elles s\'appliquent à TOUS tes projets et à Toolkit lui-même : Toolkit les écrit dans un fichier CLAUDE.md à la racine du dossier Toolkit, que Claude Code lit automatiquement (même lancé depuis VS Code).',
      zone, etatEnregistrement),
    section('Lancement de Claude depuis Toolkit', null,
      choix('claude', 'modele', 'Modèle', [
        ['', 'Celui choisi dans Claude Code (par défaut)'],
        ['fable', 'Fable — le plus capable'],
        ['opus', 'Opus — très capable'],
        ['sonnet', 'Sonnet — équilibré et rapide'],
        ['haiku', 'Haiku — le plus rapide, pour les petites tâches'],
      ], 'Selon ton abonnement, certains modèles peuvent ne pas être disponibles ou consommer ton quota plus vite. Modifiable aussi pour un seul onglet, avec le bouton du terminal de Claude.'),
      choix('claude', 'effort', 'Effort', [
        ['', 'Celui choisi dans Claude Code (par défaut)'],
        ['low', 'Faible — réponses rapides, pour les petites tâches'],
        ['medium', 'Moyen'],
        ['high', 'Élevé'],
        ['xhigh', 'Très élevé'],
        ['max', 'Maximum — réfléchit le plus longtemps'],
      ], 'Plus l\'effort est élevé, plus Claude réfléchit avant d\'agir : meilleur sur les tâches difficiles, mais plus lent et consomme plus de quota.'),
      choix('claude', 'autonomie', 'Autonomie', [
        ['', 'Celle réglée dans Claude Code (par défaut)'],
        ['manual', 'Me demander avant chaque modification et chaque commande'],
        ['acceptEdits', 'Modifier les fichiers sans demander, me demander pour les commandes'],
        ['auto', 'Automatique : Claude ne demande que pour les actions risquées'],
        ['plan', 'Plan d\'abord : Claude propose un plan avant de modifier quoi que ce soit'],
      ], 'Quel que soit ce choix, Toolkit fait une sauvegarde Git avant que Claude travaille.'),
      caseACocher('claude', 'notifications', 'Me prévenir quand Claude a fini ou attend une réponse',
        'Notification Windows et onglet signalé, quand tu regardes ailleurs (autre onglet ou autre fenêtre).')),
  ];
}

// --- Éditeur -----------------------------------------------------------------------------------

export function pageEditeur() {
  return [
    section('Éditeur de code', 'Les changements s\'appliquent tout de suite aux onglets « Code » ouverts.',
      choix('editeur', 'taillePolice', 'Taille du texte', [10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24].map((t) => [t, `${t} px${t === 14 ? ' (par défaut)' : ''}`]), null, Number),
      choix('editeur', 'police', 'Police', [
        ['Cascadia Code', 'Cascadia Code (par défaut)'], ['Consolas', 'Consolas'], ['Courier New', 'Courier New'], ['Fira Code', 'Fira Code (si installée)'], ['JetBrains Mono', 'JetBrains Mono (si installée)'],
      ]),
      caseACocher('editeur', 'retourLigne', 'Retour à la ligne automatique', 'Les longues lignes passent à la ligne au lieu de dépasser à droite.'),
      choix('editeur', 'enregistrementAuto', 'Enregistrement automatique', [
        ['non', 'Non : j\'enregistre avec Ctrl+S (par défaut)'],
        ['delai', 'Une seconde après la dernière frappe'],
        ['focus', 'Quand je quitte le fichier (autre fichier, autre fenêtre)'],
      ], 'Un fichier modifié ailleurs entre-temps (par Claude…) n\'est jamais écrasé : Toolkit te demande quoi faire.'),
      choix('editeur', 'tabulation', 'Indentation', [
        ['auto', 'Détectée d\'après le fichier (par défaut)'], ['2', '2 espaces'], ['4', '4 espaces'], ['tab', 'Tabulations'],
      ]),
      caseACocher('editeur', 'miniCarte', 'Mini-carte à droite du code'),
      caseACocher('editeur', 'apercuParDefaut', 'Afficher l\'aperçu (HTML, Markdown, layouts…) par défaut')),
  ];
}

// --- Interface -----------------------------------------------------------------------------------

const SECTIONS_BARRE = [['recents', 'Récents'], ['epingles', 'Projets épinglés'], ['groupes', 'Groupes'], ['categories', 'Catégories'], ['tags', 'Tags']];

export function pageInterface() {
  const masquees = preferences.lire('interface').sectionsMasquees;
  return [
    section('Affichage', null,
      choix('interface', 'zoom', 'Taille de l\'interface', [50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200].map((z) => [z, `${z} %${z === 100 ? ' (normale)' : ''}`]),
        `Aussi au clavier : ${raccourcis.afficher(raccourcis.touche('zoomPlus'))} / ${raccourcis.afficher(raccourcis.touche('zoomMoins'))} / ${raccourcis.afficher(raccourcis.touche('zoomNormal'))}.`, Number)),
    section('Démarrage', null,
      caseACocher('interface', 'restaurerOnglets', 'Rouvrir les onglets de la dernière fois',
        'Outils, onglets « Code » (avec leurs fichiers) et notes. Les terminaux et Claude ne sont pas relancés.')),
    section('Barre latérale', 'Sections affichées :',
      SECTIONS_BARRE.map(([id, libelle]) => {
        const c = el('input', {
          type: 'checkbox',
          onChange: () => {
            const actuelles = preferences.lire('interface').sectionsMasquees.filter((s) => s !== id);
            preferences.modifier('interface', { sectionsMasquees: c.checked ? actuelles : [...actuelles, id] });
          },
        });
        c.checked = !masquees.includes(id);
        return el('label', { classe: 'champ-formulaire champ-case' }, c, el('span', { classe: 'champ-libelle' }, libelle));
      })),
  ];
}

// --- Raccourcis ---------------------------------------------------------------------------------

// Attend une combinaison de touches (Échap annule, Retour arrière la supprime).
function capturer(commande, rafraichir) {
  const fenetre = el('div', { classe: 'voile' },
    el('div', { classe: 'dialogue' },
      el('h2', {}, commande.libelle),
      el('p', {}, 'Appuie sur la nouvelle combinaison de touches (par exemple Ctrl+Maj+L).\nÉchap : annuler. Retour arrière : supprimer ce raccourci.'),
      el('p', { classe: 'capture-touches' }, '…')));
  const affichage = fenetre.querySelector('.capture-touches');
  const fin = () => {
    document.removeEventListener('keydown', surTouche, true);
    fenetre.remove();
  };
  async function surTouche(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') { fin(); return; }
    const combi = e.key === 'Backspace' && !e.ctrlKey && !e.altKey ? '' : raccourcis.combinaison(e);
    if (combi === null) return; // modificateur seul : on attend la suite
    if (combi && !/^(Ctrl|Alt)\+/.test(combi) && !/^F\d+$/.test(combi)) {
      affichage.textContent = `${raccourcis.afficher(combi)} : utilise Ctrl ou Alt avec une autre touche (ou une touche F1 à F12).`;
      return;
    }
    fin();
    // Combinaison réservée par un autre programme du PC : elle n'arriverait jamais à Toolkit.
    if (combi && (await window.toolkit.application.raccourcisPris([combi]).catch(() => [])).length) {
      const proprietaire = (await window.toolkit.application.proprietairesRaccourcis([combi]).catch(() => ({})))[combi];
      const quandMeme = await confirmer({
        titre: 'Raccourci pris par un autre programme',
        message: `${raccourcis.afficher(combi)} est déjà utilisé par ${proprietaire ? `« ${proprietaire} »` : 'un autre programme de ton PC (par exemple AMD Radeon Software, PowerToys, Logi Options+…)'}. Windows le lui donne avant Toolkit : il ne fonctionnerait donc pas ici.\n\nChoisis plutôt une autre combinaison, ou désactive ce raccourci dans l'autre programme.`,
        bouton: 'L\'enregistrer quand même',
      });
      if (!quandMeme) return;
    }
    const conflit = combi && raccourcis.COMMANDES.find((c) => c.id !== commande.id && raccourcis.touche(c.id) === combi
      && (c.zone === commande.zone || c.zone === 'partout' || commande.zone === 'partout'));
    if (conflit) {
      const ok = await confirmer({
        titre: 'Raccourci déjà utilisé',
        message: `${raccourcis.afficher(combi)} sert déjà à « ${conflit.libelle} ». Le lui retirer et le donner à « ${commande.libelle} » ?`,
        bouton: 'Remplacer',
      });
      if (!ok) return;
      await preferences.modifier('raccourcis', { ...preferences.lire('raccourcis'), [conflit.id]: '' });
    }
    await preferences.modifier('raccourcis', { ...preferences.lire('raccourcis'), [commande.id]: combi });
    notifier(combi ? `« ${commande.libelle} » : ${raccourcis.afficher(combi)}` : `Raccourci de « ${commande.libelle} » supprimé.`, 'succes');
    rafraichir();
  }
  document.body.append(fenetre);
  document.addEventListener('keydown', surTouche, true);
}

export function pageRaccourcis(rafraichir) {
  const choisis = preferences.lire('raccourcis');
  const ligne = (c) => {
    const actuelle = raccourcis.touche(c.id);
    const modifie = Object.prototype.hasOwnProperty.call(choisis, c.id) && choisis[c.id] !== c.defaut;
    return el('div', { classe: 'ligne-raccourci', 'data-combinaison': actuelle },
      el('span', { classe: 'libelle-raccourci' }, c.libelle,
        el('span', { classe: 'raccourci-pris', hidden: true, title: 'Windows donne ce raccourci à un autre programme avant Toolkit : choisis-en un autre, ou désactive-le dans cet autre programme.' },
          icone('attention'), 'déjà pris par un autre programme du PC')),
      actuelle ? el('kbd', {}, raccourcis.afficher(actuelle)) : el('span', { classe: 'details-aide' }, 'aucun'),
      el('button', { classe: 'bouton petit', onClick: () => capturer(c, rafraichir) }, icone('crayon'), 'Modifier'),
      modifie
        ? el('button', {
          classe: 'bouton-icone',
          title: `Revenir à ${raccourcis.afficher(c.defaut) || 'aucun raccourci'}`,
          onClick: async () => {
            const copie = { ...preferences.lire('raccourcis') };
            delete copie[c.id];
            await preferences.modifier('raccourcis', copie);
            rafraichir();
          },
        }, icone('redemarrer'))
        : null);
  };
  // Après l'affichage : signale les raccourcis réservés par un autre programme du PC.
  const combinaisons = [...new Set(raccourcis.COMMANDES.map((c) => raccourcis.touche(c.id)).filter(Boolean))];
  window.toolkit.application.raccourcisPris(combinaisons).then(async (pris) => {
    const proprietaires = pris.length ? await window.toolkit.application.proprietairesRaccourcis(pris).catch(() => ({})) : {};
    document.querySelectorAll('.ligne-raccourci').forEach((l) => {
      const marque = l.querySelector('.raccourci-pris');
      if (!marque) return;
      marque.hidden = !pris.includes(l.dataset.combinaison);
      const proprietaire = proprietaires[l.dataset.combinaison];
      if (proprietaire) marque.lastChild.textContent = `déjà pris par ${proprietaire}`;
    });
  }).catch(() => {});
  return [
    section('Partout dans Toolkit', null, raccourcis.COMMANDES.filter((c) => c.zone === 'partout').map(ligne)),
    section('Dans l\'éditeur de code', null, raccourcis.COMMANDES.filter((c) => c.zone === 'editeur').map(ligne)),
    section('Raccourcis de l\'éditeur (non modifiables)', null,
      el('dl', { classe: 'infos' }, raccourcis.RACCOURCIS_EDITEUR.flatMap(([t, d]) => [el('dt', {}, t), el('dd', {}, d)]))),
    el('button', {
      classe: 'bouton',
      onClick: async () => {
        if (!(await confirmer({ titre: 'Raccourcis par défaut', message: 'Remettre tous les raccourcis clavier par défaut ?', bouton: 'Tout remettre' }))) return;
        await preferences.modifier('raccourcis', {});
        rafraichir();
      },
    }, icone('redemarrer'), 'Tout remettre par défaut'),
  ];
}
