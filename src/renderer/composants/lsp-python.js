// Aide au code Python dans l'éditeur : petit client du protocole LSP qui parle à Pyright
// (lancé par le processus principal, voir src/main/lsp-python.js) et branche ses réponses
// sur Monaco : complétion, survol, signatures, aller à la définition, références, plan du
// fichier et erreurs soulignées.
// Un client par onglet « Code » ; adresses des fichiers : « file:///<cle>/<chemin relatif> ».

const api = window.toolkit.lsp;
const clients = new Map(); // cle -> Client
let monacoCharge = null;
let ouvrirModele = null; // (uri) => Promise : crée le modèle d'un fichier du projet (définitions)

// --- Conversions LSP <-> Monaco ----------------------------------------------------------------

const versPosition = (p) => ({ line: p.lineNumber - 1, character: p.column - 1 });
const versRange = (r) => new monacoCharge.Range(r.start.line + 1, r.start.character + 1, r.end.line + 1, r.end.character + 1);

function versMarkdown(contenu) {
  if (!contenu) return [];
  if (typeof contenu === 'string') return [{ value: contenu }];
  if (Array.isArray(contenu)) return contenu.flatMap(versMarkdown);
  if (contenu.kind === 'plaintext') return [{ value: contenu.value.replace(/[\\`*_{}[\]()#+\-.!<>]/g, '\\$&') }];
  if (contenu.language) return [{ value: `\`\`\`${contenu.language}\n${contenu.value}\n\`\`\`` }];
  return [{ value: contenu.value || '' }];
}

function versDocumentation(doc) {
  if (!doc) return undefined;
  return typeof doc === 'string' ? doc : { value: doc.value };
}

// LSP CompletionItemKind (1 à 25) -> Monaco
function genreCompletion(genre) {
  const k = monacoCharge.languages.CompletionItemKind;
  return [null, k.Text, k.Method, k.Function, k.Constructor, k.Field, k.Variable, k.Class, k.Interface, k.Module,
    k.Property, k.Unit, k.Value, k.Enum, k.Keyword, k.Snippet, k.Color, k.File, k.Reference, k.Folder,
    k.EnumMember, k.Constant, k.Struct, k.Event, k.Operator, k.TypeParameter][genre] ?? k.Text;
}

const GRAVITES = { 1: 8, 2: 4, 3: 2, 4: 1 }; // Error, Warning, Info, Hint (MarkerSeverity)

// --- Client ----------------------------------------------------------------------------------

class Client {
  constructor(cle, cible, nom) {
    this.cle = cle;
    this.cible = cible;
    this.racine = `file:///${encodeURIComponent(cle)}`;
    this.prochainId = 1;
    this.attentes = new Map();
    this.ouverts = new Map(); // uri -> { version, abonnement }
    this.etat = 'demarrage'; // demarrage | pret | arrete
    this.surEtat = null;
    this.pret = this.initialiser(nom);
    this.pret.catch(() => this.changerEtat('arrete'));
  }

  changerEtat(etat) {
    this.etat = etat;
    this.surEtat?.(etat);
  }

  async initialiser(nom) {
    await api.demarrer(this.cle, this.cible);
    await this.requete('initialize', {
      processId: null,
      locale: 'fr',
      clientInfo: { name: 'Toolkit' },
      rootUri: this.racine,
      workspaceFolders: [{ uri: this.racine, name: nom }],
      capabilities: {
        workspace: { configuration: true, workspaceFolders: true },
        textDocument: {
          synchronization: { didSave: true, dynamicRegistration: false },
          completion: { completionItem: { snippetSupport: false, documentationFormat: ['markdown', 'plaintext'], resolveSupport: { properties: ['documentation', 'detail'] } } },
          hover: { contentFormat: ['markdown', 'plaintext'] },
          signatureHelp: { signatureInformation: { documentationFormat: ['markdown', 'plaintext'], parameterInformation: { labelOffsetSupport: true } } },
          definition: { linkSupport: false },
          references: {},
          documentSymbol: { hierarchicalDocumentSymbolSupport: true },
          publishDiagnostics: { relatedInformation: false },
        },
      },
    });
    this.notifier('initialized', {});
    this.changerEtat('pret');
  }

  envoyer(message) {
    api.envoyer(this.cle, { jsonrpc: '2.0', ...message });
  }

  requete(method, params) {
    const id = this.prochainId++;
    return new Promise((resoudre, rejeter) => {
      this.attentes.set(id, { resoudre, rejeter });
      this.envoyer({ id, method, params });
    });
  }

  notifier(method, params) {
    this.envoyer({ method, params });
  }

  recevoir(message) {
    if (message.id !== undefined && this.attentes.has(message.id)) {
      const attente = this.attentes.get(message.id);
      this.attentes.delete(message.id);
      if (message.error) attente.rejeter(new Error(message.error.message));
      else attente.resoudre(message.result);
      return;
    }
    if (message.method === 'textDocument/publishDiagnostics') {
      const modele = monacoCharge.editor.getModel(monacoCharge.Uri.parse(message.params.uri));
      if (!modele) return;
      monacoCharge.editor.setModelMarkers(modele, 'pyright', message.params.diagnostics.map((d) => ({
        severity: GRAVITES[d.severity] || 8,
        message: d.message,
        source: 'Pyright',
        code: typeof d.code === 'object' ? d.code?.value : d.code,
        tags: d.tags,
        ...(() => { const r = versRange(d.range); return { startLineNumber: r.startLineNumber, startColumn: r.startColumn, endLineNumber: r.endLineNumber, endColumn: r.endColumn }; })(),
      })));
    }
  }

  arrete() {
    this.changerEtat('arrete');
    for (const attente of this.attentes.values()) attente.rejeter(new Error('Pyright s\'est arrêté.'));
    this.attentes.clear();
  }

  // Synchronisation d'un fichier .py ouvert (changements envoyés au fur et à mesure).
  async ouvrir(modele) {
    const uri = modele.uri.toString();
    if (this.ouverts.has(uri)) return;
    const suivi = { version: 1, abonnement: null };
    this.ouverts.set(uri, suivi);
    await this.pret;
    if (!this.ouverts.has(uri)) return;
    this.notifier('textDocument/didOpen', { textDocument: { uri, languageId: 'python', version: 1, text: modele.getValue() } });
    suivi.abonnement = modele.onDidChangeContent((e) => {
      suivi.version += 1;
      this.notifier('textDocument/didChange', {
        textDocument: { uri, version: suivi.version },
        contentChanges: e.changes.map((c) => ({
          range: { start: { line: c.range.startLineNumber - 1, character: c.range.startColumn - 1 }, end: { line: c.range.endLineNumber - 1, character: c.range.endColumn - 1 } },
          text: c.text,
        })),
      });
    });
  }

  fermer(modele) {
    const uri = modele.uri.toString();
    const suivi = this.ouverts.get(uri);
    if (!suivi) return;
    this.ouverts.delete(uri);
    suivi.abonnement?.dispose();
    if (this.etat === 'pret') this.notifier('textDocument/didClose', { textDocument: { uri } });
  }

  enregistre(modele) {
    const uri = modele.uri.toString();
    if (this.ouverts.has(uri) && this.etat === 'pret') this.notifier('textDocument/didSave', { textDocument: { uri } });
  }

  async demander(modele, method, params) {
    await this.pret;
    if (!this.ouverts.has(modele.uri.toString())) return null;
    return this.requete(method, { textDocument: { uri: modele.uri.toString() }, ...params });
  }
}

function clientDuModele(modele) {
  if (modele.uri.scheme !== 'file') return null;
  const cle = decodeURIComponent(modele.uri.path.split('/')[1] || '');
  return clients.get(cle) || null;
}

// Emplacements LSP -> Monaco ; seuls ceux du projet sont gardés (et leur modèle créé).
async function versEmplacements(resultat) {
  const liste = (Array.isArray(resultat) ? resultat : resultat ? [resultat] : [])
    .map((l) => ({ uri: l.targetUri || l.uri, range: l.targetSelectionRange || l.range }))
    .filter((l) => l.uri?.startsWith('file:///') && clients.has(decodeURIComponent(l.uri.slice(8).split('/')[0])));
  const emplacements = [];
  for (const l of liste) {
    const uri = monacoCharge.Uri.parse(l.uri);
    if (!monacoCharge.editor.getModel(uri) && ouvrirModele) await ouvrirModele(uri).catch(() => null);
    if (monacoCharge.editor.getModel(uri)) emplacements.push({ uri, range: versRange(l.range) });
  }
  return emplacements;
}

function versSymboles(symboles) {
  return (symboles || []).map((s) => ({
    name: s.name,
    detail: s.detail || '',
    kind: Math.max(0, (s.kind || 13) - 1),
    tags: [],
    range: versRange(s.range || s.location.range),
    selectionRange: versRange(s.selectionRange || s.range || s.location.range),
    children: versSymboles(s.children),
  }));
}

function inscrireFournisseurs(monaco) {
  monaco.languages.registerCompletionItemProvider('python', {
    triggerCharacters: ['.', '[', '"', '\''],
    async provideCompletionItems(modele, position) {
      const client = clientDuModele(modele);
      if (!client) return { suggestions: [] };
      const resultat = await client.demander(modele, 'textDocument/completion', { position: versPosition(position) });
      const items = Array.isArray(resultat) ? resultat : resultat?.items || [];
      const mot = modele.getWordUntilPosition(position);
      const parDefaut = new monaco.Range(position.lineNumber, mot.startColumn, position.lineNumber, mot.endColumn);
      return {
        incomplete: Boolean(resultat?.isIncomplete),
        suggestions: items.map((item) => {
          const edition = item.textEdit;
          const zone = edition?.range || edition?.replace;
          return {
            label: item.label,
            kind: genreCompletion(item.kind),
            detail: item.detail,
            documentation: versDocumentation(item.documentation),
            insertText: edition?.newText ?? item.insertText ?? item.label,
            range: zone ? versRange(zone) : parDefaut,
            sortText: item.sortText,
            filterText: item.filterText,
            additionalTextEdits: item.additionalTextEdits?.map((e) => ({ range: versRange(e.range), text: e.newText })),
            lsp: item,
            client,
          };
        }),
      };
    },
    async resolveCompletionItem(suggestion) {
      if (!suggestion.lsp || suggestion.documentation) return suggestion;
      try {
        await suggestion.client.pret;
        const complet = await suggestion.client.requete('completionItem/resolve', suggestion.lsp);
        return { ...suggestion, detail: complet.detail || suggestion.detail, documentation: versDocumentation(complet.documentation) };
      } catch {
        return suggestion;
      }
    },
  });

  monaco.languages.registerHoverProvider('python', {
    async provideHover(modele, position) {
      const client = clientDuModele(modele);
      const resultat = client && await client.demander(modele, 'textDocument/hover', { position: versPosition(position) });
      if (!resultat) return null;
      return { contents: versMarkdown(resultat.contents), range: resultat.range ? versRange(resultat.range) : undefined };
    },
  });

  monaco.languages.registerSignatureHelpProvider('python', {
    signatureHelpTriggerCharacters: ['(', ','],
    signatureHelpRetriggerCharacters: [')'],
    async provideSignatureHelp(modele, position) {
      const client = clientDuModele(modele);
      const resultat = client && await client.demander(modele, 'textDocument/signatureHelp', { position: versPosition(position) });
      if (!resultat?.signatures?.length) return null;
      return {
        value: {
          signatures: resultat.signatures.map((s) => ({
            label: s.label,
            documentation: versDocumentation(s.documentation),
            parameters: (s.parameters || []).map((p) => ({ label: p.label, documentation: versDocumentation(p.documentation) })),
            activeParameter: s.activeParameter,
          })),
          activeSignature: resultat.activeSignature || 0,
          activeParameter: resultat.activeParameter || 0,
        },
        dispose() {},
      };
    },
  });

  monaco.languages.registerDefinitionProvider('python', {
    async provideDefinition(modele, position) {
      const client = clientDuModele(modele);
      return client ? versEmplacements(await client.demander(modele, 'textDocument/definition', { position: versPosition(position) })) : [];
    },
  });

  monaco.languages.registerReferenceProvider('python', {
    async provideReferences(modele, position, contexte) {
      const client = clientDuModele(modele);
      return client ? versEmplacements(await client.demander(modele, 'textDocument/references', {
        position: versPosition(position), context: { includeDeclaration: contexte.includeDeclaration },
      })) : [];
    },
  });

  monaco.languages.registerDocumentSymbolProvider('python', {
    async provideDocumentSymbols(modele) {
      const client = clientDuModele(modele);
      return client ? versSymboles(await client.demander(modele, 'textDocument/documentSymbol', {})) : [];
    },
  });
}

let ecoutes = false;
function ecouter() {
  if (ecoutes) return;
  ecoutes = true;
  api.surMessage((cle, message) => clients.get(cle)?.recevoir(message));
  api.surFin((cle) => clients.get(cle)?.arrete());
}

// --- API pour code.js ------------------------------------------------------------------------

// ouvreur(uri) : crée le modèle d'un fichier du projet (pour « aller à la définition »).
export function preparer(monaco, ouvreur) {
  if (monacoCharge) return;
  monacoCharge = monaco;
  ouvrirModele = ouvreur;
  inscrireFournisseurs(monaco);
  ecouter();
}

// Client de l'onglet (créé et démarré au premier fichier .py ouvert).
export function client(cle, cible, nom) {
  if (!clients.has(cle) || clients.get(cle).etat === 'arrete') clients.set(cle, new Client(cle, cible, nom));
  return clients.get(cle);
}

export function clientExistant(cle) {
  return clients.get(cle) || null;
}

export function arreter(cle) {
  if (!clients.has(cle)) return;
  clients.delete(cle);
  api.arreter(cle).catch(() => {});
}
