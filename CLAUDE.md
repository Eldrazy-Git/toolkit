# Toolkit — contexte pour modifier l'application

Toolkit est une application de bureau Windows (Electron) qui centralise les projets de
l'utilisateur (outils HTML, scripts Python/Node, mods Minecraft, application Android) et
intègre Claude Code. Ce dossier `app/` contient **uniquement le code de l'application**.
Le cahier des charges complet est dans `../CAHIER_DES_CHARGES.md`.

## L'utilisateur

- Il ne sait pas coder. Parle-lui **en français**, simplement.
- Quand il doit agir lui-même, donne-lui les étapes exactes (commande à copier, où cliquer,
  ce qu'il doit voir).
- **Demande confirmation** avant toute action risquée : déplacement ou suppression de
  fichiers, push ou toute opération sur un repo distant, installation globale.
- Ne supprime jamais un projet ou un fichier de projet sans son accord explicite.
- Abonnement Claude Pro : **aucune clé API Anthropic**. Toute intégration Claude passe par
  la CLI `claude` lancée dans un terminal.

## Emplacement des dossiers

```
Toolkit/                  ← racine (déplaçable n'importe où)
├── app/                  ← CE dossier : code de l'appli, seul repo Git de l'appli
├── projets/              ← projets de l'utilisateur (un repo Git par projet, hors repo appli)
├── templates/            ← (facultatif) modèles personnels de l'utilisateur
├── donnees/              ← réglages + données des outils (jamais versionné)
└── Lancer Toolkit.vbs    ← généré automatiquement, lance l'appli sans console
```

## Règles absolues

1. **Aucun chemin absolu stocké** (réglages, projet.json, fichiers générés). Tout est
   relatif à la racine de Toolkit. Les chemins sont calculés au lancement par
   `src/main/chemins.js` : c'est le seul endroit qui sait où se trouve la racine.
   Exception : les chemins d'installation des éditeurs (VS Code…), qui sont hors de Toolkit.
2. **Sécurité Electron** : `contextIsolation: true`, `nodeIntegration: false`,
   `sandbox: true` pour les outils HTML. L'interface n'accède au système **que** via
   `src/preload/preload.js` et l'IPC.
3. **Légèreté** : pas de polling, pas de tâche de fond quand la fenêtre est fermée,
   surveillance de fichiers seulement quand la fenêtre est ouverte, indexation paresseuse.
4. **Robustesse** : un outil ou un script qui plante ne doit jamais faire planter Toolkit.
   Toute erreur montrée à l'utilisateur est en français compréhensible, sans trace technique
   (la trace va dans la console de développement).
5. **Pas de framework front ni d'étape de compilation** : HTML, CSS et JavaScript simples
   (modules ES dans l'interface, CommonJS dans le processus principal). Une modification
   est appliquée en redémarrant l'appli.
6. **Exécution de commandes** : jamais de concaténation de chaînes passée à un shell avec
   des valeurs fournies par l'utilisateur. Découper la commande en arguments et mettre les
   chemins entre guillemets correctement.
7. **Secrets** : Toolkit ne stocke jamais de mot de passe ni de token, et ne manipule jamais
   les keystores Android.

## Architecture

```
app/
├── package.json
├── scripts/                 scripts utilitaires (vérification des prérequis, installation)
├── templates/               modèles fournis pour « Nouvel outil »
└── src/
    ├── main/                processus principal (Node) : disque, processus, Git…
    │   ├── main.js          démarrage, fenêtre, zone de notification
    │   ├── chemins.js       tous les chemins, calculés depuis la racine
    │   ├── <domaine>.js     un module par domaine (projets, reglages, git…)
    │   └── ipc/<domaine>.js enregistre les canaux IPC d'un domaine
    ├── preload/preload.js   expose `window.toolkit.<domaine>.<fonction>()` à l'interface
    └── renderer/            interface
        ├── index.html
        ├── styles/          thème sombre via variables CSS (`--couleur-…`)
        └── composants/      un fichier par panneau
```

État d'avancement : voir la section « Phases » plus bas. Les modules apparaissent au fil
des phases.

### Bibliothèques

| Besoin | Bibliothèque |
|---|---|
| Application | electron |
| Terminal | @xterm/xterm + @xterm/addon-fit, @lydell/node-pty (binaires précompilés, pas besoin de Visual Studio Build Tools) |
| Recherche | minisearch |
| Markdown | markdown-it (+ petit plugin maison pour `[[liens]]`) |
| Git / GitHub | commandes `git` et `gh` du système (child_process) |

N'ajoute une dépendance que si elle est vraiment utile, et privilégie les bibliothèques
légères sans compilation native.

### Outils HTML

Servis par un protocole personnalisé `toolkit://<id-outil>/...` (adresse stable, donc
localStorage et IndexedDB conservés) dans une partition persistante dédiée par outil
(`persist:outil-<id>`). Les données d'Electron (`userData`) sont redirigées vers `donnees/`.

## Comment ajouter une fonctionnalité

Exemple : un bouton qui affiche le nombre de fichiers d'un projet.

1. **Logique** dans `src/main/<domaine>.js` : une fonction claire, qui lance une erreur
   avec un message en français en cas de problème.
2. **Canal IPC** dans `src/main/ipc/<domaine>.js` : `ipcMain.handle('<domaine>:<action>', …)`.
   Nommage : `domaine:action` en kebab-case, ex. `projets:compter-fichiers`.
3. **Pont** dans `src/preload/preload.js` : ajouter la fonction sous
   `window.toolkit.<domaine>`.
4. **Interface** dans `src/renderer/composants/<panneau>.js` : appeler
   `await window.toolkit.<domaine>.<fonction>()` et afficher le résultat ; attraper les
   erreurs et les montrer avec la fonction de notification commune.
5. Redémarrer Toolkit pour tester.

Pour ajouter un bouton à **un seul projet**, inutile de toucher au code : ajouter une
entrée dans `actions` de son `projet.json`.

## Conventions

- Noms de fichiers, fonctions, variables et commentaires **en français**, sans accents dans
  les identifiants (`chargerProjets`, `cheminRacine`). Texte de l'interface en français.
- Indentation 2 espaces, guillemets simples, point-virgule.
- Commentaires courts qui expliquent le *pourquoi*, en tête de chaque fichier une ligne
  qui décrit son rôle.
- Fonctions asynchrones (`async/await`, `fs/promises`) dans le processus principal pour ne
  jamais bloquer l'interface.

## Git

- Ce repo ne contient que `app/`. `projets/` et `donnees/` sont en dehors : un clone donne
  une application vierge de tout projet.
- Commits locaux réguliers avec des messages clairs en français. **Jamais de push sans
  l'accord de l'utilisateur.**

## Lancer et tester

```
npm install        (une seule fois, ou après ajout d'une dépendance)
npm start          lance Toolkit avec les sources
npm run verifier   vérifie les prérequis
```

## Phases

Construction par phases ; à la fin de chacune : commit, explication simple, liste de tests
pour l'utilisateur, attente de sa validation.

- [x] 0. Mise en place (structure, prérequis, documentation)
- [ ] 1. Coquille (fenêtre, thème, bibliothèque, détails, zone de notification)
- [ ] 2. Outils HTML (protocole, onglets, stockage persistant, export/import)
- [ ] 3. Ouvrir avec… et réglages des éditeurs
- [ ] 4. Terminal intégré et Claude Code
- [ ] 5. Actions et scripts
- [ ] 6. Assistant d'import
- [ ] 7. Git et GitHub
- [ ] 8. Recherche et Markdown
- [ ] 9. Compilation des mods et de l'APK
- [ ] 10. Finitions

### Décisions prises avec l'utilisateur

- Modèles fournis dans `app/templates/` (versionnés) ; `Toolkit/templates/` facultatif pour
  ses modèles personnels. `Lancer Toolkit.vbs` est généré automatiquement.
- Import : après copie vérifiée, l'original part **à la Corbeille** (pas de suppression
  définitive).
- Fermer la fenêtre détruit la fenêtre pour libérer la mémoire (seule l'icône de la zone de
  notification reste), **sauf** si un script ou un terminal tourne : la fenêtre est alors
  seulement cachée.
- Thème sombre uniquement.
- Repo GitHub de l'application : pas encore (prévu en phase 7, avec confirmation).
