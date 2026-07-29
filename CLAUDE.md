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
La barre du bas porte une icône par usage ; les sous-onglets sont des pilules,
volontairement plus discrètes — un soulignement leur donnait l'allure d'une
seconde barre principale.

**Cocher ne supprime jamais.** Vaut pour les courses et les idées : l'élément
se barre et descend, la purge est un geste explicite. Toute suppression laisse
5 secondes pour annuler. Aucune suppression au glissement du doigt.

**L'appli s'ouvre sur l'Agenda**, l'écran le plus consulté.

**Un seul filtre à la fois, jamais deux croisés.** Les rappels se filtrent par
personne *ou* par catégorie, dans une même barre séparée d'un trait — pas deux
barres qui se combinent. À deux comptes, croiser les dimensions produit une
vingtaine de combinaisons dont presque aucune ne sert. Et l'information filtrée
(le prénom) reste affichée sur chaque ligne, pour ne jamais dépendre de la vue.
L'agenda se filtre de la même façon, par personne, et sa vue grille suit le
filtre comme la liste — sinon choisir « Alice » viderait l'une en laissant
l'autre pleine.

**« Commun », et les cases sont étanches.** Un rappel ou un événement qui n'est
à personne en particulier est *commun* — pas « personne », qui se lisait comme
« ça n'intéresse personne ». C'est la valeur par défaut, et elle vient en tête
partout : dans le menu « Pour qui », dans la barre de filtres, dans les deux
modules. Filtrer sur « Alice » ne montre QUE ce qui lui est assigné, jamais le
commun ; c'est ce qui fait de « Commun » une case comme les autres plutôt qu'un
fourre-tout qui déborderait dans toutes les vues. Pour voir sa journée entière,
on repasse par « Tout », qui est le premier bouton. Décidé avec Alice le
29/07/2026 — ne pas rendre le filtre inclusif sans le lui redemander.

**L'appli s'utilise debout, à une main.** Zones tactiles d'au moins 44 px.
La coche des courses fait 34 px à l'œil — au-delà elle écraserait la ligne — mais
44 au doigt, étendue par un `::after` transparent. Le carré et la cible ne sont
pas forcés d'avoir la même taille.

**Les textes d'aide passent sous un « ? ».** Ils sont justes, ils n'ont pas à
être relus tous les jours : `<details class="aide">`. Ce qui reste visible, c'est
une ligne — un `.note` — et la ligne de contexte chiffrée de l'en-tête (`.kicker`).
Celle-ci est en petites capitales : elle doit tenir sur une ligne à 375 px, donc
un compte sec, pas une phrase.

**Vérifier le rendu, pas la déclaration.** Trois pannes déjà attrapées comme ça,
et aucune ne se voyait à la lecture :

- `var(--matin)1F` est une règle CSS invalide — on ne colle pas une transparence
  hexadécimale derrière une variable ; il faut une propriété `opacity` à part.
  Ce bug a survécu à un test qui se contentait de lire l'attribut `style`.
- `[data-poste=matin]` et `.cell` pèsent le même poids. Le bloc des couleurs de
  postes était écrit en haut de la feuille, avec les autres jetons : à
  spécificité égale, c'est la dernière règle écrite qui gagne, et pas une seule
  couleur de poste ne s'appliquait. Il vit donc **en fin de fichier**, après les
  composants qu'il repeint.
- Le contraste. La maquette place `#A19786` sur la crème (2,4) et une encre crème
  sur `#C67139` (3,3) : illisible à 10 px sur un téléphone tenu à bout de bras.
  Les jetons ont été réaccordés jusqu'à 4,5 mesurés, en gardant les teintes.

Mesurer avec `getComputedStyle`, et calculer les ratios plutôt que les estimer.

**Jamais de page blanche muette.** Les deux écrans partent `hidden`, donc une
exception au démarrage ne montrait rien du tout — et l'autre compte n'a alors
rien à raconter, ce qui rend le dépannage à distance impossible. Un gestionnaire
`error` en tête d'`index.html` révèle l'écran de connexion et affiche la panne.
Il est posé **en phase de capture** : un échec de chargement de fichier ne
remonte pas jusqu'à `window` autrement. Vérifié en provoquant les deux pannes,
pas en relisant le code.

