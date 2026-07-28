# Chez F&A

Appli web personnelle de Fab et Alice : liste de courses, agenda, rappels
récurrents, et le planning de postes de Fab.

**Ne pas employer le mot « famille » ni « foyer » dans les textes visibles.**
L'appli s'appelle « Chez F&A ». Deux comptes adultes, tutoiement, français partout —
noms de variables et de tables compris.

## Lancer

Un serveur est obligatoire : modules ES et connexion Supabase ne fonctionnent
pas en `file://`.

```bash
npx --yes http-server . -p 8765 -c-1
```

Puis http://127.0.0.1:8765 — l'adresse doit rester `127.0.0.1:8765`, elle est
déclarée dans les *Redirect URLs* de Supabase pour le lien de connexion.

## Architecture

Site statique publié par GitHub Pages, **aucun outil de compilation**. Ne pas
introduire de bundler, de framework ni d'étape de build.

```
index.html          coquille : écrans, onglets, sections
css/app.css
js/app.js           câblage de tout, démarrage, connexion
js/noyau/           signal · store · dates · ui · supabase · sync
js/planning/        modele · donnees · importer · codes · vue · export
js/courses/         modele · donnees · vue
js/agenda/          agenda.js
js/rappels/         rappels.js
js/idees/           idees.js
```

**`js/noyau/sync.js` est la pièce centrale.** Synchronisation différentielle
générique : un module décrit ses tables sous forme de « collections » (clé,
`versLigne`, `depuisLigne`, `versCle` si la clé s'écrit différemment des deux
côtés) et n'écrit aucune ligne de code réseau. L'ordre des collections compte —
une table citée par une autre vient d'abord ; les écritures suivent cet ordre,
les suppressions le remontent.

