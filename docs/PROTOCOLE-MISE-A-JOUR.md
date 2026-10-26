# Protocole : publier une nouvelle version de Toolkit

Aide-mémoire pour faire évoluer Toolkit et publier une version que les autres Toolkit
installés détecteront (Réglages > Mises à jour) et installeront en gardant leurs réglages
et leurs propres modifications.

> **Raccourci** : tu peux demander à Claude (« Modifier Toolkit avec Claude ») :
> *« Suis docs/PROTOCOLE-MISE-A-JOUR.md pour préparer la version 1.16.0 »*. Il fera les
> étapes 2 à 4 et te laissera faire l'étape 5 (la publication) toi-même.

---

## Une seule fois, avant la toute première publication

- [ ] Rendre le dépôt **public** : github.com > dépôt `toolkit` > **Settings** > tout en bas
      **Change visibility** > **Make public**. (Sinon les autres Toolkit ne voient pas tes
      versions.)
- [ ] Vérifier que GitHub est connecté dans Toolkit : Réglages > **Comptes**.

---

## 1. Faire évoluer Toolkit

- Travaille toujours dans **ton** dossier `Desktop\Toolkit` (jamais dans une copie installée).
- « Modifier Toolkit avec Claude » (une sauvegarde est faite avant chaque fois).
- Redémarre Toolkit et **utilise-le quelques jours** : ne publie jamais quelque chose que tu
  n'as pas essayé.
- Si quelque chose casse : panneau Git > ligne Toolkit > ⋯ > **Historique des versions**
  pour revenir en arrière.

## 2. Choisir le numéro de la nouvelle version

Le numéro actuel est dans `app\package.json` (ligne `"version"`), ou en bas de Réglages >
Général > À propos. Il a la forme **A.B.C** :

| Ce que contient la nouvelle version | On augmente | Exemple (depuis 1.15.0) |
|---|---|---|
| Seulement des corrections | le 3ᵉ chiffre | **1.15.1** |
| Des nouveautés | le 2ᵉ chiffre (et le 3ᵉ revient à 0) | **1.16.0** |
| Un très gros changement (refonte…) | le 1ᵉʳ chiffre | **2.0.0** |

Un numéro déjà publié ne peut **jamais** être réutilisé.

## 3. Mettre à jour le numéro et écrire les nouveautés

- [ ] Dans `app\package.json`, remplace le numéro (ex. `"version": "1.16.0"`).
- [ ] Crée le fichier `app\docs\notes-de-version\1.16.0.md` (copie le précédent comme
      modèle). C'est ce que verront les utilisateurs avant d'installer :

  ```markdown
  ## Nouveautés
  - Ce qui est nouveau, en une phrase simple par point.

  ## Corrections
  - Ce qui a été réparé.
  ```

## 4. Faire un commit

Panneau **Git et GitHub** > ligne **Toolkit** > **Commit**, message par exemple
« Version 1.16.0 ». (Il ne doit plus rester de « modifications non enregistrées ».)

## 5. Publier

Dans le dossier `Desktop\Toolkit\app`, ouvre PowerShell (barre d'adresse de l'Explorateur :
tape `powershell`, Entrée), puis :

```
npm run publier
```

Le script vérifie tout, fabrique l'installateur, puis **te demande confirmation** :
tape `o` puis Entrée. Il envoie alors tes commits sur GitHub, crée l'étiquette `v1.16.0` et la
Release avec l'installateur joint. (Pour annuler : réponds autre chose que `o`, rien n'est
envoyé.)

## 6. Vérifier

- [ ] Sur github.com > dépôt `toolkit` > **Releases** : la version 1.16.0 apparaît, avec
      `Installer-Toolkit-1.16.0.exe` et les notes.
- [ ] *(Facultatif)* Sur une installation d'essai faite avec l'installateur d'une version
      précédente : Réglages > Mises à jour > Vérifier maintenant : la 1.16.0 est proposée et
      s'installe.

---

## Règles d'or

1. **Ne jamais supprimer une Release ou une étiquette publiée** : les Toolkit installés en ont
   besoin pour savoir ce que leur utilisateur a modifié.
2. **Ne jamais réutiliser un numéro de version.**
3. **Ne jamais publier une version non testée.**
4. Ne jamais installer l'installateur public **par-dessus** ton dossier `Desktop\Toolkit` (pour
   essayer : un autre dossier, puis désinstaller).
5. Rien de personnel dans le dépôt : tes projets (`projets\`) et tes réglages (`donnees\`)
   n'y vont jamais (c'est automatique) ; ne mets pas de mot de passe ni de clé dans le code.

## En cas de problème

| Message ou situation | Que faire |
|---|---|
| « Des modifications ne sont pas dans un commit » | Étape 4, puis relance `npm run publier`. |
| « La version … est déjà publiée » | Tu as oublié l'étape 3 : change le numéro, commit, relance. |
| « GitHub CLI n'est pas connecté » | Toolkit > Réglages > Comptes > Se connecter à GitHub. |
| Une erreur pendant l'envoi | Rien n'est cassé chez toi : copie le message à Claude et demande-lui de t'aider à terminer la publication. |
| Une version publiée a un défaut | Ne la supprime pas : corrige, puis publie une version suivante (ex. 1.16.1). |
