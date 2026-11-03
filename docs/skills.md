# Skills de l'utilisateur

Toolkit fournit seulement l'utilitaire : aucun skill n'est livré avec l'application. Ils appartiennent à
chaque utilisateur et vivent dans `Toolkit/skills/`, hors du dépôt de l'application.

Un skill (format standard de Claude Code) donne à Claude **une façon de faire** pour concevoir un projet :
des étapes, des règles, des pièges à éviter. Ce n'est **pas du code figé à recopier** : les bibliothèques et
les outils évoluent, un code recopié vieillit et reste à maintenir dans chaque projet. Pour une bibliothèque
ou un outil qui existe déjà, un skill renvoie vers sa documentation officielle au lieu d'en recopier le code.

## Règles pour Claude

1. **Sers-toi des skills quand ils conviennent** : Claude Code les charge tout seul (bibliothèque passée en
   `--add-dir`). Écris du code propre au projet, en suivant le skill.
2. **Pas de code figé** : appuie-toi sur les bibliothèques et la documentation officielles plutôt que sur du
   code recopié d'un autre projet.
3. **Ne modifie pas `skills/` depuis un projet**, sauf si l'utilisateur le demande. Claude a techniquement le
   droit d'y écrire (`--add-dir`) : cette règle est la seule barrière. Seule exception : déposer une
   proposition (voir ci-dessous). N'utilise jamais ce qui se trouve dans `skills/propositions/`.

## Proposer un skill

Quel que soit le type du projet, tu peux déposer dans `skills/propositions/<nom>/` un skill que tu viens de
découvrir.

**Seulement si** c'est réutilisable dans un autre projet, sans rien de propre à celui-ci : pas de nom de
projet, de chemin de ce PC, de réglage, de texte ou de donnée du projet, aucun secret. En cas de doute, ne
propose rien. Vérifie d'abord les skills existants (déjà couvert ?) et `skills/propositions/REFUS.md`
(déjà refusé ? ne le repropose pas).

Le dossier, à un seul niveau, porte le nom du skill (minuscules, chiffres, tirets) :

- `SKILL.md` directement dans le dossier, jamais de dossier `.claude` : Claude Code pourrait le charger avant
  qu'il soit accepté. D'autres fichiers peuvent l'accompagner (exemples courts, scripts de contrôle).
- `proposition.md`, deux ou trois lignes : le projet d'origine et pourquoi c'est réutilisable (ce fichier
  est le seul à pouvoir nommer le projet ; il est retiré à l'acceptation).

Vérifie avec `node ../../app/scripts/skills.js propositions` (depuis un projet), puis dis à l'utilisateur ce
que tu as déposé. Il décide dans l'onglet « Skills » (Accepter / Refuser).

**Une proposition n'est jamais utilisée avant d'être acceptée** : n'en dépends pas et ne la déplace pas
toi-même vers la bibliothèque. Elle n'est pas chargée par Claude Code ni envoyée sur GitHub (dossier ignoré
par Git). Accepter la fait entrer dans la bibliothèque et son historique ; refuser l'envoie à la Corbeille.

## Organisation de `Toolkit/skills/`

```
skills/
├── .git/                            dépôt Git local, séparé de celui de l'application
├── .gitignore                       propositions/ et CLAUDE.md sont ignorés
├── .claude/skills/<nom>/SKILL.md    les skills (format standard de Claude Code)
├── CLAUDE.md                        généré : consignes quand Claude travaille DANS la bibliothèque
└── propositions/                    attend la décision de l'utilisateur (jamais utilisé avant), REFUS.md
```

La bibliothèque est créée au premier lancement de Claude sur un projet, ou depuis l'onglet « Skills ».
Claude reçoit le dossier en `--add-dir` (chemin calculé au lancement) : Claude Code charge alors les skills
de `.claude/skills/`, mais pas le `CLAUDE.md` de `skills/` : les règles passent par la section « Skills de
l'utilisateur » de `projets/CLAUDE.md`, écrite par Toolkit.

## Dans Toolkit

- **Onglet « Skills »** : liste des skills, créer un skill, « Améliorer avec Claude » (sauvegarde Git de la
  bibliothèque avant), propositions de Claude avec Accepter / Refuser.
- **Onglet « Git et GitHub »** : la bibliothèque a sa ligne, comme un projet. Un seul dépôt GitHub PRIVÉ
  normal (`toolkit-skills`), créé seulement à la demande, et envoyé seulement par Push ou « Tout envoyer ».
- **Autre PC** : « Récupérer depuis GitHub » copie ce dépôt dans `Toolkit/skills/`. Une bibliothèque vide
  part à la Corbeille ; une bibliothèque qui contient quelque chose n'est jamais remplacée.
- **« Vérifier les projets »** (onglet « Skills ») : compare les projets choisis à ce que demandent les
  skills, sans Claude et sans rien modifier, puis liste les ajustements. Voir ci-dessous.

### Avant la version 1.18 : les kits

