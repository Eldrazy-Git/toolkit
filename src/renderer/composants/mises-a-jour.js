// Section « Mises à jour » des Réglages : bibliothèques de Toolkit (package.json), failles
// connues, programmes du PC. Voir src/main/mises-a-jour.js pour les règles de prudence.
import { el, ilYA } from './dom.js';
import { icone } from './icones.js';
import { notifier } from './notifications.js';
import { confirmer } from './dialogue.js';
import * as etat from './etat.js';
import * as actions from './actions.js';

const api = window.toolkit.misesAJour;
const GRAVITES = { critical: ['critique', 'rouge'], high: ['élevée', 'rouge'], moderate: ['moyenne', 'orange'], low: ['faible', 'jaune'], info: ['info', 'neutre'] };

// État local de la section (pas besoin de le partager ailleurs).
let infos = null; // { resultat, automatique, derniereVerification }
let enCours = false;
let erreur = null;
const coches = new Set(); // noms des bibliothèques à installer
let demandeFaite = false;

const redessiner = () => etat.modifier({});

async function charger() {
  try {
    infos = await api.etat();
    if (infos.resultat) preparerCoches(infos.resultat);
  } catch (e) {
    erreur = e.message;
  }
  redessiner();
}

function preparerCoches(resultat) {
  coches.clear();
  for (const p of resultat.paquets) if (p.sure || p.aInstaller) coches.add(p.nom);
}

export async function verifier() {
  if (enCours) return;
  enCours = true;
  erreur = null;
  redessiner();
  try {
    const resultat = await api.verifier();
    infos = { ...(infos || {}), resultat, derniereVerification: resultat.date };
    preparerCoches(resultat);
  } catch (e) {
    erreur = e.message;
  }
  enCours = false;
  redessiner();
}

async function installer() {
  const { paquets } = infos.resultat;
  const choisis = paquets.filter((p) => coches.has(p.nom) && (p.sure || p.aInstaller));
  if (!choisis.length) return;
  const { onglets } = etat.obtenir();
  if (onglets.some((o) => o.nonEnregistre)) {
    notifier('Enregistre d\'abord tes fichiers et notes : Toolkit va devoir se fermer.', 'erreur');
    return;
  }
  const occupes = onglets.filter((o) => o.enCours);
  const ok = await confirmer({
    titre: 'Installer les mises à jour',
    message: `${choisis.map((p) => `• ${p.nom} : ${p.installee} → ${p.sure?.version || p.demandee}`).join('\n')}\n\n`
      + 'Toolkit va se fermer, une fenêtre noire installe les mises à jour (une à deux minutes), puis Toolkit se relance tout seul.\n'
      + 'Une sauvegarde Git du code de Toolkit est faite avant : on peut revenir en arrière.'
      + (occupes.length ? `\n\nAttention : ${occupes.length} terminal(aux) ou script(s) en cours seront arrêtés.` : ''),
    bouton: 'Installer et redémarrer',
  });
  if (!ok) return;
  try {
    await api.installer(choisis.map((p) => ({ nom: p.nom, version: p.sure?.version || null })));
  } catch (e) {
    notifier(e.message, 'erreur');
  }
}

// Changement de version majeure : confié à Claude (lecture des notes de version, adaptation).
function demanderMajeureAClaude(p) {
  const demande = `Je voudrais passer la bibliothèque « ${p.nom} » de Toolkit de la version ${p.installee} à la version ${p.majeure.version} (changement de version majeure). `
    + 'Lis ses notes de version (changelog, guide de migration), dis-moi simplement ce qui change et les risques, puis, si je suis d\'accord, adapte le code de Toolkit. '
    + 'Important : Toolkit tourne depuis ce dossier, donc ne lance pas « npm install » toi-même (electron.exe et node-pty sont verrouillés) ; '
    + 'modifie seulement la version dans package.json et le code, fais un commit, puis dis-moi de cliquer sur « Installer » dans Réglages > Mises à jour. '
    + 'Respecte les décisions notées dans CLAUDE.md (par exemple pour Electron).';
  actions.modifierToolkitAvecClaude(demande);
}

function badge(texte, couleur) {
  return el('span', { classe: `pastille-git petite ${couleur}` }, texte);
}

const dateCourte = (t) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

function lignePaquet(p) {
  const etats = [];
  if (p.erreur) etats.push(el('span', { classe: 'details-aide' }, p.erreur));
  if (p.aInstaller) etats.push(badge(`${p.demandee} prête à installer`, 'bleu'));
  if (p.sure) etats.push(badge(`${p.sure.version} disponible`, 'vert'), el('span', { classe: 'details-aide' }, ` publiée ${ilYA(p.sure.date)}`));
  if (p.attente) etats.push(el('span', { classe: 'details-aide' }, ` · ${p.attente.version} trop récente, proposée à partir du ${dateCourte(p.attente.disponibleLe)}`));
  if (!p.sure && !p.aInstaller && !p.erreur && !p.attente) etats.push(badge('à jour', 'neutre'));
  const cochable = Boolean(p.sure || p.aInstaller);
  return el('div', { classe: 'ligne-maj' },
    el('label', { classe: 'case-maj' },
      el('input', {
        type: 'checkbox',
        disabled: !cochable,
        ...(cochable && coches.has(p.nom) ? { checked: true } : {}),
        onChange: (e) => { if (e.target.checked) coches.add(p.nom); else coches.delete(p.nom); redessiner(); },
      }),
      el('strong', {}, p.nom),
      el('code', {}, p.installee || '—')),
    el('div', { classe: 'etat-maj' }, etats),
    p.majeure
      ? el('div', { classe: 'majeure-maj' },
        badge(`version majeure ${p.majeure.version}`, 'orange'),
        el('span', { classe: 'details-aide' }, p.majeure.mure ? ' peut demander d\'adapter le code. ' : ` publiée ${ilYA(p.majeure.date)} : mieux vaut attendre un peu. `),
        p.majeure.mure ? el('button', { classe: 'bouton petit', onClick: () => demanderMajeureAClaude(p) }, icone('claude'), 'Faire avec Claude') : null)
      : null);
}

