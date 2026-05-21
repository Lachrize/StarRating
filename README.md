# StarRating - Plugin Jellyfin

StarRating ajoute un systeme de notes et commentaires communautaires a Jellyfin. Chaque utilisateur peut noter les films et series, publier un commentaire, modifier ou supprimer sa contribution, puis retrouver tous ses medias notes dans une page dediee.

## Fonctionnalites

- Notes de 0.5 a 5 etoiles pour les films et series.
- Commentaires utilisateur avec edition et suppression.
- Moyenne serveur affichee sur la fiche detail.
- Badges de note sur les affiches.
- Onglet `StarRating` sur la page d'accueil Jellyfin avec filtres, tri et statistiques.
- Import/export JSON et CSV avec titre, note, commentaire et dates lisibles.
- Configuration admin : longueur maximale des avis, activation des commentaires, types autorises, badges de moyenne.
- Stockage local SQLite, sans service externe.

## Compatibilite

- Jellyfin 10.10+ recommande.
- Projet cible : `.NET 9` (`net9.0`).
- Le plugin contient une partie serveur C# et une partie web (`Web/starrating.js`, `Web/starrating.css`) a injecter dans Jellyfin Web.

## Structure

```text
StarRating/
├── Configuration/                 # Configuration du plugin
├── Controllers/                   # API StarRating
├── Models/                        # DTOs et modeles
├── Services/                      # SQLite + logique metier
├── Web/                           # UI Jellyfin Web
├── Plugin.cs
├── PluginServiceRegistrator.cs
├── StarRating.csproj
└── build.yaml
```

## Build

Le projet reference les assemblies Jellyfin installees localement via la propriete MSBuild `JellyfinDir`.

Prerequis : SDK .NET 9.

Sur macOS avec l'application Jellyfin :

```bash
dotnet build -c Release
```

Sur un autre systeme, indique le dossier contenant les DLL Jellyfin :

```bash
dotnet build -c Release -p:JellyfinDir=/path/to/jellyfin
```

Le fichier compile se trouve ensuite dans :

```text
bin/Release/net9.0/Jellyfin.Plugin.StarRating.dll
```

## Installation

### Installation depuis un depot Jellyfin

Dans Jellyfin : `Tableau de bord` -> `Plugins` -> `Depots` -> ajouter :

```text
https://raw.githubusercontent.com/Lachrize/StarRating/main/manifest.json
```

Ensuite, installer `StarRating` depuis le catalogue des plugins, puis redemarrer Jellyfin.

Apres redemarrage, le plugin charge automatiquement son interface web. Aucun fichier JS/CSS n'est a copier manuellement.

### Installation manuelle avancee

#### 1. Plugin serveur

Creer un dossier StarRating dans le repertoire plugins de Jellyfin, puis copier la DLL :

```bash
mkdir -p /var/lib/jellyfin/plugins/StarRating
cp bin/Release/net9.0/Jellyfin.Plugin.StarRating.dll /var/lib/jellyfin/plugins/StarRating/
```

Redemarrer Jellyfin.

#### 2. Plugin web

Copier les fichiers web dans Jellyfin Web :

```bash
mkdir -p /usr/share/jellyfin-web/plugins/starrating
cp Web/starrating.js /usr/share/jellyfin-web/plugins/starrating/starrating.js
cp Web/starrating.css /usr/share/jellyfin-web/plugins/starrating/starrating.css
```

Ajouter les assets dans `/usr/share/jellyfin-web/index.html`, juste avant `</head>` ou `</body>` :

```html
<link rel="stylesheet" href="plugins/starrating/starrating.css">
<script defer src="plugins/starrating/starrating.js"></script>
```

Vider le cache navigateur apres mise a jour (`Cmd + Shift + R` ou `Ctrl + Shift + R`).

#### macOS Jellyfin.app

Pour l'application macOS, le chemin Jellyfin Web ressemble a :

```text
/Applications/Jellyfin.app/Contents/Resources/jellyfin-web/
```

#### Docker

Avec Docker, monte les fichiers dans le conteneur ou copie-les avec `docker cp`, puis redemarre le conteneur Jellyfin.

## Configuration

Dans Jellyfin : `Tableau de bord` -> `Plugins` -> `StarRating`.

Options disponibles :

- activer/desactiver les commentaires ;
- longueur maximale des avis ;
- affichage des badges sur les affiches ;
- types de medias autorises (`Movie`, `Series`).

## Import / Export

Depuis l'onglet `StarRating` -> `Outils` :

- export JSON ou CSV ;
- import JSON ou CSV ;
- fusion ou ecrasement des donnees existantes.

Les exports regroupent une ligne par media avec `Titre`, `Note`, `Commentaire`, `Type`, `Annee`, `ItemId`, `NoteCreee` et `CommentaireCree`.

## API

| Methode | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/StarRating/config` | Configuration publique |
| `POST` | `/StarRating/summaries` | Moyennes en batch |
| `GET` | `/StarRating/summary/{itemId}` | Moyenne d'un media |
| `GET` | `/StarRating/rating/{itemId}` | Note de l'utilisateur courant |
| `POST` | `/StarRating/rating` | Creer ou mettre a jour une note |
| `DELETE` | `/StarRating/rating/{itemId}` | Supprimer note et commentaire |
| `GET` | `/StarRating/reviews/{itemId}` | Avis d'un media |
| `POST` | `/StarRating/review` | Publier un avis |
| `PUT` | `/StarRating/review/{reviewId}` | Modifier un avis |
| `DELETE` | `/StarRating/review/{reviewId}` | Supprimer un avis |
| `GET` | `/StarRating/my-ratings` | Liste des notes utilisateur |
| `GET` | `/StarRating/stats` | Statistiques utilisateur |
| `GET` | `/StarRating/export` | Export utilisateur |
| `POST` | `/StarRating/import` | Import utilisateur |

## Developpement

```bash
dotnet build -c Release
```

Les dossiers `bin/` et `obj/` ne doivent pas etre commit.
