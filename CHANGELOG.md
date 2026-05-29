# Changelog

Toutes les modifications notables sont documentées ici.
Format basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
versioning selon [Semantic Versioning](https://semver.org/lang/fr/).

## [Unreleased]

## [1.0.7] - 2026-05-29

### Interface
- Améliore le contraste de la page StarRating sur les thèmes sombres colorés (navy, etc.) : variables `--sr-bg-soft` et `--sr-border` basées sur blanc semi-transparent au lieu de gris, inputs/selects avec fond légèrement lumineux, pills inactives plus visibles.

## [1.0.6] - 2026-05-29

### Corrections
- Détection du fond : cible maintenant `.mainDrawer`, `.appfooter` et `.cardPadder` (éléments porteurs de la couleur du thème) et extrait la couleur RGB de base en ignorant la transparence.

## [1.0.5] - 2026-05-29

### Corrections
- Détection du fond : cherche maintenant dans les éléments de contenu Jellyfin (`.homeSections`, `.mainAnimatedPage`, etc.) pour capturer les couleurs définies par un CSS personnalisé, avant de revenir sur html/body.

## [1.0.4] - 2026-05-29

### Corrections
- Améliore la détection de la couleur de fond du thème Jellyfin : vérifie maintenant l'élément `html` en premier, et filtre les valeurs CSS variables non résolues (`var(...)`).

## [1.0.3] - 2026-05-29

### Corrections
- Corrige l'affichage des demi-étoiles dans le widget de notation : le clip était calculé sur la largeur du slot (1,7 em) au lieu du caractère étoile (1 em), ce qui rendait la demi-étoile visuellement pleine.
- Corrige la couleur de fond de la page StarRating pour qu'elle s'adapte dynamiquement au thème Jellyfin actif (lecture de la vraie valeur calculée du DOM au lieu de variables CSS qui ne matchaient pas tous les thèmes).

## [1.0.2] - 2026-05-29

## [1.0.1] - 2026-05-29

### Corrections
- Corrige le bouton "Désinstaller" dans l'interface Jellyfin : la version dans `meta.json` est désormais au format `X.Y.Z.0` pour correspondre à la version de l'assembly, ce qui permet à l'API Jellyfin de retrouver le plugin lors de la désinstallation.

## [1.0.0] - 2026-05-24

Première release publique. Plugin Jellyfin complet pour noter et commenter ses médias.

### Fonctionnalités
- Notation des films et séries de 0,5 à 5 étoiles (demi-étoiles).
- Avis textuels facultatifs : ajout, modification, suppression.
- Affichage de la moyenne sur les fiches détaillées et badges sur les affiches.
- Onglet StarRating dédié regroupant tous les médias notés (filtres, statistiques, tri).
- Import / export des notes en JSON ou CSV.
- Modération : les administrateurs peuvent supprimer n'importe quel avis.

### Interface
- Adaptation automatique aux thèmes Jellyfin via variables CSS (`--theme-*`, `--rounding`) — compatible ElegantFin et autres CSS personnalisés.
- Responsive : optimisé mobile (≤ 600 px), petits téléphones (≤ 380 px), tablette, desktop et TV (≥ 1600 px).
- "Supprimer ma note" supprime aussi l'avis associé, instantanément (UI optimiste).

### Installation
- Installation en un lien via dépôt Jellyfin (`manifest.json`).
- Désinstallation propre : le plugin retire ses propres traces de `index.html` à l'arrêt du serveur. Aucun résidu après désinstallation.
- Cycle de release automatisé via GitHub Actions (tag push → build + GitHub Release + mise à jour du manifest).
