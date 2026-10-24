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
├── assets/                  icône de Toolkit (générée par scripts/generer-icones.js)
├── docs/projet-json.md      format complet de la fiche projet.json
├── scripts/                 vérification des prérequis, création du lanceur, icônes
├── templates/               modèles fournis pour « Nouvel outil »
└── src/
    ├── main/                processus principal (Node) : disque, processus, Git…
    │   ├── main.js              démarrage, fenêtre, fermeture vers la zone de notification
    │   ├── chemins.js           tous les chemins, calculés depuis la racine
    │   ├── fichiers.js          lecture/écriture JSON sûre (écriture atomique)
    │   ├── journal.js           erreurs techniques -> donnees/journal.log
    │   ├── reglages.js          donnees/reglages.json
    │   ├── projets.js           lecture, normalisation, modification, surveillance des fiches
    │   ├── activite.js          compteur de tâches en cours (fenêtre cachée au lieu de détruite)
    │   ├── lanceur.js           (re)crée « Lancer Toolkit.vbs »
    │   ├── outils-html.js       protocole toolkit-outil://, partitions, sécurité des <webview>
    │   ├── outils-donnees.js    export / import localStorage + IndexedDB en JSON
    │   ├── zone-notification.js icône près de l'horloge
    │   └── ipc/
    │       ├── gerer.js         enregistre un canal et renvoie les erreurs proprement
    │       └── <domaine>.js     canaux IPC d'un domaine
    ├── preload/preload.js   expose `window.toolkit.<domaine>.<fonction>()` à l'interface
    └── renderer/            interface (modules ES, sans compilation)
        ├── index.html, renderer.js (point d'entrée)
        ├── styles/          theme.css (couleurs) et app.css (mise en page)
        └── composants/
            ├── etat.js          état partagé + abonnements (tout changement redessine)
            ├── actions.js       actions de l'interface (appels à window.toolkit)
            ├── dom.js           el() pour construire le HTML sans innerHTML
            ├── icones.js        icônes SVG
            ├── dialogue.js      demanderTexte(), confirmer()
            ├── notifications.js notifier(message, type)
            ├── onglets.js       barre d'onglets + panneaux des outils (<webview>)
            └── barre-laterale.js, bibliotheque.js, details.js, icone-projet.js
```

Les fiches `projet.json` : format dans `docs/projet-json.md`. `projets.js` normalise une
fiche pour l'interface sans jamais la réécrire ; une modification ne touche que les champs
concernés et conserve les autres.

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

Voir `src/main/outils-html.js` (explications en tête du fichier) et
`src/main/outils-donnees.js` (export / import).

- Protocole `toolkit-outil://<hote>/...` : `<hote>` est stable (nom du dossier du projet +
  empreinte), donc localStorage et IndexedDB sont conservés. Racine servie = dossier du
  projet ; tout chemin qui en sort reçoit une erreur 403.
- Une partition persistante par outil (`persist:outil-<hote>`), stockée dans
  `donnees/electron/Partitions/`. Renommer le dossier d'un projet change l'hôte, donc le
  stockage : passer par Exporter / Importer.
- Affichage dans des `<webview>` (choisies plutôt que `WebContentsView` car ce sont des
  éléments du DOM : nos boîtes de dialogue et notifications passent par-dessus).
  Sécurité imposée dans `will-attach-webview` (pas de Node, pas de preload, sandbox).
- Les touches pressées dans un outil n'atteignent pas l'interface : les raccourcis (F12,
  F5, Ctrl+W) sont interceptés dans `before-input-event` du processus principal.
- Liens vers Internet : ouverts dans le navigateur par défaut.
- Import : l'outil est remplacé par une page vide de même origine (pour fermer ses bases
  IndexedDB), les données sont restaurées, puis l'outil est rechargé.

Les données d'Electron (`userData`) sont redirigées vers `donnees/electron/`.

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
npm run icones     régénère assets/icone.png et assets/icone.ico
```

## Pièges connus

- **Electron 44 ne télécharge plus son exécutable pendant `npm install`** (il le fait au
  premier `npm start`). Le `postinstall` de `package.json` lance donc
  `node_modules/electron/install.js` lui-même, car `Lancer Toolkit.vbs` appelle
  directement `electron.exe`.
- **`ELECTRON_RUN_AS_NODE`** : si cette variable est définie (c'est le cas dans les
  processus lancés par l'extension VS Code), `electron.exe` se comporte comme Node et
  `require('electron')` échoue. Pour tester depuis un tel environnement :
  `env -u ELECTRON_RUN_AS_NODE npm start`. Toolkit doit retirer cette variable de
  l'environnement des processus qu'il lance (terminaux, scripts).
- `prompt()`, `alert()` et `confirm()` n'existent pas dans Electron : utiliser
  `composants/dialogue.js`.
- La politique de sécurité (CSP) de `index.html` interdit les scripts en ligne. Les styles
  en ligne sont autorisés uniquement parce que `<webview>` en a besoin en interne : dans
  notre code, préférer les classes CSS ou `element.style.setProperty()`.
- `new URL('toolkit-outil://x/').origin` vaut `"null"` dans Node (protocole non standard
  pour Node) : reconstruire l'origine avec `${SCHEMA}://${url.host}`.
- `element.replaceChildren(...)` et `append(...)` ne déplient pas les tableaux : utiliser
  `...liste` (sinon on obtient « [object HTMLDivElement] »). `el()` les déplie, lui.

## Phases

Construction par phases ; à la fin de chacune : commit, explication simple, liste de tests
pour l'utilisateur, attente de sa validation.

- [x] 0. Mise en place (structure, prérequis, documentation)
- [x] 1. Coquille (fenêtre, thème, bibliothèque, détails, zone de notification)
- [x] 2. Outils HTML (protocole, onglets, stockage persistant, export/import)
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
- Electron 44 (et non 45, sorti trois jours avant le début du projet) : passage à une
  version plus récente prévu aux finitions.