Corollaire : ce qui est distant et facultatif porte `data-optionnel`, et le
gestionnaire l'ignore. Les polices Google en sont : hors réseau elles ne se
chargent pas, l'appli retombe sur ses substituts — ce n'est pas une panne de
démarrage, et l'annoncer comme telle serait pire que de se taire. Les deux cas
sont vérifiés en provoquant l'échec, pas en relisant la condition.

**Heures locales, jamais UTC** — sinon les postes se décalent d'une heure deux
fois par an.

## Apparence

Direction « Organic », reprise d'une maquette Claude Design. La crème est le sol
de l'appli ; le blanc cassé ne sert qu'à ce qui est posé dessus. **Les blocs
`.step` ne sont plus des cartes** — un titre et de l'espace séparent deux sujets
aussi bien qu'une bordure, sans empiler des rectangles blancs identiques.
Caprasimo pour les titres d'écran et les chiffres qui comptent (l'heure de lever
en 62 px), Figtree pour tout le reste.

**Toute la couleur vit dans `css/app.css`, en variables.** Le JS ne pose que
`data-poste="matin"` ou `data-cat="repas"` ; c'est le CSS qui choisit le fond
*et* l'encre lisible dessus. Une seule valeur ne suffisait pas : du blanc sur
l'ocre du matin est illisible, du noir sur l'indigo de la nuit aussi. Chaque type
porte donc trois jetons — `--matin`, `--matin-encre`, `--matin-doux` (le fond
atténué des cases d'agenda). **Ne pas réintroduire de couleur dans le JS** : deux
tables auraient divergé au premier changement de palette, et le mode sombre
serait à écrire deux fois.

**Le mode sombre se choisit dans Réglages → Apparence** (Auto · Clair · Sombre),
`js/noyau/theme.js`. Il pose `data-theme` sur `<html>`, ce qui ne fait que
redéfinir les mêmes variables : jamais une seconde feuille de style. « Auto »
n'écrit aucun attribut et laisse `prefers-color-scheme` décider — d'où le bloc de
jetons sombres écrit deux fois, un sélecteur ne pouvant pas couvrir les deux
chemins.

Deux raisons de ne pas passer par `store` ni par la base pour ce réglage : il
doit s'appliquer **avant la première peinture** (un petit script synchrone en
tête d'`index.html` lit `localStorage`, sinon l'appli s'ouvre en blanc puis
bascule), et c'est un réglage d'appareil — Fab peut vouloir le sombre sans
l'imposer à Alice. `theme.js` écrit donc au même endroit que ce script.

L'impression force les jetons clairs : une grille imprimée depuis le mode sombre
sortirait en aplats bruns qui vident la cartouche.

## À savoir

- `data.json` à la racine est l'ancien mécanisme de synchronisation, remplacé
  par Supabase. Conservé comme filet, plus lu par personne.
- **Il n'y a plus de sauvegarde `.json` dans Réglages.** Elle datait du temps où
  les données ne vivaient que dans le navigateur ; depuis Supabase, la base est
  la source de vérité et aucun de ces fichiers n'a jamais été rouvert. Retirée
  le 29/07/2026 avec son import. Si la question du filet indépendant revient,
  c'est un export à refaire, pas à déterrer — il devrait couvrir les six tables,
  pas seulement le planning comme l'ancien.
- Ce qui manque : notifications (les rappels ne préviennent pas encore), champ
  `rayon` des courses présent en base mais sans interface.
- **Pas d'écran d'accueil en tuiles.** À cinq usages il ne ferait qu'ajouter un
  détour avant la barre du bas. La question se reposera au sixième — mais la
  barre sature à cinq, donc ce sera l'un ou l'autre.
- Le carnet d'idées vit dans Réglages → Idées d'évolution, en base : c'est là
  qu'Alice note ce qu'elle veut voir arriver.
