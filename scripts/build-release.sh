#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${1:-1.0.2}"
DOTNET="${DOTNET:-/opt/homebrew/opt/dotnet@9/libexec/dotnet}"
STAGING="$ROOT/dist/staging_$VERSION"
ZIP="$ROOT/dist/StarRating_${VERSION}.zip"

cd "$ROOT"

"$DOTNET" publish -c Release -o "$ROOT/dist/publish" "$ROOT/StarRating.csproj" >/dev/null

rm -rf "$STAGING"
mkdir -p "$STAGING"
cp -R "$ROOT/dist/publish/." "$STAGING/"

cat > "$STAGING/meta.json" <<EOF
{
  "guid": "a4df60c5-6b46-4ce4-b6b7-d95a75b25c9e",
  "name": "StarRating",
  "description": "Notes et commentaires communautaires pour Jellyfin.",
  "overview": "Notes et commentaires communautaires pour Jellyfin",
  "owner": "Lachrize",
  "category": "General",
  "version": "$VERSION",
  "targetAbi": "10.11.0.0",
  "changelog": "Repository install fix and bundled dependencies.",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "status": "Active",
  "autoUpdate": true
}
EOF

rm -f "$ZIP"
(
  cd "$STAGING"
  zip -qr "$ZIP" .
)

echo "Built $ZIP"
echo "MD5: $(md5 -q "$ZIP")"
