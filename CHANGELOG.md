# Changelog

Toutes les modifications notables sont documentées ici.
Format basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
versioning selon [Semantic Versioning](https://semver.org/lang/fr/).

## [Unreleased]

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
