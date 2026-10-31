// Installateur graphique de Toolkit (Installer-Toolkit-<version>.exe), compilé par scripts/construire-installateur.js
// avec le compilateur C# fourni par Windows (.NET Framework 4, C# 5 : pas de $"…" ni de ?.).
//
// Étapes : bienvenue -> dossier et options -> logiciels nécessaires -> installation -> fin.
// - Les sources de Toolkit sont INCLUSES dans l'exe (ressource « app.zip ») : Toolkit est
//   installé sous forme de sources, donc toujours modifiable (avec Claude ou un éditeur).
// - Les logiciels manquants sont installés avec winget (Windows peut demander une
//   autorisation) ; Claude Code avec son installateur officiel. Rien sans l'accord de
//   l'utilisateur (cases à cocher).
// - Désinstallation (« Désinstaller Toolkit.exe », dans Applications installées) : retire
//   l'application et les raccourcis ; les projets et réglages sont GARDÉS sauf demande.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace InstallateurToolkit
{
    static class Programme
    {
        [DllImport("user32.dll")]
        static extern bool SetProcessDPIAware();

        [STAThread]
        static void Main(string[] args)
        {
            try { SetProcessDPIAware(); } catch { }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            bool desinstaller = args.Length > 0 && args[0].Equals("/desinstaller", StringComparison.OrdinalIgnoreCase);
            // « /auto <dossier> <journal> » : installation sans clic (tests, utilisateurs avancés) :
            // aucun logiciel installé, pas de raccourcis, pas de lancement ; le journal est écrit.
            if (args.Length >= 3 && args[0].Equals("/auto", StringComparison.OrdinalIgnoreCase))
            {
                var auto = new Assistant(args[1], args[2]);
                Application.Run(auto);
                Environment.Exit(auto.Reussie ? 0 : 1);
            }
            // Le même programme a trois rôles selon son nom de fichier : l'installateur
            // (Installer-Toolkit-x.exe), le lanceur (Toolkit.exe, à la racine du dossier) et le
            // désinstallateur (Désinstaller Toolkit.exe), même lancé d'un simple double-clic.
            string nom = Path.GetFileNameWithoutExtension(Application.ExecutablePath);
            if (nom.Equals("Toolkit", StringComparison.OrdinalIgnoreCase)) { Lanceur.Lancer(args); return; }
            if (nom.StartsWith("Désinstaller", StringComparison.OrdinalIgnoreCase) || nom.StartsWith("Desinstaller", StringComparison.OrdinalIgnoreCase)) desinstaller = true;
            Application.Run(desinstaller ? (Form)new Desinstallateur() : new Assistant(null, null));
        }
    }

    // --- Lanceur (Toolkit.exe) ----------------------------------------------------------------
    // Lance Electron sur le dossier app voisin, sans fenêtre de console (comme
    // « Lancer Toolkit.vbs »). Si Toolkit est déjà ouvert, Electron affiche sa fenêtre.
    static class Lanceur
    {
        public static void Lancer(string[] args)
        {
            string racine = Path.GetDirectoryName(Application.ExecutablePath);
            string app = Path.Combine(racine, "app");
            string electron = Path.Combine(app, "node_modules", "electron", "dist", "electron.exe");
            if (!File.Exists(electron))
            {
                MessageBox.Show("Toolkit n'est pas installé complètement (Electron est introuvable).\n\nRelance l'installateur de Toolkit, ou, dans PowerShell, dans le dossier « app », tape : npm install",
                    "Toolkit", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            var arguments = new StringBuilder("\"" + app + "\"");
            foreach (var a in args) arguments.Append(" \"").Append(a.Replace("\"", "")).Append('"');
            var info = new ProcessStartInfo(electron, arguments.ToString());
            info.UseShellExecute = false;
            info.WorkingDirectory = app;
            info.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
            Process.Start(info);
        }
    }

    // --- Outils communs ---------------------------------------------------------------------

    static class Outils
    {
        public const string CleDesinstallation = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\Toolkit";

        // PATH relu dans le registre : un logiciel juste installé y apparaît.
        public static string PathActuel()
        {
            string machine = Environment.GetEnvironmentVariable("Path", EnvironmentVariableTarget.Machine) ?? "";
            string utilisateur = Environment.GetEnvironmentVariable("Path", EnvironmentVariableTarget.User) ?? "";
            string local = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".local", "bin");
            return machine + ";" + utilisateur + ";" + local;
        }

        // Lance un programme et renvoie son code ; chaque ligne de sortie est passée à surLigne.
        public static int Executer(string programme, string arguments, string dossier, Action<string> surLigne, int delaiMs)
        {
            var info = new ProcessStartInfo(programme, arguments);
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            info.RedirectStandardOutput = true;
            info.RedirectStandardError = true;
            info.StandardOutputEncoding = Encoding.UTF8;
            info.StandardErrorEncoding = Encoding.UTF8;
            if (dossier != null) info.WorkingDirectory = dossier;
            info.EnvironmentVariables["Path"] = PathActuel();
            info.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
            using (var p = new Process())
            {
                p.StartInfo = info;
                DataReceivedEventHandler lire = (s, e) => { if (e.Data != null && surLigne != null) surLigne(e.Data); };
                p.OutputDataReceived += lire;
                p.ErrorDataReceived += lire;
                try { p.Start(); } catch { return -1; }
                p.BeginOutputReadLine();
                p.BeginErrorReadLine();
                if (!p.WaitForExit(delaiMs)) { try { p.Kill(); } catch { } return -2; }
                p.WaitForExit();
                return p.ExitCode;
            }
        }

        // Première ligne de « programme --version » (null si absent).
        public static string Version(string commande)
        {
            var sortie = new StringBuilder();
            int code = Executer("cmd.exe", "/d /c " + commande + " --version", null, l => { lock (sortie) sortie.AppendLine(l); }, 20000);
            string texte = sortie.ToString().Trim();
            if (code != 0 || texte.Length == 0) return null;
            return texte.Split('\n')[0].Trim();
        }

        public static void Raccourci(string fichier, string cible, string arguments, string dossier, string icone)
        {
            Type type = Type.GetTypeFromProgID("WScript.Shell");
            dynamic shell = Activator.CreateInstance(type);
            dynamic r = shell.CreateShortcut(fichier);
            r.TargetPath = cible;
            r.Arguments = arguments;
            r.WorkingDirectory = dossier;
            r.IconLocation = icone;
            r.Description = "Toolkit";
            r.Save();
        }

        public static string Bureau() { return Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory); }
        public static string MenuDemarrer() { return Environment.GetFolderPath(Environment.SpecialFolder.Programs); }
    }

    // --- Logiciels nécessaires ----------------------------------------------------------------

    class Logiciel
    {
        public string Nom, Role, Commande, IdWinget;
        public bool Obligatoire;
        public string Version; // null = absent
        public CheckBox Case;
        public Label Etat;

        public bool Present
        {
            get
            {
                if (Version == null) return false;
                if (Commande == "node")
                {
                    int majeure;
                    string v = Version.TrimStart('v');
                    int point = v.IndexOf('.');
                    if (point > 0 && int.TryParse(v.Substring(0, point), out majeure)) return majeure >= 20;
                }
                if (Commande == "python") return Version.StartsWith("Python 3");
                return true;
            }
        }
    }

    // --- Assistant d'installation --------------------------------------------------------------

    class Assistant : Form
    {
        readonly Label titre = new Label();
        readonly Label sousTitre = new Label();
        readonly Panel contenu = new Panel();
        readonly Button precedent = new Button();
        readonly Button suivant = new Button();
        readonly Button annuler = new Button();
        int etape;
        bool installationEnCours, installationReussie;

        // Choix de l'utilisateur
        readonly TextBox champDossier = new TextBox();
        readonly CheckBox caseBureau = new CheckBox();
        readonly CheckBox caseMenu = new CheckBox();
        readonly TextBox champNom = new TextBox();
        readonly CheckBox caseLancer = new CheckBox();
        readonly List<Logiciel> logiciels = new List<Logiciel>();
        bool wingetPresent;
        bool identiteGitPresente;

        // Installation
        readonly TextBox journal = new TextBox();
        readonly ProgressBar barre = new ProgressBar();
        readonly Label etapeEnCours = new Label();

        readonly string journalAuto; // mode automatique : fichier où écrire le journal
        public bool Reussie { get { return installationReussie; } }

        public Assistant(string dossierAuto, string journalAuto)
        {
            this.journalAuto = journalAuto;
            Text = "Installation de Toolkit " + Infos.Version;
            Font = new Font("Segoe UI", 9.75f);
            AutoScaleMode = AutoScaleMode.Dpi;
            ClientSize = new Size(720, 500);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }

            var entete = new Panel { Dock = DockStyle.Top, Height = 78, BackColor = Color.FromArgb(0, 120, 212) };
            titre.SetBounds(24, 14, 660, 30);
            titre.Font = new Font("Segoe UI Semibold", 15f);
            titre.ForeColor = Color.White;
            sousTitre.SetBounds(25, 46, 660, 22);
            sousTitre.ForeColor = Color.FromArgb(220, 235, 250);
            entete.Controls.Add(titre);
            entete.Controls.Add(sousTitre);

            var bas = new Panel { Dock = DockStyle.Bottom, Height = 56 };
            var trait = new Label { Dock = DockStyle.Top, Height = 1, BackColor = Color.FromArgb(220, 220, 220) };
            bas.Controls.Add(trait);
            precedent.Text = "< Précédent";
            suivant.Text = "Suivant >";
            annuler.Text = "Annuler";
            foreach (var b in new[] { precedent, suivant, annuler }) { b.Size = new Size(110, 30); bas.Controls.Add(b); }
            precedent.Location = new Point(360, 14);
            suivant.Location = new Point(476, 14);
            annuler.Location = new Point(596, 14);
            precedent.Click += (s, e) => Aller(etape - 1);
            suivant.Click += (s, e) => Suivant();
            annuler.Click += (s, e) => Close();
            AcceptButton = suivant;

            contenu.Dock = DockStyle.Fill;
            contenu.Padding = new Padding(28, 18, 28, 8);
            Controls.Add(contenu);
            Controls.Add(bas);
            Controls.Add(entete);

            champDossier.Text = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Toolkit");
            caseBureau.Checked = true;
            caseMenu.Checked = true;
            caseLancer.Checked = true;
            champNom.Text = Environment.UserName;
            FormClosing += (s, e) =>
            {
                if (installationEnCours)
                {
                    MessageBox.Show(this, "L'installation est en cours : attends qu'elle se termine.", "Toolkit", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    e.Cancel = true;
                }
            };
            if (dossierAuto != null)
            {
                champDossier.Text = dossierAuto;
                caseBureau.Checked = caseMenu.Checked = caseLancer.Checked = false;
                identiteGitPresente = true;
                Shown += (s, e) => Aller(2);
            }
            else Aller(0);
        }

        Label Texte(string texte, int y, int hauteur)
        {
            var l = new Label { Text = texte, AutoSize = false };
            l.SetBounds(28, y, 660, hauteur);
            contenu.Controls.Add(l);
            return l;
        }

        void Aller(int n)
        {
            etape = n;
            contenu.Controls.Clear();
            precedent.Visible = n > 0 && n < 3;
            suivant.Enabled = true;
            annuler.Enabled = true;
            suivant.Text = "Suivant >";
            switch (n)
            {
                case 0: PageBienvenue(); break;
                case 1: PageDossier(); break;
                case 2: PageLogiciels(); break;
                case 3: PageInstallation(); break;
                case 4: PageFin(); break;
            }
        }

        void Suivant()
        {
            if (etape == 1 && !VerifierDossier()) return;
            if (etape == 2 && !VerifierLogiciels()) return;
            if (etape == 4) { Terminer(); return; }
            Aller(etape + 1);
        }

        // 1. Bienvenue
        void PageBienvenue()
        {
            titre.Text = "Bienvenue";
            sousTitre.Text = "Cet assistant installe Toolkit " + Infos.Version + " sur ton PC.";
            Texte("Toolkit rassemble tous tes projets au même endroit et te permet de les créer et de les modifier avec Claude.", 0, 48);
            Texte("L'installation :\n  • vérifie les logiciels nécessaires et propose d'installer ceux qui manquent ;\n  • copie Toolkit dans le dossier de ton choix ;\n  • crée les raccourcis.\n\nToolkit reste modifiable après l'installation (il est installé avec son code), sans rien réinstaller.", 56, 140);
            Texte("Toolkit est un logiciel libre, sous licence GNU GPL version 3. Il n'est pas édité par Anthropic : pour utiliser Claude, il faut un compte Claude (abonnement Pro ou Max).", 210, 60);
            Texte("Une connexion Internet est nécessaire (environ 200 Mo à télécharger).", 280, 24).ForeColor = Color.DimGray;
        }

        // 2. Dossier et options
        void PageDossier()
        {
            titre.Text = "Où installer Toolkit ?";
            sousTitre.Text = "Tes projets et tes réglages seront rangés dans ce dossier.";
            Texte("Dossier d'installation :", 0, 22);
            champDossier.SetBounds(28, 24, 540, 26);
            contenu.Controls.Add(champDossier);
            var parcourir = new Button { Text = "Parcourir…" };
            parcourir.SetBounds(576, 22, 110, 30);
            parcourir.Click += (s, e) =>
            {
                using (var d = new FolderBrowserDialog { Description = "Dossier où installer Toolkit (un sous-dossier « Toolkit » est conseillé)" })
                {
                    if (d.ShowDialog(this) == DialogResult.OK) champDossier.Text = Path.Combine(d.SelectedPath, "Toolkit");
                }
            };
            contenu.Controls.Add(parcourir);
            Texte("Il contiendra : app (le programme), projets (tes projets), donnees (tes réglages). Tu pourras le déplacer plus tard.", 56, 40).ForeColor = Color.DimGray;

            caseBureau.Text = "Créer un raccourci sur le Bureau";
            caseBureau.SetBounds(28, 104, 600, 24);
            caseMenu.Text = "Créer un raccourci dans le menu Démarrer";
            caseMenu.SetBounds(28, 130, 600, 24);
            contenu.Controls.Add(caseBureau);
            contenu.Controls.Add(caseMenu);

            identiteGitPresente = !string.IsNullOrEmpty(GitConfig("user.name"));
            if (!identiteGitPresente)
            {
                Texte("Ton nom (il signe l'historique des versions de tes projets ; reste sur ton PC) :", 172, 22);
                champNom.SetBounds(28, 196, 300, 26);
                contenu.Controls.Add(champNom);
            }
        }

        static string GitConfig(string cle)
        {
            var sortie = new StringBuilder();
            Outils.Executer("cmd.exe", "/d /c git config --global " + cle, null, l => sortie.AppendLine(l), 10000);
            return sortie.ToString().Trim();
        }

        bool VerifierDossier()
        {
            string dossier = champDossier.Text.Trim();
            if (dossier.Length < 4 || !Path.IsPathRooted(dossier))
            {
                MessageBox.Show(this, "Choisis un dossier complet, par exemple C:\\Users\\toi\\Toolkit.", "Toolkit", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return false;
            }
            if (File.Exists(Path.Combine(dossier, "app", "package.json")))
            {
                MessageBox.Show(this, "Toolkit est déjà installé dans ce dossier.\n\nPour le réinstaller, désinstalle-le d'abord (Paramètres Windows > Applications), ou choisis un autre dossier.", "Toolkit", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return false;
            }
            return true;
        }

        // 3. Logiciels
        void PageLogiciels()
        {
            titre.Text = "Logiciels nécessaires";
            sousTitre.Text = "Vérification de ce qui est déjà installé sur ce PC…";
            suivant.Enabled = false;
            logiciels.Clear();
            logiciels.Add(new Logiciel { Nom = "Node.js (20 ou plus)", Role = "fait tourner Toolkit", Commande = "node", IdWinget = "OpenJS.NodeJS.LTS", Obligatoire = true });
            logiciels.Add(new Logiciel { Nom = "Git", Role = "historique et sauvegardes des projets", Commande = "git", IdWinget = "Git.Git", Obligatoire = true });
            logiciels.Add(new Logiciel { Nom = "Claude Code", Role = "créer et modifier tes projets avec Claude (facultatif)", Commande = "claude" });
            logiciels.Add(new Logiciel { Nom = "GitHub CLI", Role = "sauvegarder tes projets en ligne (facultatif)", Commande = "gh", IdWinget = "GitHub.cli" });
            logiciels.Add(new Logiciel { Nom = "Python", Role = "lancer des scripts Python (facultatif)", Commande = "python", IdWinget = "Python.Python.3.13" });
            int y = 0;
            foreach (var l in logiciels)
            {
                l.Case = new CheckBox { Text = l.Nom, Enabled = false };
                l.Case.SetBounds(28, y, 230, 24);
                l.Etat = new Label { Text = "vérification…", ForeColor = Color.DimGray };
                l.Etat.SetBounds(262, y + 3, 420, 22);
                var role = new Label { Text = l.Role, ForeColor = Color.DimGray, Font = new Font("Segoe UI", 8.5f) };
                role.SetBounds(46, y + 24, 600, 18);
                contenu.Controls.Add(l.Case);
                contenu.Controls.Add(l.Etat);
                contenu.Controls.Add(role);
                y += 50;
            }
            var aide = Texte("", y + 4, 60);
            aide.ForeColor = Color.DimGray;
            new Thread(() =>
            {
                wingetPresent = Outils.Version("winget") != null;
                foreach (var l in logiciels) l.Version = Outils.Version(l.Commande);
                if (!logiciels[4].Present) { var py = Outils.Version("py"); if (py != null && py.StartsWith("Python 3")) logiciels[4].Version = py; }
                BeginInvoke(new Action(() =>
                {
                    foreach (var l in logiciels)
                    {
                        bool installable = l.Commande == "claude" || wingetPresent;
                        if (l.Present)
                        {
                            l.Etat.Text = "✓ déjà installé (" + l.Version + ")";
                            l.Etat.ForeColor = Color.SeaGreen;
                            l.Case.Checked = false;
                        }
                        else
                        {
                            l.Etat.Text = installable ? (l.Obligatoire ? "manquant — sera installé" : "absent — coche pour l'installer") : "manquant — winget indisponible";
                            l.Etat.ForeColor = l.Obligatoire ? Color.DarkOrange : Color.DimGray;
                            l.Case.Enabled = installable;
                            l.Case.Checked = installable && l.Obligatoire;
                        }
                    }
                    sousTitre.Text = "Coche ce que l'installateur doit installer pour toi.";
                    aide.Text = wingetPresent
                        ? "Les installations se font avec winget, l'installateur de Windows : Windows peut te demander une autorisation pour certaines."
                        : "winget (l'installateur de Windows) est absent : installe « App Installer » depuis le Microsoft Store, ou installe toi-même les logiciels manquants, puis relance cet installateur.";
                    suivant.Text = "Installer";
                    suivant.Enabled = true;
                    if (journalAuto != null)
                    {
                        foreach (var l in logiciels) l.Case.Checked = false;
                        Aller(3);
                    }
                }));
            }) { IsBackground = true }.Start();
        }

        bool VerifierLogiciels()
        {
            foreach (var l in logiciels)
            {
                if (l.Obligatoire && !l.Present && !l.Case.Checked)
                {
                    MessageBox.Show(this, l.Nom + " est nécessaire pour faire tourner Toolkit : coche-le, ou installe-le toi-même puis relance l'installateur.", "Toolkit", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return false;
                }
            }
            return true;
        }

        // 4. Installation
        void PageInstallation()
        {
            titre.Text = "Installation";
            sousTitre.Text = "Cela peut prendre quelques minutes. Ne ferme pas cette fenêtre.";
            precedent.Visible = false;
            suivant.Enabled = false;
            annuler.Enabled = false;
            etapeEnCours.SetBounds(28, 0, 660, 22);
            barre.SetBounds(28, 26, 660, 18);
            barre.Style = ProgressBarStyle.Marquee;
            journal.SetBounds(28, 54, 660, 300);
            journal.Multiline = true;
            journal.ReadOnly = true;
            journal.ScrollBars = ScrollBars.Vertical;
            journal.Font = new Font("Consolas", 8.5f);
            journal.BackColor = Color.White;
            contenu.Controls.Add(etapeEnCours);
            contenu.Controls.Add(barre);
            contenu.Controls.Add(journal);
            installationEnCours = true;
            string dossier = champDossier.Text.Trim();
            bool bureau = caseBureau.Checked, menu = caseMenu.Checked;
            string nom = champNom.Text.Trim();
            var aInstaller = logiciels.FindAll(l => !l.Present && l.Case.Checked);
            new Thread(() => Installer(dossier, bureau, menu, nom, aInstaller)) { IsBackground = true }.Start();
        }

        void Etape(string texte)
        {
            BeginInvoke(new Action(() => { etapeEnCours.Text = texte; Ecrire("== " + texte + " =="); }));
        }

        void Ecrire(string ligne)
        {
            if (InvokeRequired) { BeginInvoke(new Action<string>(Ecrire), ligne); return; }
            journal.AppendText(ligne + Environment.NewLine);
        }

        void Installer(string dossier, bool bureau, bool menu, string nom, List<Logiciel> aInstaller)
        {
            string erreur = null;
            try
            {
                foreach (var l in aInstaller)
                {
                    Etape("Installation de " + l.Nom);
                    int code;
                    if (l.Commande == "claude")
                        code = Outils.Executer("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -Command \"irm https://claude.ai/install.ps1 | iex\"", null, Ecrire, 900000);
                    else
                        code = Outils.Executer("winget", "install --id " + l.IdWinget + " --exact --accept-source-agreements --accept-package-agreements", null, Ecrire, 1800000);
                    l.Version = Outils.Version(l.Commande);
                    if (!l.Present)
                    {
                        if (l.Obligatoire) throw new Exception(l.Nom + " n'a pas pu être installé (code " + code + "). Installe-le toi-même, puis relance l'installateur.");
                        Ecrire("(" + l.Nom + " n'a pas pu être installé : tu pourras le faire plus tard.)");
                    }
                }

                if (!identiteGitPresente && nom.Length > 0)
                {
                    Etape("Nom pour l'historique des versions");
                    Outils.Executer("git", "config --global user.name \"" + nom.Replace("\"", "") + "\"", null, Ecrire, 20000);
                    if (string.IsNullOrEmpty(GitConfig("user.email")))
                        Outils.Executer("git", "config --global user.email \"" + Environment.UserName.Replace("\"", "").Replace(" ", ".") + "@toolkit.local\"", null, Ecrire, 20000);
                }

                Etape("Copie de Toolkit");
                string app = Path.Combine(dossier, "app");
                Directory.CreateDirectory(app);
                Directory.CreateDirectory(Path.Combine(dossier, "projets"));
                Directory.CreateDirectory(Path.Combine(dossier, "donnees"));
                using (Stream zip = Assembly.GetExecutingAssembly().GetManifestResourceStream("app.zip"))
                using (var archive = new ZipArchive(zip, ZipArchiveMode.Read))
                {
                    foreach (var entree in archive.Entries)
                    {
                        string cible = Path.GetFullPath(Path.Combine(app, entree.FullName));
                        if (!cible.StartsWith(Path.GetFullPath(app), StringComparison.OrdinalIgnoreCase)) continue;
                        if (entree.FullName.EndsWith("/")) { Directory.CreateDirectory(cible); continue; }
                        Directory.CreateDirectory(Path.GetDirectoryName(cible));
                        entree.ExtractToFile(cible, true);
                    }
                }
                Ecrire("Fichiers copiés dans " + app);
                // L'installateur lui-même, pour la désinstallation.
                string desinstallateur = Path.Combine(dossier, "Désinstaller Toolkit.exe");
                File.Copy(Application.ExecutablePath, desinstallateur, true);
                // Et comme lanceur (Toolkit.exe, avec l'icône de Toolkit) : les raccourcis pointent dessus.
                string lanceurExe = Path.Combine(dossier, "Toolkit.exe");
                File.Copy(Application.ExecutablePath, lanceurExe, true);

                Etape("Téléchargement des bibliothèques (npm install)");
                int codeNpm = Outils.Executer("cmd.exe", "/d /c npm install --no-fund --no-audit", app, Ecrire, 1800000);
                if (codeNpm != 0) throw new Exception("npm install a échoué (code " + codeNpm + ") : vérifie ta connexion Internet, puis relance l'installateur.");
                string lanceur = Path.Combine(dossier, "Lancer Toolkit.vbs");
                if (!File.Exists(lanceur)) throw new Exception("Le lanceur « Lancer Toolkit.vbs » n'a pas été créé.");

                Etape("Raccourcis");
                string icone = Path.Combine(app, "assets", "icone.ico");
                if (bureau) Outils.Raccourci(Path.Combine(Outils.Bureau(), "Toolkit.lnk"), lanceurExe, "", dossier, icone);
                if (menu) Outils.Raccourci(Path.Combine(Outils.MenuDemarrer(), "Toolkit.lnk"), lanceurExe, "", dossier, icone);

                // « Applications installées » de Windows (désinstallation).
                using (var cle = Registry.CurrentUser.CreateSubKey(Outils.CleDesinstallation))
                {
                    cle.SetValue("DisplayName", "Toolkit");
                    cle.SetValue("DisplayVersion", Infos.Version);
                    cle.SetValue("Publisher", "Toolkit (logiciel libre, GPL v3)");
                    cle.SetValue("DisplayIcon", icone);
                    cle.SetValue("InstallLocation", dossier);
                    cle.SetValue("UninstallString", "\"" + desinstallateur + "\" /desinstaller");
                    cle.SetValue("NoModify", 1, RegistryValueKind.DWord);
                    cle.SetValue("NoRepair", 1, RegistryValueKind.DWord);
                }
                Ecrire("Terminé.");
            }
            catch (Exception e)
            {
                erreur = e.Message;
                Ecrire("ERREUR : " + e.Message);
            }
            BeginInvoke(new Action(() =>
            {
                installationEnCours = false;
                installationReussie = erreur == null;
                barre.Style = ProgressBarStyle.Continuous;
                barre.Value = erreur == null ? 100 : 0;
                if (journalAuto != null)
                {
                    var etats = new StringBuilder();
                    foreach (var l in logiciels) etats.AppendLine("LOGICIEL " + l.Nom + " : " + (l.Present ? l.Version : "absent"));
                    File.WriteAllText(journalAuto, etats + journal.Text + (erreur == null ? "RESULTAT OK" : "RESULTAT ERREUR " + erreur), Encoding.UTF8);
                    Close();
                    return;
                }
                if (erreur != null)
                {
                    etapeEnCours.Text = "L'installation n'a pas abouti : " + erreur;
                    etapeEnCours.ForeColor = Color.Firebrick;
                    annuler.Text = "Fermer";
                    annuler.Enabled = true;
                }
                else
                {
                    Aller(4);
                }
            }));
        }

        // 5. Fin
        void PageFin()
        {
            titre.Text = "Toolkit est installé";
            sousTitre.Text = "Dossier : " + champDossier.Text.Trim();
            precedent.Visible = false;
            annuler.Visible = false;
            suivant.Text = "Terminer";
            Texte("Au premier lancement, Toolkit te guidera : connexion à ton compte Claude (et GitHub si tu veux), préférences, puis ton premier projet.", 0, 44);
            Texte("Pour le retrouver : raccourci « Toolkit » sur le Bureau ou dans le menu Démarrer. Pour le désinstaller : Paramètres Windows > Applications > Toolkit (tes projets sont gardés).", 52, 60);
            caseLancer.Text = "Lancer Toolkit maintenant";
            caseLancer.SetBounds(28, 124, 400, 24);
            contenu.Controls.Add(caseLancer);
        }

        void Terminer()
        {
            if (installationReussie && caseLancer.Checked)
            {
                try { Process.Start(Path.Combine(champDossier.Text.Trim(), "Toolkit.exe")); } catch { }
            }
            Close();
        }
    }

    // --- Désinstallation -----------------------------------------------------------------------

    class Desinstallateur : Form
    {
        public Desinstallateur()
        {
            Text = "Désinstaller Toolkit";
            Font = new Font("Segoe UI", 9.75f);
            AutoScaleMode = AutoScaleMode.Dpi;
            ClientSize = new Size(560, 270);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }

            string dossier = null;
            using (var cle = Registry.CurrentUser.OpenSubKey(Outils.CleDesinstallation))
                if (cle != null) dossier = cle.GetValue("InstallLocation") as string;
            if (dossier == null) dossier = Path.GetDirectoryName(Application.ExecutablePath);

            var texte = new Label { Text = "Toolkit va être retiré de ce PC (dossier « " + dossier + " »).\n\nTes projets (dossier « projets ») et tes réglages (dossier « donnees ») sont GARDÉS, sauf si tu coches la case ci-dessous. Les logiciels installés à côté (Node.js, Git, Claude Code…) ne sont pas touchés." };
            texte.SetBounds(20, 18, 520, 120);
            var tout = new CheckBox { Text = "Supprimer aussi mes projets et mes réglages (Corbeille)" };
            tout.SetBounds(20, 146, 520, 24);
            var ok = new Button { Text = "Désinstaller" };
            ok.SetBounds(316, 220, 110, 30);
            var non = new Button { Text = "Annuler" };
            non.SetBounds(432, 220, 110, 30);
            non.Click += (s, e) => Close();
            ok.Click += (s, e) =>
            {
                if (tout.Checked && MessageBox.Show(this, "Mettre aussi TES PROJETS et tes réglages à la Corbeille ?\nTu pourras les y récupérer tant qu'elle n'est pas vidée.", "Toolkit", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
                // Toolkit ouvert : ses fichiers sont verrouillés. On ne le ferme jamais de force
                // (travail non enregistré) : on demande de le quitter.
                if (Process.GetProcessesByName("electron").Length > 0 && MessageBox.Show(this,
                    "Si Toolkit est ouvert, quitte-le d'abord : clic droit sur son icône près de l'horloge > Quitter Toolkit.\n\nC'est fait ?", "Toolkit", MessageBoxButtons.OKCancel, MessageBoxIcon.Information) != DialogResult.OK) return;
                var erreurs = new List<string>();
                foreach (var lien in new[] { Path.Combine(Outils.Bureau(), "Toolkit.lnk"), Path.Combine(Outils.MenuDemarrer(), "Toolkit.lnk") })
                    try { if (File.Exists(lien)) File.Delete(lien); } catch (Exception x) { erreurs.Add(x.Message); }
                var aRetirer = new List<string> { Path.Combine(dossier, "app"), Path.Combine(dossier, "Lancer Toolkit.vbs"), Path.Combine(dossier, "Toolkit.exe") };
                if (tout.Checked) { aRetirer.Add(Path.Combine(dossier, "projets")); aRetirer.Add(Path.Combine(dossier, "donnees")); }
                foreach (var chemin in aRetirer)
                {
                    try { Corbeille.Envoyer(chemin); } catch (Exception x) { erreurs.Add(chemin + " : " + x.Message); }
                }
                try { Registry.CurrentUser.DeleteSubKeyTree(Outils.CleDesinstallation, false); } catch { }
                // Démarrage avec Windows (s'il était activé dans Toolkit).
                try
                {
                    using (var run = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true))
                        if (run != null && run.GetValue("Toolkit") != null) run.DeleteValue("Toolkit", false);
                }
                catch { }
                MessageBox.Show(this, erreurs.Count == 0
                    ? "Toolkit a été désinstallé." + (tout.Checked ? "" : "\nTes projets et réglages sont toujours dans « " + dossier + " ».")
                    : "Toolkit a été désinstallé, mais certains éléments n'ont pas pu être retirés (Toolkit est peut-être encore ouvert) :\n" + string.Join("\n", erreurs),
                    "Toolkit", MessageBoxButtons.OK, MessageBoxIcon.Information);
                // Ce fichier (« Désinstaller Toolkit.exe ») se retire lui-même juste après sa fermeture.
                string exe = Application.ExecutablePath;
                Process.Start(new ProcessStartInfo("cmd.exe", "/d /c ping -n 3 127.0.0.1 >nul & del /f /q \"" + exe + "\"") { CreateNoWindow = true, UseShellExecute = false });
                Close();
            };
            Controls.AddRange(new Control[] { texte, tout, ok, non });
        }
    }

    // Envoi à la Corbeille (jamais de suppression définitive des fichiers de l'utilisateur).
    static class Corbeille
    {
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct SHFILEOPSTRUCT
        {
            public IntPtr hwnd;
            public uint wFunc;
            public string pFrom;
            public string pTo;
            public ushort fFlags;
            public bool fAnyOperationsAborted;
            public IntPtr hNameMappings;
            public string lpszProgressTitle;
        }

        [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
        static extern int SHFileOperation(ref SHFILEOPSTRUCT op);

        public static void Envoyer(string chemin)
        {
            if (!File.Exists(chemin) && !Directory.Exists(chemin)) return;
            var op = new SHFILEOPSTRUCT
            {
                wFunc = 3, // FO_DELETE
                pFrom = chemin + "\0\0",
                fFlags = 0x0040 | 0x0010 | 0x0004 | 0x0400, // ALLOWUNDO | NOCONFIRMATION | SILENT | NOERRORUI
            };
            int code = SHFileOperation(ref op);
            if (code != 0) throw new IOException("code " + code);
        }
    }
}
