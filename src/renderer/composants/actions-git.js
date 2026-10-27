// Actions du panneau Git et GitHub (et de la section Git du panneau de détails).
// L'état de chaque dépôt est rangé dans etat.git sous la clé de sa cible.
import * as etat from './etat.js';
import { notifier } from './notifications.js';
import { confirmer, formulaire, informer } from './dialogue.js';

const api = window.toolkit.git;

const AIDE_GITHUB = 'Pour utiliser GitHub depuis Toolkit :\n\n'
  + '1. Ouvre PowerShell et tape : winget install GitHub.cli\n'
  + '2. Ferme PowerShell, rouvre-le et tape : gh auth login\n'
  + '   Choisis : GitHub.com > HTTPS > Login with a web browser,\n'
  + '   puis suis les instructions dans le navigateur.\n'
  + '3. Reviens dans Toolkit et clique sur « Actualiser ».\n\n'
  + 'Toolkit ne stocke jamais ton mot de passe : il utilise cette connexion.';

export const cle = (cible) => `${cible.type}:${cible.id || ''}`;

export function etatDe(cible) {
  return etat.obtenir().git[cle(cible)] || null;
}

// Peut-on envoyer (push) ce dépôt ?
export function peutEnvoyer(e) {
  return Boolean(e?.estDepot && e.remote && !e.aucunCommit && (e.enAvance > 0 || !e.amont));
}

function enregistrerEtat(e) {
  etat.modifier({ git: { ...etat.obtenir().git, [cle(e.cible)]: e } });
}

function occuper(cible, texte) {
  const occupe = { ...etat.obtenir().gitOccupe };
  if (texte) occupe[cle(cible)] = texte;
  else delete occupe[cle(cible)];
  etat.modifier({ gitOccupe: occupe });
}

// --- Chargement ------------------------------------------------------------------------------

export async function chargerGithub() {
  try {
    etat.modifier({ github: await window.toolkit.github.etat() });
  } catch (erreur) {
    notifier(erreur.message, 'erreur');
  }
}

export async function chargerTout() {
  etat.modifier({ gitChargement: true });
  chargerGithub();
  try {
    const liste = await api.etats();
    const git = {};
    for (const e of liste) git[cle(e.cible)] = e;
    etat.modifier({ git, gitOrdre: liste.map((e) => cle(e.cible)) });
  } catch (erreur) {
    notifier(erreur.message, 'erreur');
  } finally {
    etat.modifier({ gitChargement: false });
  }
}

export async function rafraichir(cible) {
  try {
    enregistrerEtat(await api.etat(cible));
  } catch (erreur) {
    notifier(erreur.message, 'erreur');
  }
}

// Exécute une opération Git sur une cible, affiche l'erreur éventuelle et rafraîchit l'état.
async function operation(cible, texte, fonction, titreErreur) {
  occuper(cible, texte);
  try {
    return await fonction();
  } catch (erreur) {
    informer({ titre: titreErreur, message: erreur.message });
    return undefined;
  } finally {
    occuper(cible, null);
    await rafraichir(cible);
  }
}

// --- Opérations ------------------------------------------------------------------------------

export async function commit(cible) {
  const e = etatDe(cible);
  if (!e || e.nbModifications === 0) {
    notifier('Rien à enregistrer : aucun fichier modifié.');
    return;
  }
  const liste = e.modifications.slice(0, 12).map((m) => `• ${m.chemin} (${m.etat})`).join('\n');
  const reste = e.nbModifications > 12 ? `\n… et ${e.nbModifications - 12} autre(s)` : '';
  const valeurs = await formulaire({
    titre: `Commit — ${e.nom}`,
    message: `Enregistre une version de ces fichiers dans l'historique (sur ce PC, rien n'est envoyé) :\n${liste}${reste}`,
    champs: [{
      id: 'message',
      libelle: 'Décris les changements en quelques mots',
      type: 'texte',
      obligatoire: true,
      exemple: 'Par exemple : Ajout du bouton Effacer',
    }],
    bouton: 'Commit',
  });
  if (!valeurs) return;
  const resultat = await operation(cible, 'Commit…', () => api.commit(cible, valeurs.message), 'Le commit a échoué');
  if (resultat) notifier('Version enregistrée dans l\'historique Git.', 'succes');
}

