# La fiche projet : `projet.json`

Chaque dossier de `projets/` qui contient un fichier `projet.json` est un projet pour
Toolkit. Le nom du dossier sert d'**identifiant** (ex. `projets/compteur-de-mots/` →
identifiant `compteur-de-mots`) ; il est utilisé pour les liens `[[compteur-de-mots]]`
et le stockage des données des outils.

Tous les chemins de la fiche sont **relatifs au dossier du projet**, avec des `/`.
Seul `nom` est vraiment utile : tous les autres champs sont facultatifs. Un champ inconnu
est conservé tel quel par Toolkit (on peut donc y ranger ses propres notes).

## Exemple complet

```json
{
  "schema": 1,
  "nom": "Convertisseur d'images",
  "description": "Convertit des images PNG en JPG.",
  "type": "script",
  "categorie": "Images",
  "tags": ["conversion", "images"],
  "favori": false,
  "icone": "icone.png",
  "point_entree": "index.html",
  "ouvrir_avec": "vscode",
  "action_par_defaut": "action:Convertir",
  "actions": [
    {
      "nom": "Convertir",
      "description": "Convertit des images PNG en JPG.",
      "commande": "python convert.py {entree} {sortie}",
      "dossier": ".",
      "parametres": [
        { "id": "entree", "type": "fichiers", "libelle": "Fichiers à convertir", "extensions": ["png"] },
        { "id": "sortie", "type": "dossier", "libelle": "Dossier de sortie" }
      ],
      "ouvrir_dossier_apres": "{sortie}"
    }
  ],
  "outils_lies": [
    { "nom": "Aperçu", "point_entree": "outils/apercu/index.html" }
  ],
  "git": { "remote": "https://github.com/moi/convertisseur-images.git" }
}
```

## Champs