**`js/noyau/signal.js`** évite les imports circulaires : un module émet
`modifie` (des données ont changé) ou `rendre` (l'affichage doit être refait),
`app.js` écoute.

Les modules ne s'importent pas entre eux, à une exception assumée :
`agenda.js` lit `planning/modele.js` pour afficher le poste de Fab en face
de chaque événement. C'est la raison d'avoir réuni ces usages dans une même
appli.

## Données

Supabase, projet `aldelb-planning` (`fjhmzcvivomqyyyemvny`, eu-north-1).
Le connecteur Supabase est disponible dans les sessions Claude.

| Module   | Tables |
|----------|--------|
| planning | `poste_code`, `poste_jour`, `reglage` |
| courses  | `course_item`, `course_frequent` |
| agenda   | `evenement` |
| rappels  | `rappel`, `rappel_fait` |
| idées    | `idee` |
| commun   | `profil` |

Sécurité au niveau des lignes partout. Les fonctions internes vivent dans le
schéma `prive`, que l'API REST n'expose pas : `est_du_foyer()`, `est_adulte()`,
`marquer_maj()`, `marquer_creation()`, `creer_profil()`.

À la création d'un compte, `creer_profil()` déduit le prénom de l'adresse mail
(« fabien.lenzini@… » → « fabien.lenzini »). Ce n'est qu'un point de départ :
chacun corrige le sien dans Réglages → Compte. **Ne pas corriger en SQL** —
ce serait à refaire au compte suivant.

**Le planning n'est modifiable que par un adulte ; tout le reste est ouvert à
tous les comptes.** Ajouter du pain n'engage rien, réécrire le planning si.

Après toute migration, lancer `get_advisors` (type `security`) et corriger ce
qui remonte. Un seul avertissement reste, et il n'est pas corrigeable :
*leaked password protection*, que Supabase réserve au forfait Pro — au forfait
gratuit, la case n'existe pas dans le tableau de bord. Elle était sans objet du
temps de la connexion par lien seul ; depuis que le mot de passe est le chemin
normal, ce qui en tient lieu est la longueur minimale de 8 caractères
(Authentication → Sign In / Providers → Email, et le même seuil côté navigateur
dans `changerMotDePasse`) plus le gestionnaire de mots de passe du téléphone.
À deux comptes qui ne s'inscrivent nulle part ailleurs, le risque de mot de
passe déjà fuité est faible — ne pas passer au forfait Pro pour ça.

**La connexion se fait par mot de passe ; le lien reçu par mail n'est qu'un
secours.** Ce n'est pas une question de confort. Un mot de passe se tape dans
l'appli, donc la session s'enregistre dans le stockage de l'appli. Un lien
s'ouvre là où le mail est lu — le navigateur intégré du logiciel de courrier,
ou Safari alors que l'appli tourne depuis un raccourci de l'écran d'accueil, qui
a son propre stockage. La connexion réussit, la session atterrit à côté, et
l'appareil reste déconnecté sans pouvoir le dire. C'est ce qui a cassé l'appli
de Fab le 27/07/2026. Le lien reste pour le premier accès et les mots de passe
oubliés : chacun pose ensuite le sien dans Réglages → Compte. **Ne pas fixer de
mot de passe en SQL ni depuis le tableau de bord** — même raison que le prénom.

La clé `sb_publishable_…` dans `js/noyau/supabase.js` est **publique par
conception**. Ne jamais mettre la clé `service_role` dans le code du navigateur.

Le cache `localStorage` sert à l'affichage immédiat et hors réseau ; la base
est la source de vérité.

## Règles d'interface

**Navigation à deux niveaux.** La barre du bas ne porte que des usages
(Courses, Rappels, Agenda, Planning Fab, Réglages — cinq, c'est le maximum tenable
sur 375 px). Une opération qui n'a de sens que pour un module reste dans ce
module, en sous-onglet : Importer, Exporter et Codes sont des sous-onglets du
Planning. Réglages ne garde que ce qui concerne l'appli et les deux comptes.

**Cocher ne supprime jamais.** Vaut pour les courses et les idées : l'élément
se barre et descend, la purge est un geste explicite. Toute suppression laisse
5 secondes pour annuler. Aucune suppression au glissement du doigt.

**L'appli s'ouvre sur l'Agenda**, l'écran le plus consulté.

**Un seul filtre à la fois, jamais deux croisés.** Les rappels se filtrent par
personne *ou* par catégorie, dans une même barre séparée d'un trait — pas deux
barres qui se combinent. À deux comptes, croiser les dimensions produit une
vingtaine de combinaisons dont presque aucune ne sert. Et l'information filtrée
(le prénom) reste affichée sur chaque ligne, pour ne jamais dépendre de la vue.

**L'appli s'utilise debout, à une main.** Zones tactiles d'au moins 44 px.

**Vérifier le rendu, pas la déclaration.** `var(--matin)1F` est une règle CSS
invalide — on ne colle pas une transparence hexadécimale derrière une variable ;
il faut une propriété `opacity` à part. Ce bug a survécu à un test qui se
contentait de lire l'attribut `style` : mesurer avec `getComputedStyle`.

**Jamais de page blanche muette.** Les deux écrans partent `hidden`, donc une
exception au démarrage ne montrait rien du tout — et l'autre compte n'a alors
rien à raconter, ce qui rend le dépannage à distance impossible. Un gestionnaire
`error` en tête d'`index.html` révèle l'écran de connexion et affiche la panne.
Il est posé **en phase de capture** : un échec de chargement de fichier ne
remonte pas jusqu'à `window` autrement. Vérifié en provoquant les deux pannes,
pas en relisant le code.

**Heures locales, jamais UTC** — sinon les postes se décalent d'une heure deux
fois par an.

## À savoir

- `data.json` à la racine est l'ancien mécanisme de synchronisation, remplacé
  par Supabase. Conservé comme filet, plus lu par personne.
- Ce qui manque : notifications (les rappels ne préviennent pas encore), champ
  `rayon` des courses présent en base mais sans interface, écran d'accueil en
  tuiles à envisager si un sixième usage arrive.
- Le carnet d'idées vit dans Réglages → Idées d'évolution, en base : c'est là
  qu'Alice note ce qu'elle veut voir arriver.