Toolkit copiait autrefois des « kits » (code réutilisable) dans les projets. Ce principe est abandonné :
le code copié vieillissait avec les bibliothèques qu'il reprenait et compliquait la maintenance.

- Au démarrage, `Toolkit/kits/` est renommé en `Toolkit/skills/` (contenu, historique Git et remote gardés).
  Si les deux dossiers existent, rien n'est fusionné : l'onglet le signale.
- Les dossiers d'anciens kits (un `kit.json`) restant dans la bibliothèque sont signalés dans l'onglet,
  avec « Transformer avec Claude » : Claude garde en skills ce qui est un vrai savoir-faire, puis retire le
  reste avec `git rm`, après accord.
- Un projet qui déclare encore des kits (champ `kits` de `projet.json`, sections `toolkit:kit=…=` du
  `CLAUDE.md`) est signalé par « Vérifier les projets » ; « Faire » demande à Claude de retirer ces
  déclarations, sans toucher au code.

## Vérifier les projets

Toolkit cherche, dans chaque projet choisi, ce que les skills demandent de vérifier avec leur fichier
`verification.json`, et les anciennes déclarations de kits (voir ci-dessus).

Pour chaque ajustement :

- **Faire** : sauvegarde Git, puis Claude s'ouvre dans le projet avec la demande. Il explique ce qu'il compte faire avant de modifier.
- **Ignorer** : retire la ligne du rapport. La prochaine vérification la retrouve.
- **Exception** : ne plus la détecter dans ce projet. Notée dans `projet.json` (champ `exceptions_verification`, lu par
  la vérification) et dans le `CLAUDE.md` du projet (section `toolkit:exceptions`, lue par Claude). Le rapport la liste, et elle se retire de là.

Rapport : `donnees/verification-projets.json` (jamais versionné), remplacé projet par projet.

### Mettre à jour les fiches

Ce bouton du rapport traite d'un coup les ajustements qui ne concernent que `CLAUDE.md`, `projet.json` ou le README à la racine d'un projet.
Une règle de `verification.json` est concernée si toutes ses conditions `si` visent uniquement ces fichiers ; pour le script d'un skill, si tous les
fichiers qu'il signale sont de ceux-là. Le choix des projets est demandé d'abord. Ensuite, pour chaque projet coché : sauvegarde Git, puis un onglet Claude
avec tous ses points, sans toucher au code, et un commit local sans push. Un projet où Claude travaille déjà est laissé de côté.

### Format de `verification.json`

À placer dans le dossier d'un skill (`.claude/skills/<nom>/`). Une erreur dans ce fichier est signalée dans le rapport
et n'empêche pas le reste. Une proposition n'est jamais lue tant qu'elle n'est pas acceptée.

```json
{
  "schema": 1,
  "regles": [
    {
      "id": "alarmes-sans-redemarrage",
      "titre": "Les alarmes ne sont pas reprogrammées après un redémarrage",
      "detail": "Android perd les alarmes quand le téléphone redémarre.",
      "gravite": "important",
      "types": ["android"],
      "si": [
        { "fichiers": "**/*.{kt,java}", "contient": "setExact" },
        { "fichiers": "**/AndroidManifest.xml", "ne_contient_pas": "BOOT_COMPLETED" }
      ],
      "demande": "Suis le skill `android-rappels-fiables` pour {{fichiers}}."
    }
  ],
  "script": {
    "chemin": "scripts/mon-controle.cjs",
    "arguments": ["--json"],
    "types": ["html"],
    "demande": "Point à traiter : {{titre}} ({{detail}})."
  }
}
```

- `id` (minuscules, chiffres, tirets) et `titre` sont obligatoires. `id` ne doit plus changer : les exceptions s'en servent.
- `gravite` : `important`, ou `conseil` par défaut. `types` : facultatif, les types de projets concernés.
- `si` : toutes les conditions doivent être vraies. `fichiers` est un motif (`*`, `**/`, `{a,b}`), avec au choix :
  `contient` et `ne_contient_pas` (expression régulière, multiligne), `existe` (`true` ou `false`), `taille_min_ko`.
  Les fichiers sensibles, binaires ou de plus de 2 Mo ne sont jamais lus.
- `demande` : ce que Claude reçoit avec « Faire ». Variables : `{{fichiers}}`, `{{titre}}`, `{{detail}}`. Sans `demande`, Toolkit en écrit une
  qui renvoie au skill. Toolkit ajoute toujours : expliquer d'abord, attendre l'accord, commit local sans push.
- `script` : facultatif, pour ce qu'une expression ne peut pas vérifier. Il est lancé avec le Node intégré à Toolkit, avec le dossier du
  projet en premier argument, et doit **ne rien modifier**. Il écrit sur sa sortie :
  `{ "ajustements": [{ "cle": "stable", "titre": "…", "detail": "…", "fichiers": ["…"], "gravite": "conseil" }] }`.
  Aucune valeur secrète ne doit apparaître, ni dans la sortie ni dans `cle`. Durée maximale : 3 minutes par projet.
  Seul ton dossier `skills/` contient ces scripts : n'accepte que des skills que tu as relus.