| Champ | Type | Défaut | Rôle |
|---|---|---|---|
| `schema` | nombre | `1` | Version du format de la fiche. |
| `nom` | texte | nom du dossier | Nom affiché. |
| `description` | texte | vide | Une ou deux phrases sur le projet. |
| `type` | `html`, `script`, `java`, `android`, `autre` | `autre` | Nature du projet (libellé, boutons automatiques). |
| `categorie` | texte | `Sans catégorie` | Catégorie dans la barre latérale ; décide aussi de la couleur de l'icône par défaut. |
| `tags` | liste de textes | `[]` | Mots-clés libres. |
| `favori` | `true` / `false` | `false` | Affiché dans « Favoris ». |
| `icone` | chemin | aucune | Image (png, jpg, svg, ico…). Sans icône : initiales sur fond coloré. Se change depuis Toolkit (clic sur l'icône du projet). |
| `point_entree` | chemin | aucun | Fichier principal : la page HTML d'un outil, le script principal, etc. |
| `ouvrir_avec` | `toolkit`, `vscode`, `android-studio`, `notepad++`, `explorateur` | aucun | Éditeur proposé par défaut pour « Ouvrir avec… » (`toolkit` = l'onglet « Code » intégré). |
| `action_par_defaut` | voir ci-dessous | automatique | Ce que font le double-clic sur le projet et le bouton principal. Se choisit dans le panneau du projet > « Action par défaut ». |
| `actions` | liste | `[]` | Boutons qui lancent une commande (voir ci-dessous). |
| `outils_lies` | liste | `[]` | Pages HTML situées dans ce projet, à ouvrir comme des outils (voir ci-dessous). |
| `liens` | liste | `[]` | Liens vers d'autres projets : `[{ "projet": "<dossier de l'autre projet>", "description": "en quoi ils sont liés" }]`. Un lien vaut dans les deux sens ; Toolkit en informe Claude (CLAUDE.md des projets concernés, liens indirects compris). Se gère dans le panneau du projet > « Projets liés ». |
| `permissions` | liste de textes | `[]` | Accès particuliers d'un outil HTML. `"claude"` : l'outil peut demander du texte à Claude avec le compte Claude Code du PC (voir « Claude dans un outil HTML » ci-dessous). |
| `git.remote` | URL | aucune | Adresse du repo GitHub du projet (indicatif). |
| `git.partage` | `{ remote, dossier }` | aucun | Projet envoyé dans un dépôt GitHub **partagé** (un dossier par projet) au lieu d'avoir son propre dépôt : `remote` = adresse du dépôt, `dossier` = nom de son dossier dedans. Se règle dans la section Git (menu ⋯ > « Envoyer dans un dépôt GitHub partagé… »). |

### `action_par_defaut`

| Valeur | Effet |
|---|---|
| absente | Automatique : ouvre l'outil si `point_entree` est une page HTML, sinon ouvre le projet dans son éditeur par défaut. |
| `outil` | Ouvre l'outil HTML (`point_entree` doit être une page HTML). |
| `editeur` | Ouvre le projet dans son éditeur par défaut (`ouvrir_avec`). |
| `code` | Ouvre l'onglet « Code » de Toolkit. |
| `claude` | « Modifier avec Claude ». |
| `action:<nom>` | Lance l'action de ce nom (voir `actions`). |
| `outil:<point_entree>` | Ouvre cet outil lié (voir `outils_lies`). |

Une valeur qui ne correspond à rien est signalée et remplacée par le choix automatique.
Renommer une action depuis Toolkit met cette valeur à jour ; la supprimer revient à l'automatique.

### `actions`

Chaque action devient un bouton dans le panneau de détails. Ainsi, on ajoute des fonctions
à un projet **sans toucher au code de Toolkit**. Depuis le panneau du projet : « Ajouter
une action », et le bouton `…` de chaque action (modifier, en faire l'action par défaut,
monter, descendre, supprimer). Le formulaire ne gère que `nom`, `commande`, `description`
et `dossier` ; les autres champs (`parametres`, `ouvrir_dossier_apres`) sont conservés et
s'écrivent dans projet.json.

Une action fait l'une de ces deux choses :
- **lancer une commande** (`commande`, voir ci-dessous) ;
- **ouvrir un fichier du projet** (`fichier`, sans `commande`) : `{ "nom": "Aide", "fichier": "pages/aide.html" }`.
  Champ facultatif `ouvrir_dans` : `toolkit` (page HTML = outil dans un onglet, avec ses
  données gardées comme un outil lié ; autre fichier = onglet « Code ») ou `windows` (le
  programme habituel de Windows pour ce type de fichier). Absent = automatique : HTML, texte,
  code et images dans Toolkit, le reste (PDF, Word…) avec Windows. Le fichier doit être dans
  le dossier du projet.

| Champ | Rôle |
|---|---|
| `nom` | Texte du bouton (obligatoire). |
| `description` | Aide affichée au survol. |
| `commande` | Commande à lancer (obligatoire, sauf pour une action `fichier`). `{id}` est remplacé par la valeur du paramètre `id`, automatiquement entre guillemets ; pour `fichiers`, chaque fichier devient un argument séparé. |
| `dossier` | Dossier où lancer la commande, relatif au projet. Défaut : `.` (le projet). |
| `parametres` | Champs du petit formulaire affiché avant de lancer l'action. |
| `ouvrir_dossier_apres` | Dossier à proposer d'ouvrir à la fin (peut contenir `{id}`). |

Types de paramètres :

| `type` | Champ affiché | Valeur |
|---|---|---|
| `fichier` | choix d'un fichier | un chemin |
| `fichiers` | choix de plusieurs fichiers | plusieurs chemins |
| `dossier` | choix d'un dossier | un chemin |
| `texte` | zone de texte | le texte saisi |
| `case` | case à cocher | `valeur_si_coche` / `valeur_si_decoche` si définis, sinon `true` / `false` |
| `choix` | liste déroulante (`options`) | l'option choisie |

Champs communs : `id` (obligatoire, sans espace), `libelle`, `defaut`, `obligatoire`
(`true` par défaut), `options` (pour `choix`), `extensions` (pour `fichier` et `fichiers`,
ex. `["jpg", "png"]`), `valeur_si_coche` et `valeur_si_decoche` (pour `case`, ex.
`"--verbeux"` et `""`).

Les dernières valeurs saisies pour une action sont proposées la fois suivante.

#### Comment la commande est construite

1. La commande est découpée en arguments aux espaces ; des guillemets `"…"` regroupent un
   argument contenant des espaces.
2. Un argument qui est **exactement** `{id}` est remplacé par la valeur, qui reste UN seul
   argument quels que soient ses espaces ou caractères spéciaux. Pour `fichiers`, chaque
   fichier devient un argument. Une valeur vide fait disparaître l'argument (pratique pour
   une case à cocher : `{verbeux}` avec `"valeur_si_coche": "--verbeux"`).
3. `{id}` à l'intérieur d'un argument (ex. `--mode={mode}`) est remplacé dans le texte.
4. Le premier mot est le programme : d'abord cherché dans le dossier de l'action (ex.
   `gradlew` → `gradlew.bat`), puis sur le PC (`python`, `node`…). S'il manque, Toolkit
   explique comment l'installer.

Aucun shell n'interprète la commande : `&`, `|`, `>` ne sont pas des opérateurs. Pour
enchaîner plusieurs commandes, écrire un petit script (`.py`, `.js`, `.bat`). Avec un
programme `.bat` ou `.cmd`, les valeurs ne peuvent pas contenir `"` ni `%`.

Exemple :

```json
{
  "nom": "Convertir",
  "commande": "python convertir.py --qualite={qualite} {detaille} --sortie {sortie} {images}",
  "parametres": [
    { "id": "images", "type": "fichiers", "libelle": "Images", "extensions": ["png", "jpg"] },
    { "id": "qualite", "type": "choix", "libelle": "Qualité", "options": ["haute", "moyenne"] },
    { "id": "detaille", "type": "case", "libelle": "Afficher le détail", "valeur_si_coche": "--verbeux" },
    { "id": "sortie", "type": "dossier", "libelle": "Dossier de sortie" }
  ],
  "ouvrir_dossier_apres": "{sortie}"
}
```

### `outils_lies`

Pages HTML situées **à l'intérieur** du projet, affichées comme des outils dans Toolkit
sans être copiées. Exemple : les outils HTML rangés dans `app/src/main/assets/` d'une
application Android.

| Champ | Rôle |
|---|---|
| `nom` | Nom affiché. |
| `point_entree` | Chemin de la page HTML, relatif au projet (obligatoire). |
| `description` | Texte d'aide facultatif. |

## Boutons de compilation automatiques

Pour un projet de type `java` (projet Java ou Kotlin compilé avec Gradle) ou `android` qui
contient `gradlew.bat`, Toolkit ajoute de lui-même l'action « Compiler » (`gradlew build`) ou « Compiler l'APK de
debug » (`gradlew assembleDebug`). Elle reste modifiable ; si tu la supprimes, elle n'est
pas rajoutée. Pour toute action qui lance `gradlew`, Toolkit choisit automatiquement le
Java adapté (version demandée par build.gradle) et le SDK Android.

## Données des outils HTML

Un outil HTML (point d'entrée `.html`, ou outil lié) garde ses données (localStorage,
IndexedDB) d'une ouverture à l'autre. Elles sont rattachées au **nom du dossier** du
projet (et, pour un outil lié, à son `point_entree`). Avant de renommer le dossier d'un
projet ou de déplacer un outil lié, utilise **Exporter les données**, puis **Importer
les données** une fois le changement fait.

## Claude dans un outil HTML

Avec `"permissions": ["claude"]`, une page HTML du projet peut interroger Claude avec le
compte Claude Code connecté sur le PC (aucune clé API). La première fois, Toolkit demande
l'accord de l'utilisateur (retenu dans `donnees/reglages.json > outilsClaude`). Claude n'a
aucun outil (ni fichiers, ni commandes) : il répond seulement du texte. Adresses relatives
à la page (même origine) :

| Adresse | Corps (JSON) | Réponse |
|---|---|---|
| `GET /__toolkit__/claude/etat` | — | `{ installe, connecte, email, abonnement, autorise, occupe }` |
| `POST /__toolkit__/claude/connexion` | — | ouvre l'onglet de connexion à Claude de Toolkit |
| `POST /__toolkit__/claude/generer` | `{ id, demande, modele? }` | `{ texte }` |
| `POST /__toolkit__/claude/annuler` | `{ id }` | arrête la génération `id` |

En cas d'erreur : statut HTTP ≥ 400 et `{ code, message }` (`non_autorise`, `refuse`,
`non_installe`, `non_connecte`, `occupe`, `annule`, `delai`, `echec`).

## En cas d'erreur

Si la fiche contient une erreur de syntaxe, le projet reste visible dans Toolkit avec un
avertissement qui indique la ligne et la colonne. Les valeurs inconnues (type, éditeur…)
sont signalées et remplacées par leur valeur par défaut, sans modifier le fichier.
