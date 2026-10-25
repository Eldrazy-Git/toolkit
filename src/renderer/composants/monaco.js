// Monaco, le moteur d'édition de VS Code, chargé à la première ouverture d'un onglet « Code ».
// Version « min » (AMD) du paquet monaco-editor : aucune étape de compilation. Les aides
// HTML / CSS / JSON / JavaScript / TypeScript tournent dans des workers fournis par Monaco.
import { el } from './dom.js';

const BASE = new URL('../../../node_modules/monaco-editor/min/vs', import.meta.url).href;
let chargement = null;

// Extensions que Monaco ne connaît pas, rattachées au langage le plus proche.
const LANGAGES_EN_PLUS = {
  '.gradle': 'java',
  '.kts': 'kotlin',
  '.properties': 'ini',
  '.toml': 'ini',
  '.cfg': 'ini',
  '.lang': 'ini',
  '.mcmeta': 'json',
  '.json5': 'json',
  '.jsonc': 'json',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.vbs': 'vb',
  '.pyw': 'python',
};
const NOMS_EN_PLUS = { gradlew: 'shell', '.gitignore': 'ini', '.gitattributes': 'ini', '.editorconfig': 'ini' };

function configurer(monaco) {
  // JavaScript : aide complète sans exiger TypeScript ; les fichiers du projet chargés en
  // modèles (voir code.js) permettent de suivre les « import » d'un fichier à l'autre.
  const optionsJs = {
    allowJs: true,
    allowNonTsExtensions: true,
    checkJs: false,
    target: monaco.typescript.ScriptTarget.ESNext,
    module: monaco.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
    lib: ['esnext', 'dom', 'dom.iterable'],
  };
  monaco.typescript.javascriptDefaults.setCompilerOptions(optionsJs);
  monaco.typescript.typescriptDefaults.setCompilerOptions({ ...optionsJs, strict: false });
  monaco.typescript.javascriptDefaults.setEagerModelSync(true);
  monaco.typescript.typescriptDefaults.setEagerModelSync(true);
}

export function chargerMonaco() {
  if (!chargement) {
    chargement = new Promise((resoudre, rejeter) => {
      const echec = () => rejeter(new Error('Impossible de charger l\'éditeur (monaco-editor). Dans PowerShell, va dans le dossier app de Toolkit et tape « npm install ».'));
      const script = (src, apres) => document.head.append(el('script', { src, onLoad: apres, onError: echec }));
      document.head.append(el('link', { rel: 'stylesheet', href: `${BASE}/editor/editor.main.css` }));
      // Textes en français (simple script qui remplit une variable globale), puis l'éditeur.
      script(`${BASE}/nls/lang/fr.js`, () => script(`${BASE}/loader.js`, () => {
        window.require.config({ paths: { vs: BASE } });
        window.require(['vs/editor/editor.main'], () => {
          try {
            configurer(window.monaco);
            resoudre(window.monaco);
          } catch (erreur) {
            rejeter(erreur);
          }
        }, rejeter);
      }));
    });
    chargement.catch(() => { chargement = null; });
  }
  return chargement;
}

// Langage Monaco d'un fichier d'après son nom.
export function langageDe(monaco, nom) {
  const bas = nom.toLowerCase();
  if (NOMS_EN_PLUS[bas]) return NOMS_EN_PLUS[bas];
  const point = bas.lastIndexOf('.');
  const extension = point >= 0 ? bas.slice(point) : '';
  if (LANGAGES_EN_PLUS[extension]) return LANGAGES_EN_PLUS[extension];
  for (const langage of monaco.languages.getLanguages()) {
    if (langage.filenames?.some((f) => f.toLowerCase() === bas)) return langage.id;
    if (extension && langage.extensions?.some((e) => e.toLowerCase() === extension)) return langage.id;
  }
  return 'plaintext';
}

export function nomLangage(monaco, id) {
  if (id === 'plaintext') return 'Texte';
  const langage = monaco.languages.getLanguages().find((l) => l.id === id);
  return langage?.aliases?.[0] || id;
}

// Options communes de l'éditeur (proches de VS Code).
export const OPTIONS_EDITEUR = {
  theme: 'vs-dark',
  automaticLayout: true,
  fontFamily: '\'Cascadia Code\', Consolas, monospace',
  fontSize: 14,
  minimap: { enabled: true },
  wordBasedSuggestions: 'allDocuments',
  bracketPairColorization: { enabled: true },
  guides: { bracketPairs: 'active' },
  renderWhitespace: 'selection',
  smoothScrolling: true,
  mouseWheelZoom: true,
  stickyScroll: { enabled: true },
  fixedOverflowWidgets: true,
};
