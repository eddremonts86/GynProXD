#!/usr/bin/env bash
# Puts the PocketBase binary where the audit walks look for it.
#
# The version is read from the Dockerfile rather than written here, because two
# places holding one version number is one place to forget: the walks boot a
# server from this repo's own migrations to check its rules, and checking them
# against a different build than the one that ships is checking the wrong thing.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
dockerfile="$here/deploy/pocketbase/Dockerfile"

version="$(sed -n 's/^ARG PB_VERSION=\(.*\)$/\1/p' "$dockerfile" | head -1)"
if [ -z "$version" ]; then
  echo "::error title=No version::Could not read ARG PB_VERSION from $dockerfile."
  exit 1
fi

case "$(uname -m)" in
  x86_64) arch=amd64 ;;
  aarch64 | arm64) arch=arm64 ;;
  *) echo "::error title=Unknown arch::$(uname -m)"; exit 1 ;;
esac

target="$here/deploy/pocketbase/.local"
mkdir -p "$target"

url="https://github.com/pocketbase/pocketbase/releases/download/v${version}/pocketbase_${version}_linux_${arch}.zip"
echo "Fetching PocketBase $version ($arch)"
curl -sSfL "$url" -o /tmp/pb.zip
unzip -oq /tmp/pb.zip -d "$target" pocketbase
chmod +x "$target/pocketbase"
"$target/pocketbase" --version