function ligneFaille(f) {
  const [libelle, couleur] = GRAVITES[f.gravite] || [f.gravite, 'neutre'];
  return el('div', { classe: 'ligne-maj' },
    el('div', { classe: 'case-maj' }, badge(libelle, couleur), el('strong', {}, f.nom), f.via.length ? el('span', { classe: 'details-aide' }, `(dans ${f.via.join(', ')})`) : null),
    el('ul', { classe: 'titres-faille' }, f.titres.slice(0, 4).map((t) => el('li', {}, t))),
    f.remarque ? el('p', { classe: 'remarque-faille' }, icone('info'), f.remarque) : null);
}

function ligneProgramme(p) {
  return el('div', { classe: 'ligne-maj' },
    el('div', { classe: 'case-maj' }, el('strong', {}, p.nom), el('code', {}, p.installee || 'non trouvé')),
    el('div', { classe: 'etat-maj' },
      p.aJour === null ? el('span', { classe: 'details-aide' }, 'Impossible de comparer.')
        : p.aJour ? badge('à jour', 'neutre')
          : [badge(`${p.derniere} disponible`, 'vert'),
            el('span', { classe: 'details-aide' }, ' Dans PowerShell : '),
            el('code', { classe: 'commande-maj' }, p.commande),
            el('button', {
              classe: 'bouton-icone',
              title: 'Copier la commande',
              onClick: () => navigator.clipboard.writeText(p.commande).then(() => notifier('Commande copiée : colle-la dans PowerShell (clic droit).')).catch(() => {}),
            }, icone('note'))]));
}

export function section() {
  if (!demandeFaite) {
    demandeFaite = true;
    queueMicrotask(charger);
  }
  const r = infos?.resultat;
  const aInstaller = r ? r.paquets.filter((p) => coches.has(p.nom) && (p.sure || p.aInstaller)) : [];
  return el('section', { classe: 'section-reglages section-maj' },
    el('h2', {}, 'Mises à jour'),
    el('p', { classe: 'details-aide' },
      'Bibliothèques utilisées par Toolkit et programmes du PC. Une version publiée depuis moins de 7 jours n\'est pas encore proposée. ',
      'Les « versions majeures », qui peuvent demander d\'adapter le code, se font avec Claude.'),
    el('div', { classe: 'details-boutons' },
      el('button', { classe: 'bouton', disabled: enCours, onClick: verifier }, icone('recherche'), enCours ? 'Vérification…' : 'Vérifier maintenant'),
      el('label', { classe: 'champ-case en-ligne' },
        el('input', {
          type: 'checkbox',
          ...(infos?.automatique !== false ? { checked: true } : {}),
          onChange: (e) => api.automatique(e.target.checked).then(() => { infos = { ...(infos || {}), automatique: e.target.checked }; }).catch(() => {}),
        }),
        'Vérifier automatiquement une fois par semaine'),
      infos?.derniereVerification ? el('span', { classe: 'details-aide' }, `Dernière vérification : ${ilYA(infos.derniereVerification)}`) : null),
    erreur ? el('p', { classe: 'dialogue-erreur' }, erreur) : null,
    r ? [
      el('h3', {}, 'Bibliothèques de Toolkit'),
      r.paquets.map(lignePaquet),
      el('p', { classe: 'details-aide' }, 'Electron : décision notée dans CLAUDE.md (passer à une nouvelle version majeure seulement quand elle a quelques correctifs).'),
      el('div', { classe: 'details-boutons' },
        el('button', { classe: 'bouton principal', disabled: !aInstaller.length, onClick: installer }, icone('importer'),
          aInstaller.length ? `Installer ${aInstaller.length} mise(s) à jour et redémarrer` : 'Rien à installer')),
      el('h3', {}, 'Failles de sécurité connues'),
      r.audit === null ? el('p', { classe: 'details-aide' }, 'Vérification impossible (npm audit n\'a pas répondu).')
        : r.audit.length ? r.audit.map(ligneFaille) : el('p', { classe: 'details-aide' }, 'Aucune faille connue.'),
      el('h3', {}, 'Programmes du PC'),
      el('p', { classe: 'details-aide' }, 'Ils sont installés pour tout le PC : Toolkit ne les met pas à jour lui-même. Copie la commande et lance-la dans PowerShell.'),
      r.programmes.map(ligneProgramme),
    ] : (enCours ? null : el('p', { classe: 'details-aide' }, 'Clique sur « Vérifier maintenant » (connexion Internet nécessaire).')));
}
