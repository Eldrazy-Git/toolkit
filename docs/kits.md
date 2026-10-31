# Kits et skills réutilisables

Toolkit fournit seulement l'utilitaire : aucun kit ni skill n'est livré avec l'application. Ils
appartiennent à chaque utilisateur et vivent dans `Toolkit/kits/`, hors du dépôt de l'application.

## Règles pour Claude

1. **Consulte le catalogue avant de coder** : `kits/CATALOGUE.md`. Absent ou vide : aucun kit pour
   l'instant, continue normalement.
2. **Utilise les kits existants** quand ils conviennent, avec la commande ci-dessous. Ne copie pas
   leurs fichiers à la main : la commande vérifie, remplace les variables et note le kit dans
   `projet.json`.
3. **Ne recode jamais ce qu'un kit fournit.** S'il manque quelque chose, dis-le à l'utilisateur.
4. **Kit à adapter** : si la commande annonce une adaptation, termine le travail en suivant le guide
   du kit (`kits/<kit>/guide.md`).
5. **Ne modifie pas `kits/` depuis un projet**, sauf si l'utilisateur le demande. Claude a techniquement
   le droit d'y écrire (`--add-dir`) : cette règle est la seule barrière. N'utilise jamais ce qui se
   trouve dans `kits/propositions/`.
6. **Ne mets à jour aucun kit dans un projet sans demande** : aucune mise à jour n'est automatique.
   Quand c'est demandé : compare le projet avec `kits/<kit>/`, reporte les changements en gardant ce
   qui a été adapté au projet, puis mets à jour la version dans `projet.json` et la section
   `toolkit:kit=<kit>=` du `CLAUDE.md` du projet.

## Commande

Depuis un projet (`../../` = la racine de Toolkit) :

```
node ../../app/scripts/kit.js lister [--type <type>] [--langage <langage>] [--projet <dossier>]
node ../../app/scripts/kit.js ajouter <kit> [--projet <dossier>] [--var nom=valeur]... [--essai]
```

`--essai` montre ce qui serait fait sans rien écrire. La commande ne pose aucune question : une valeur
manquante est signalée avec le `--var` à ajouter.

`ajouter` vérifie **tout avant la première copie** : type et langage du projet, kits nécessaires,
destinations à l'intérieur du projet et non ignorées par Git, fichiers déjà présents (jamais écrasés).
Au moindre problème, rien n'est écrit. Sinon : copie, variables remplacées, kits nécessaires ajoutés,
section du kit dans le `CLAUDE.md` du projet, kit et version notés dans `projet.json` (champ `kits`, voir
`projet-json.md`).

## Organisation de `Toolkit/kits/`

```
kits/
├── .git/                    dépôt Git local, séparé de celui de l'application
├── .gitignore               propositions/, CATALOGUE.md et CLAUDE.md sont ignorés
├── .claude/skills/<nom>/SKILL.md   skills de l'utilisateur (format standard de Claude Code)
├── CATALOGUE.md             généré par Toolkit à partir des kit.json
├── CLAUDE.md                généré : consignes quand Claude travaille DANS la bibliothèque
├── propositions/            jamais utilisé
└── <kit>/                   le nom du dossier est l'identifiant (a-z, 0-9, tirets)
    ├── kit.json
    ├── guide.md             guide court
    ├── regles.md            règles propres au kit (facultatif)
    └── fichiers/            le code à copier (kit de code seulement)
```

La bibliothèque est créée au premier lancement de Claude sur un projet, ou depuis l'onglet « Kits et
skills ». Claude reçoit le dossier en `--add-dir` (chemin calculé au lancement) : Claude Code charge
alors les skills de `.claude/skills/`, mais pas le `CLAUDE.md` de `kits/` : les règles passent par la
section « Kits et skills réutilisables » de `projets/CLAUDE.md`, écrite par Toolkit.

## Dans Toolkit

