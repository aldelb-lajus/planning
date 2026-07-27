# Réveils du cycle — mise en ligne

Le site tient dans un seul fichier : `index.html`. Aucun serveur, aucune base de données : il suffit de le déposer sur un hébergement statique. Une fois en ligne, il s'ouvre depuis n'importe quel navigateur, téléphone ou ordinateur.

> **Où vivent les données ?**
> Chaque appareil garde une copie locale dans son navigateur, et le planning partagé vit dans un fichier `data.json` **à la racine du dépôt GitHub du site** (voir « Même planning sur tous les appareils » plus bas). La navigation privée ne conserve rien en local.
>
> Sur iPhone, ajouter le site à l'écran d'accueil (Safari → Partager → « Sur l'écran d'accueil ») donne une icône d'appli et évite que Safari ne purge le stockage d'un site rarement visité.

## Option 1 — GitHub Pages (gratuit)

1. Sur github.com, créer un dépôt, par exemple `planning-fab`. Il doit être **public** (Pages sur dépôt privé demande un compte payant). Le fichier ne contient aucune donnée personnelle : le planning saisi ensuite reste dans ton navigateur.
2. Ajouter `index.html` au dépôt (bouton *Add file → Upload files*, ou en ligne de commande :)
   ```bash
   cd "C:\Users\AliceDELBOSC\Projets\perso\planning fab"
   git init && git add index.html && git commit -m "Réveils du cycle"
   git branch -M main
   git remote add origin https://github.com/<ton-compte>/planning-fab.git
   git push -u origin main
   ```
3. Dans le dépôt : *Settings → Pages → Build and deployment → Source : Deploy from a branch*, branche `main`, dossier `/ (root)`, puis *Save*.
4. Après une minute ou deux, le site est à l'adresse :
   `https://<ton-compte>.github.io/planning-fab/`

Mise à jour : pousser (ou re-téléverser) un nouveau `index.html` — les données des navigateurs ne bougent pas.

## Option 2 — Scaleway Object Storage

1. Console Scaleway → *Storage → Object Storage* → *Créer un bucket* (région au choix, ex. `fr-par`), visibilité **Public**.
2. Ouvrir le bucket → *Téléverser des objets* → déposer `index.html` (visibilité de l'objet : public).
3. Onglet *Paramètres du bucket* → activer **Site web statique** (« bucket website ») avec `index.html` comme page d'accueil.
4. L'URL du site est affichée dans ces mêmes paramètres, de la forme :
   `https://<nom-du-bucket>.s3-website.fr-par.scw.cloud`

Pour un nom de domaine personnalisé ou du cache CDN, Scaleway propose *Edge Services* devant le bucket — optionnel, le site fonctionne sans.

Mise à jour : re-téléverser `index.html` par-dessus l'ancien.

## Même planning sur tous les appareils

Le planning partagé est un fichier `data.json` que l'appli lit et écrit **dans le dépôt GitHub du site**.

**Pour consulter (téléphone, tablette, n'importe où) : rien à faire.** Hébergé sur GitHub Pages, le site déduit le dépôt de sa propre adresse et va chercher `data.json` tout seul à l'ouverture, au retour en ligne et à chaque retour au premier plan. Aucun réglage, aucun jeton, aucun fichier à importer.

**Pour modifier (l'appareil où tu importes le planning, tous les ~2 mois et demi) : un jeton, collé une seule fois.**
1. Sur github.com : photo de profil → *Settings* → *Developer settings* → *Personal access tokens* → **Fine-grained tokens** → *Generate new token* ;
   - *Repository access* : **uniquement** le dépôt du site (ex. `planning-fab`) ;
   - *Permissions → Repository permissions → Contents : Read and write* — rien d'autre ;
   - expiration : la plus longue proposée, puis *Generate* et copier le `github_pat_…`.
2. Sur l'appareil éditeur : *Réglages → Synchronisation* → coller le jeton → *Enregistrer le jeton*. C'est tout : chaque modification est publiée quelques secondes après (l'appli crée `data.json` toute seule au premier envoi).

Un appareil sans jeton qui modifie quand même garde ses changements en local et l'affiche clairement (« Modifications locales non publiées ») — rien n'est perdu, mais rien ne part.

**À savoir** : le dépôt étant public (obligatoire pour Pages gratuit), `data.json` est lisible par quiconque trouve le dépôt. Il ne contient que des codes de postes, des horaires et des dates — ni nom, ni lieu de travail. Si c'est gênant, on repasse en privé avec un petit serveur (fonction Scaleway) — me demander.

**Hébergement Scaleway** : le même mécanisme fonctionne, mais le site ne peut plus deviner le dépôt depuis l'adresse — ouvrir `index.html` et renseigner la constante `SYNC_REPO_CFG` (tout en haut du script, forme `compte/depot`) avant de téléverser.

## Vérification après mise en ligne

- Ouvrir l'URL sur le téléphone : les quatre onglets (Importer, Planning, Export, Réglages) s'affichent, le bandeau « Prochain réveil » apparaît dès qu'un planning est importé.
- Onglet Export : les boutons `.ics` et Google Agenda téléchargent un fichier, les boutons PDF ouvrent la boîte d'impression (« Enregistrer en PDF »). Google Agenda et la synchro nécessitent d'être en ligne ; tout le reste fonctionne hors connexion une fois la page chargée.
- Synchro : sur l'appareil éditeur, importer un cycle puis vérifier que Réglages → Synchronisation affiche « Publié » ; ouvrir le site sur le téléphone → le planning apparaît sans rien configurer.
- Réglages → Sauvegarde reste disponible en secours (export/import `.json` à la main).