export async function pousser(cible) {
  const resultat = await operation(cible, 'Envoi…', () => api.push(cible), 'L\'envoi sur GitHub a échoué');
  if (resultat) notifier(`« ${etatDe(cible)?.nom} » envoyé sur GitHub.`, 'succes');
}

export async function recuperer(cible) {
  const resultat = await operation(cible, 'Récupération…', () => api.pull(cible), 'La récupération depuis GitHub a échoué');
  if (resultat) notifier(resultat.message, 'succes');
}

export async function verifierEnLigne() {
  etat.modifier({ gitVerification: true });
  try {
    const erreurs = await api.verifierEnLigne();
    await chargerTout();
    if (erreurs.length) informer({ titre: 'Vérification en ligne incomplète', message: erreurs.join('\n\n') });
    else notifier('Vérification en ligne terminée.', 'succes');
  } catch (erreur) {
    notifier(erreur.message, 'erreur');
  } finally {
    etat.modifier({ gitVerification: false });
  }
}

export async function toutPousser() {
  const { git, gitOrdre = [] } = etat.obtenir();
  const aEnvoyer = gitOrdre.map((c) => git[c]).filter(peutEnvoyer);
  if (aEnvoyer.length === 0) {
    notifier('Rien à envoyer : tous les projets reliés à GitHub sont à jour.');
    return;
  }
  const lignes = aEnvoyer.map((e) => `• ${e.nom} : ${e.amont ? `${e.enAvance} commit(s)` : 'première publication'}`);
  const nonCommites = aEnvoyer.filter((e) => e.nbModifications > 0).map((e) => e.nom);
  const ok = await confirmer({
    titre: 'Tout envoyer sur GitHub',
    message: `Chaque projet sera envoyé vers son dépôt GitHub (ou son dossier du dépôt partagé) :\n${lignes.join('\n')}`
      + (nonCommites.length ? `\n\nAttention : ${nonCommites.join(', ')} ont des modifications pas encore « commitées » ; elles ne seront pas envoyées.` : ''),
    bouton: `Envoyer ${aEnvoyer.length} projet(s)`,
  });
  if (!ok) return;
  const reussis = [];
  const echecs = [];
  for (const e of aEnvoyer) {
    occuper(e.cible, 'Envoi…');
    try {
      await api.push(e.cible);
      reussis.push(e.nom);
    } catch (erreur) {
      echecs.push(`${e.nom} : ${erreur.message}`);
    } finally {
      occuper(e.cible, null);
      await rafraichir(e.cible);
    }
  }
  if (echecs.length) {
    informer({
      titre: `${reussis.length} envoyé(s), ${echecs.length} échec(s)`,
      message: `${reussis.length ? `Envoyés : ${reussis.join(', ')}\n\n` : ''}Échecs :\n${echecs.join('\n\n')}`,
    });
  } else {
    notifier(`${reussis.length} projet(s) envoyé(s) sur GitHub.`, 'succes');
  }
}

export async function initialiser(cible) {
  const resultat = await operation(cible, 'Activation…', () => api.initialiser(cible), 'L\'activation de Git a échoué');
  if (resultat) notifier('Historique Git activé (premier commit fait).', 'succes');
}

export async function proteger(cible) {
  const lignes = await operation(cible, 'Protection…', () => api.proteger(cible), 'La protection a échoué');
  if (lignes) {
    notifier(lignes.length
      ? `.gitignore complété : ${lignes.join(', ')}. Pense à faire un Commit.`
      : 'Le .gitignore protégeait déjà les fichiers sensibles.', 'succes');
  }
}

export async function creerGithub(cible) {
  const { github } = etat.obtenir();
  if (!github?.installe || !github.connecte) {
    informer({ titre: 'GitHub n\'est pas connecté', message: AIDE_GITHUB });
    return;
  }
  const e = etatDe(cible);
  const nom = cible.type === 'projet' ? cible.id : 'toolkit';
  const ok = await confirmer({
    titre: 'Créer un dépôt GitHub privé',
    message: `Un dépôt PRIVÉ nommé « ${nom} » va être créé sur le compte GitHub « ${github.compte} », et l'historique de « ${e?.nom} » y sera envoyé.\n\nSeul toi pourras le voir.`,
    bouton: 'Créer et envoyer',
  });
  if (!ok) return;
  const resultat = await operation(cible, 'Création du dépôt…', () => api.creerGithub(cible), 'La création du dépôt GitHub a échoué');
  if (resultat) notifier(`Dépôt privé créé : ${resultat.url}`, 'succes');
}