- **Onglet « Kits et skills »** : liste avec filtre par type de projet, projets qui utilisent chaque
  kit, créer un kit ou un skill, créer un kit depuis un projet (fichiers choisis un par un ; le projet
  n'est pas modifié), « Améliorer avec Claude » (sauvegarde Git de la bibliothèque avant).
- **Détails d'un projet** : version de chaque kit et signal si la bibliothèque en a une plus récente.
  Rien n'est mis à jour tout seul : le bouton lance Claude sur le projet, à la demande.
- **Onglet « Git et GitHub »** : la bibliothèque a sa ligne, comme un projet. Un seul dépôt GitHub PRIVÉ
  normal (`toolkit-kits`), créé seulement à la demande, et envoyé seulement par Push ou « Tout envoyer ».
- **Autre PC** : « Récupérer depuis GitHub » copie ce dépôt dans `Toolkit/kits/`. Une bibliothèque vide
  part à la Corbeille ; une bibliothèque qui contient quelque chose n'est jamais remplacée.

## Format de `kit.json`

| Champ | Obligatoire | Rôle |
|---|---|---|
| `schema` | oui | Toujours `1`. |
| `nom`, `description` | oui | Nom affiché ; une ligne de description, reprise dans le catalogue. |
| `version` | oui | `X.Y.Z`. |
| `genre` | oui | `code` ou `regles` (aucun fichier copié). |
| `types` | oui | `"tous"` ou une liste parmi `html`, `script`, `java`, `android`, `autre`. |
| `langages` | non | Liste parmi `python`, `node`, `java`, `kotlin`. Absent = tous. Le projet doit contenir un fichier de ce langage. |
| `fichiers` | si `code` | `[{ "source": "<dossier du kit>", "vers": <destination> }]`. `vers` est un dossier du projet, ou un objet par type de projet, avec `"*"` pour les autres types. |
| `variables` | non | `[{ "id", "libelle", "genre": "texte" ou "package", "defaut", "types" }]`. `types` (facultatif) : seulement pour ces types de projets (ex. un package pour `java`). |
| `necessite` | non | `[{ "kit": "<id>", "version_min": "X.Y.Z" }]` : ajoutés en même temps s'ils manquent. |
| `adaptation` | non | `true` : la copie ne suffit pas, Claude termine en suivant le guide. |
| `guide` | oui | Chemin du guide dans le kit. |
| `regles` | si `regles` | Chemin des règles dans le kit. Copiées dans le `CLAUDE.md` du projet à l'ajout. |

### Variables

`{{id}}` est remplacé dans les noms de fichiers, les destinations, les règles et les fichiers texte en
UTF-8. Seules les variables déclarées sont remplacées : un autre `{{…}}` reste intact, et un fichier
binaire est copié tel quel.

- Toujours disponibles : `{{nom_projet}}` et `{{id_projet}}`.
- Une variable de genre `package` fournit aussi `{{<id>_chemin}}` (`fr/exemple/outil`). Sa valeur est
  détectée s'il n'y a pas de doute (`namespace` de Gradle, début commun à toutes les sources,
  `gradle.properties`) ; sinon `--var` est obligatoire.
- Ordre de priorité : `--var`, détection, `defaut`.

### Exemple

```json
{
  "schema": 1,
  "nom": "Configuration JSON",
  "description": "Charge et enregistre un fichier de configuration JSON.",
  "version": "1.0.0",
  "genre": "code",
  "types": ["java"],
  "langages": ["java"],
  "variables": [{ "id": "package", "libelle": "Package Java", "genre": "package" }],
  "fichiers": [
    { "source": "fichiers/java", "vers": "src/main/java/{{package_chemin}}/kit/config" },
    { "source": "fichiers/ressources", "vers": "src/main/resources/{{id_projet}}" }
  ],
  "adaptation": true,
  "guide": "guide.md"
}
```

Destinations différentes selon le type : `"vers": { "html": "kit/x", "android": "{{module}}/src/main/assets/kit/x" }`.

Un kit qui gère Python et Node à la fois n'existe pas : le code diffère, ce sont deux kits.
