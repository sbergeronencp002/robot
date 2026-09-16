# Robotique — CSS des Bois-Francs

Répertoire des projets de robotique du primaire, consultable par les enseignantes
et enseignants, et administrable par une seule personne depuis son navigateur.

| | |
|---|---|
| **Site public** | `index.html` — tuiles filtrables par cycle, ensemble, univers et difficulté |
| **Administration** | `admin.html` — ajout, modification, suppression et publication |
| **Données** | `data/projets.json` |
| **Images** | `images/` — téléversées automatiquement par l'administration |
| **Documents** | Hébergés sur le SharePoint du centre de services |

---

## Mise en service (une seule fois)

### 1. Activer GitHub Pages

1. Dans le dépôt GitHub, ouvrez **Settings** (l'onglet ⚙️ en haut).
2. Dans le menu de gauche, cliquez sur **Pages**.
3. Sous *Build and deployment* → *Source*, choisissez **Deploy from a branch**.
4. Sous *Branch*, choisissez **main** et le dossier **/ (root)**, puis **Save**.

Après une ou deux minutes, le site est en ligne à une adresse du type :

```
https://sbergeronencp002.github.io/robot/
```

L'administration se trouve à la même adresse, suivie de `admin.html`.

<a id="jeton"></a>

### 2. Créer un jeton d'accès GitHub

Le jeton autorise la page d'administration à enregistrer vos projets dans le dépôt.

1. Allez sur **https://github.com/settings/personal-access-tokens/new**
2. **Token name** : `Répertoire robotique`
3. **Expiration** : choisissez la durée maximale offerte (notez la date : il faudra
   refaire cette étape à l'échéance).
4. **Repository access** : *Only select repositories* → choisissez **robot**.
5. **Permissions** → *Repository permissions* → **Contents** → réglez sur
   **Read and write**. (Ne cochez rien d'autre.)
6. Cliquez sur **Generate token**, puis **copiez immédiatement** la chaîne affichée :
   GitHub ne la remontrera jamais.

Ouvrez ensuite `admin.html`, collez le jeton dans le champ prévu et cliquez sur
**Se connecter**. Le jeton reste dans ce navigateur, sur cet appareil seulement.

> **À savoir.** La page d'administration est accessible à qui connaît son adresse,
> mais elle est **inerte sans jeton** : personne ne peut rien enregistrer. Ne
> partagez pas votre jeton, et utilisez **Oublier le jeton** sur un poste partagé.

---

## Ajouter un projet

1. Ouvrez `admin.html`. Si votre jeton est déjà enregistré sur cet appareil,
   la connexion se fait **toute seule** : le panneau 1 reste replié et affiche
   simplement `connecté`.
2. Remplissez la fiche : titre, description courte, cycle, ensemble, univers,
   difficulté, durée, cahier de l’élève, guide pédagogique facultatif, image. L'aperçu montre la tuile telle
   qu'elle apparaîtra.
3. Cliquez sur **Ajouter le projet**. Répétez autant de fois que voulu.
4. Cliquez sur **Publier sur le site**.

Le site public se met à jour une à deux minutes plus tard.

> Les enregistrements restent sur votre appareil tant que vous n'avez pas publié.
> L'étiquette en haut de la liste indique toujours où vous en êtes :
> *à jour* ou *modifications non publiées*.

Le bouton **Dupliquer** reprend une fiche existante dans le formulaire. Modifiez
son titre ou ses paramètres, puis cliquez sur **Ajouter la copie**.

### Les liens SharePoint

Dans SharePoint : **Partager** → réglez la permission sur **Tout le monde** →
**Copier le lien**. Collez le cahier dans le champ obligatoire et, lorsqu’il existe, le guide dans le champ facultatif.

Si votre centre de services impose une **date d'expiration** sur ces liens, elle
apparaît dans la fenêtre de partage. Les liens expirés cesseront de fonctionner
sur le site : il faudra alors les régénérer et les recoller.

---

## Structure d'une fiche

Chaque projet est enregistré ainsi dans `data/projets.json` :

```json
{
  "id": "p1m2x3abcd",
  "cree": "2026-09-11T14:02:00.000Z",
  "titre": "Le robot trieur de couleurs",
  "description": "Les élèves programment un bras qui distingue et classe des blocs.",
  "cycle": "3",
  "ensemble": "prime",
  "univers": ["materiel"],
  "difficulte": "intermediaire",
  "duree": 120,
  "documents": {
    "eleve": "https://…sharepoint.com/cahier",
    "guide": "https://…sharepoint.com/guide"
  },
  "moteurs": 1,
  "composants": ["couleur"],
  "image": "images/2026-09-11-robot-trieur-a3f2.webp"
}
```

| Champ | Valeurs acceptées |
|---|---|
| `cycle` | `"1"` · `"2"` · `"3"` |
| `ensemble` | `"ev3"` · `"prime"` · `"essentiel"` · `"wedo"` |
| `univers` | Une ou plusieurs valeurs : `"materiel"` · `"vivant"` · `"terre"` |
| `moteurs` | `0` · `1` · `2` · `3` (3 ou plus) |
| `composants` | `"couleur"` · `"distance"` · `"force"` · `"mouvement"` · `"matrice"` |
| `difficulte` | `"debutant"` · `"intermediaire"` · `"expert"` |
| `duree` | `60` · `120` · `180` |

Les tuiles s'affichent du projet le plus récent au plus ancien.

---

## Questions courantes

**Le site n'affiche pas mon nouveau projet.**
Attendez deux minutes, puis rechargez avec `Ctrl+F5` (`Cmd+Shift+R` sur Mac).
Vérifiez dans l'onglet **Actions** du dépôt que la publication est terminée.
La liste des projets, elle, n'est jamais mise en cache : un projet manquant
vient toujours d'une publication encore en cours.

**J'ai modifié le code du site et le navigateur affiche l'ancienne version.**
Le site vérifie maintenant sa version automatiquement et recharge les fichiers
CSS et JavaScript lorsqu'une mise à jour est publiée. Lors d'une modification
du code, il suffit de changer la valeur dans `assets/version.json` et la même
valeur `versionLocale` dans `index.html` et `admin.html`.

**« Le fichier a changé sur GitHub depuis votre dernier chargement. »**
Le répertoire a été modifié ailleurs (autre appareil, autre navigateur). Cliquez
sur **Recharger depuis le site**, puis refaites votre modification.

**L'administration me redemande de me connecter à chaque visite.**
Elle ne devrait pas : le jeton est mémorisé et la connexion est automatique.
Si ça se reproduit, c'est que le navigateur efface les données de site à la
fermeture (navigation privée, ou un réglage de confidentialité strict).

**J'ai changé d'ordinateur.**
Refaites l'étape 2 : un jeton est propre à chaque navigateur. Vous pouvez
réutiliser le même jeton si vous l'avez conservé.

**Mon jeton est expiré.**
Générez-en un nouveau (étape 2) et collez-le dans l'administration.

**Une image téléversée par erreur reste dans `images/`.**
Sans conséquence : un fichier qu'aucune fiche ne référence n'est jamais affiché.

## Les images

Rien à préparer : l'administration **recadre et compresse automatiquement**
chaque image au format des tuiles (16:10), en conservant la plus grande zone
possible centrée. Chaque nouveau fichier est enregistré en WebP à exactement
**1000 × 625 px** et optimisé pour le Web. L'administration affiche aussi le
poids final avant l'ajout.

La publication est **atomique** : les nouvelles images et `projets.json` sont
mis en ligne dans un seul commit. Si une étape échoue, aucune publication
partielle n'apparaît sur le site.

Deux conseils pour un résultat flatteur :

- **Choisissez une image en format paysage.** Une photo verticale perdra le
  haut et le bas au recadrage.
- **Placez le sujet au centre.** Le recadrage part du milieu de l'image.

L'aperçu du formulaire montre le recadrage réel : si le résultat ne vous plaît
pas, changez d'image ou recadrez-la vous-même avant de la téléverser.

---

## Partager une sélection filtrée

Les filtres se reflètent dans l'adresse. Vous pouvez donc transmettre un lien
préfiltré par courriel :

```
…/robot/?cycle=2&ensemble=prime
…/robot/?univers=vivant
…/robot/?difficulte=debutant
…/robot/?q=capteur
```

---

## Classement multiple et entretien des images

Un projet peut appartenir à plusieurs cycles et à plusieurs univers. Les anciens
projets qui utilisent encore une seule valeur demeurent compatibles.

Au moment de publier, l’administration retire automatiquement du dossier
`images/` les fichiers qui ne sont plus associés à aucun projet. Le fichier
`.gitkeep` est toujours conservé.

Les boutons **Tester le cahier** et **Tester le guide** vérifient que chaque adresse utilise HTTPS et mène vers SharePoint, puis ouvrent le document dans un nouvel onglet afin de confirmer ses autorisations d’accès.

Le guide est facultatif. La zone des documents conserve toujours la même hauteur sur les tuiles, qu’un guide soit présent ou non.

## Matériel utilisé et optimisation

Chaque projet peut préciser son nombre de moteurs ainsi que ses capteurs et
composants. Ces informations apparaissent sur les tuiles, alimentent la
recherche et peuvent être filtrées sur le site public.

Les nouvelles images sont recadrées à 1000 × 625 px et enregistrées en WebP.
Le jeton GitHub demeure maintenant uniquement dans la session du navigateur et
n’est plus conservé durablement sur l’appareil.