// Dépôt GitHub PARTAGÉ : le projet est envoyé dans un dossier d'un dépôt commun à plusieurs
// projets (pratique pour les petites pages HTML : un seul dépôt au lieu d'un par projet).
const NOUVEAU = '\u0000nouveau';
const ADRESSE = '\u0000adresse';

export async function rejoindrePartage(cible) {
  const { github } = etat.obtenir();
  if (!github?.installe || !github.connecte) {
    informer({ titre: 'GitHub n\'est pas connecté', message: AIDE_GITHUB });
    return;
  }
  let existants = [];
  try {
    existants = await api.depotsPartages();
  } catch (erreur) {
    notifier(erreur.message, 'erreur');
    return;
  }
  const nomDepot = (remote) => remote.replace(/\.git$/i, '').split('/').pop();
  const e = etatDe(cible);
  const valeurs = await formulaire({
    titre: 'Envoyer dans un dépôt GitHub partagé',
    message: `Au lieu d'avoir son propre dépôt, « ${e?.nom} » sera rangé dans un dossier d'un dépôt GitHub PRIVÉ commun à plusieurs projets. `
      + 'L\'historique et le retour arrière restent propres à chaque projet, sur ce PC.',
    champs: [
      { id: 'depot', libelle: 'Dépôt partagé', type: 'choix', valeur: existants[0]?.remote || NOUVEAU, options: [
        ...existants.map((d) => ({ valeur: d.remote, libelle: `${nomDepot(d.remote)} (${d.projets.length} projet(s) : ${d.projets.slice(0, 3).join(', ')}${d.projets.length > 3 ? '…' : ''})` })),
        { valeur: NOUVEAU, libelle: 'Créer un nouveau dépôt privé…' },
        { valeur: ADRESSE, libelle: 'Un dépôt GitHub qui existe déjà (adresse)…' },
      ] },
      { id: 'texte', libelle: 'Nom du nouveau dépôt, ou adresse du dépôt existant', obligatoire: false, valeur: existants.length ? '' : 'pages-html',
        exemple: 'pages-html  ou  https://github.com/moi/mes-pages',
        aide: 'Seulement si tu crées un dépôt ou si tu indiques un dépôt existant.' },
      { id: 'dossier', libelle: 'Nom du dossier de ce projet dans le dépôt', obligatoire: true, valeur: cible.id },
    ],
    bouton: 'Envoyer',
  });
  if (!valeurs) return;
  let choix;
  if (valeurs.depot === NOUVEAU) {
    if (!valeurs.texte) return informer({ titre: 'Nom manquant', message: 'Indique le nom du nouveau dépôt (par exemple : pages-html).' });
    choix = { nouveau: valeurs.texte };
  } else if (valeurs.depot === ADRESSE) {
    if (!/^(https:\/\/|git@)/i.test(valeurs.texte)) return informer({ titre: 'Adresse manquante', message: 'Indique l\'adresse du dépôt, par exemple https://github.com/moi/mes-pages' });
    choix = { remote: valeurs.texte };
  } else {
    choix = { remote: valeurs.depot };
  }
  const resultat = await operation(cible, 'Envoi…', () => api.rejoindrePartage(cible, choix, valeurs.dossier), 'L\'envoi dans le dépôt partagé a échoué');
  if (resultat) notifier(`« ${e?.nom} » envoyé dans le dépôt partagé (dossier « ${valeurs.dossier} »).`, 'succes');
}

export async function quitterPartage(cible) {
  const e = etatDe(cible);
  const ok = await confirmer({
    titre: 'Ne plus utiliser le dépôt partagé',
    message: `« ${e?.nom} » ne sera plus envoyé dans le dépôt partagé. Son dossier y reste tel quel (rien n'est supprimé sur GitHub), et son historique sur ce PC est gardé.`,
    bouton: 'Ne plus l\'utiliser',
  });
  if (!ok) return;
  const resultat = await operation(cible, 'Modification…', async () => { await api.quitterPartage(cible); return true; }, 'L\'opération a échoué');
  if (resultat) notifier('Le projet n\'est plus relié au dépôt partagé.', 'succes');
}

export function ouvrirGithub(cible) {
  api.ouvrirGithub(cible).catch((erreur) => notifier(erreur.message, 'erreur'));
}

export function aideGithub() {
  informer({ titre: 'Connecter GitHub', message: AIDE_GITHUB });
}
