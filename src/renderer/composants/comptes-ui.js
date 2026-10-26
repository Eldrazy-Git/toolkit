// Page « Comptes » des Réglages (et étape du premier lancement) : compte Claude et comptes
// GitHub utilisés par Toolkit. Se connecter ouvre un terminal où l'outil officiel lance le
// navigateur ; Toolkit ne voit jamais de mot de passe. Voir src/main/comptes.js.
import { el } from './dom.js';
import { icone } from './icones.js';
import { notifier } from './notifications.js';
import { confirmer, fenetre } from './dialogue.js';
import * as actions from './actions.js';

const api = window.toolkit.comptes;
const ABONNEMENTS = { pro: 'Pro', max: 'Max', team: 'Team', enterprise: 'Enterprise', free: 'gratuit' };

function statut(ok, texte) {
  return el('span', { classe: `statut ${ok ? 'ok' : 'erreur'}` }, icone(ok ? 'coche' : 'erreur'), texte);
}

function blocClaude(c, recharger) {
  if (!c.installe) {
    return [statut(false, 'Claude Code n\'est pas installé'),
      el('p', { classe: 'details-aide' }, 'Installe-le (Réglages > Général > Programmes, ou dans PowerShell : irm https://claude.ai/install.ps1 | iex), puis reviens ici.')];
  }
  if (!c.connecte) {
    return [statut(false, 'Non connecté'),
      el('div', { classe: 'details-boutons' },
        el('button', { classe: 'bouton principal', onClick: () => actions.connecterCompte('claude') }, icone('utilisateur'), 'Se connecter à Claude'))];
  }
  return [
    statut(true, `Connecté : ${c.email || 'compte Claude'}`),
    el('p', { classe: 'details-aide' }, [
      c.abonnement ? `Abonnement ${ABONNEMENTS[c.abonnement] || c.abonnement}` : null,
      c.organisation ? `organisation « ${c.organisation} »` : null,
    ].filter(Boolean).join(' · ')),
    el('div', { classe: 'details-boutons' },
      el('button', { classe: 'bouton', onClick: () => actions.connecterCompte('claude') }, icone('utilisateur'), 'Changer de compte'),
      el('button', {
        classe: 'bouton',
        onClick: async () => {
          const ok = await confirmer({ titre: 'Se déconnecter de Claude', message: `Déconnecter ${c.email || 'ce compte'} de Claude Code sur ce PC ?\nClaude ne fonctionnera plus (dans Toolkit, VS Code…) tant que tu ne te reconnectes pas.`, bouton: 'Se déconnecter', danger: true });
          if (!ok) return;
          try {
            await api.deconnecterClaude();
            notifier('Déconnecté de Claude.', 'succes');
          } catch (erreur) {
            notifier(erreur.message, 'erreur');
          }
          recharger();
        },
      }, 'Se déconnecter')),
  ];
}

function blocGithub(g, recharger) {
  if (!g.installe) {
    return [statut(false, 'GitHub CLI (gh) n\'est pas installé'),
      el('p', { classe: 'details-aide' }, 'Il sert seulement à envoyer tes projets sur GitHub. Pour l\'installer, dans PowerShell : winget install GitHub.cli, puis redémarre Toolkit.')];
  }
  const ajouter = el('button', { classe: `bouton${g.comptes.length ? '' : ' principal'}`, onClick: () => actions.connecterCompte('github') },
    icone('utilisateur'), g.comptes.length ? 'Ajouter un autre compte' : 'Se connecter à GitHub');
  if (!g.comptes.length) return [statut(false, 'Non connecté'), el('div', { classe: 'details-boutons' }, ajouter)];
  return [
    el('div', { classe: 'liste-comptes' }, g.comptes.map((c) => el('div', { classe: `ligne-compte${c.actif ? ' actif' : ''}` },
      icone(c.actif ? 'coche' : 'utilisateur'),
      el('strong', {}, c.nom),
      c.actif ? el('span', { classe: 'pastille-git petite vert' }, 'utilisé par Toolkit') : null,
      el('span', { classe: 'espace' }),
      c.actif ? null : el('button', {
        classe: 'bouton petit',
        onClick: async () => {
          try {
            await api.changerGithub(c.nom);
            notifier(`Toolkit utilise maintenant le compte GitHub « ${c.nom} ».`, 'succes');
          } catch (erreur) {
            notifier(erreur.message, 'erreur');
          }
          recharger();
        },
      }, 'Utiliser ce compte'),
      el('button', {
        classe: 'bouton petit',
        onClick: async () => {
          const ok = await confirmer({ titre: 'Se déconnecter de GitHub', message: `Déconnecter le compte « ${c.nom} » de GitHub CLI sur ce PC ?\nTes dépôts ne sont pas touchés ; tu pourras te reconnecter quand tu veux.`, bouton: 'Se déconnecter', danger: true });
          if (!ok) return;
          try {
            await api.deconnecterGithub(c.nom);
            notifier(`Compte « ${c.nom} » déconnecté.`, 'succes');
          } catch (erreur) {
            notifier(erreur.message, 'erreur');
          }
          recharger();
        },
      }, 'Se déconnecter')))),
    el('div', { classe: 'details-boutons' }, ajouter),
  ];
}

// Connexion à GitHub dans une fenêtre simple (pas de terminal) : code à usage unique déjà
// copié, bouton pour ouvrir la page de GitHub ; la fenêtre se ferme toute seule à la fin.
export async function connecterGithub() {
  let infos;
  try {
    infos = await api.connecterGithub();
  } catch (erreur) {
    notifier(erreur.message, 'erreur');
    return;
  }
  navigator.clipboard.writeText(infos.code).catch(() => {});
  let fermerFenetre = null;
  let fini = false;
  const arreter = api.surFinGithub(({ reussi, erreur }) => {
    fini = true;
    arreter();
    fermerFenetre?.();
    notifier(reussi ? 'Connecté à GitHub.' : `La connexion à GitHub n'a pas abouti (${erreur}).`, reussi ? 'succes' : 'erreur');
    window.dispatchEvent(new CustomEvent('toolkit:comptes'));
  });
  const ouvrirPage = () => window.toolkit.liens.ouvrirExterne(infos.url).catch(() => {});
  await fenetre({
    titre: 'Se connecter à GitHub',
    corps: el('div', { classe: 'connexion-github' },
      el('p', {}, '1. Ouvre la page de GitHub (bouton ci-dessous) et connecte-toi si besoin.'),
      el('p', {}, '2. Saisis ce code (il est déjà copié : colle-le avec Ctrl+V) :'),
      el('div', { classe: 'code-connexion' }, infos.code,
        el('button', { classe: 'bouton petit', onClick: () => navigator.clipboard.writeText(infos.code).then(() => notifier('Code copié.')).catch(() => {}) }, 'Copier')),
      el('p', {}, '3. Clique sur « Authorize » (Autoriser) sur GitHub. Cette fenêtre se fermera toute seule.'),
      el('p', { classe: 'details-aide' }, 'Ton mot de passe est saisi sur github.com uniquement : Toolkit ne le voit jamais.')),
    boutons: [{ libelle: 'Ouvrir la page de GitHub', style: 'principal', action: ouvrirPage }],
    surOuverture: (fermer) => { fermerFenetre = () => fermer(null); },
  });
  // Fenêtre fermée avant la fin : connexion annulée.
  if (!fini) {
    arreter();
    api.annulerGithub().catch(() => {});
  }
}

// Contenu rempli de façon asynchrone ; se met à jour après une connexion (événement « toolkit:comptes »).
export function blocComptes() {
  const zoneClaude = el('div', { classe: 'bloc-compte' }, el('p', { classe: 'details-aide' }, 'Vérification…'));
  const zoneGithub = el('div', { classe: 'bloc-compte' }, el('p', { classe: 'details-aide' }, 'Vérification…'));
  const conteneur = el('div', { classe: 'page-comptes' },
    el('section', { classe: 'section-reglages' },
      el('h2', {}, 'Claude'),
      el('p', { classe: 'details-aide' }, 'Compte utilisé par Claude Code (dans Toolkit, mais aussi dans VS Code ou PowerShell sur ce PC).'),
      zoneClaude),
    el('section', { classe: 'section-reglages' },
      el('h2', {}, 'GitHub'),
      el('p', { classe: 'details-aide' }, 'Compte utilisé pour envoyer tes projets sur GitHub (commande « gh »). Plusieurs comptes peuvent être connectés ; un seul est utilisé à la fois.'),
      zoneGithub));
  const recharger = async () => {
    try {
      const { claude, github } = await api.etat();
      zoneClaude.replaceChildren(...blocClaude(claude, recharger));
      zoneGithub.replaceChildren(...blocGithub(github, recharger));
    } catch (erreur) {
      zoneClaude.replaceChildren(el('p', { classe: 'dialogue-erreur' }, erreur.message));
    }
  };
  // Après une connexion dans le terminal : mise à jour (tant que la page est affichée).
  const surComptes = () => {
    if (!conteneur.isConnected) {
      window.removeEventListener('toolkit:comptes', surComptes);
      return;
    }
    recharger();
  };
  window.addEventListener('toolkit:comptes', surComptes);
  recharger();
  return conteneur;
}

export function pageComptes() {
  return [
    el('p', { classe: 'details-aide' }, 'Pour te connecter ou changer de compte, Toolkit ouvre un onglet où l\'outil officiel (Claude Code ou GitHub CLI) lance ton navigateur. Ton mot de passe est saisi sur le site de Claude ou de GitHub : Toolkit ne le voit jamais.'),
    blocComptes(),
  ];
}
