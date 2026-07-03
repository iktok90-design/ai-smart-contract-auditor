#!/usr/bin/env bash
# Fetch the Solidity dependencies into lib/ at pinned commits. lib/ is gitignored
# (deps are not committed), and the .gitmodules entries were never registered as
# gitlinks, so `submodules: recursive` fetches nothing — CI uses this instead.
# Pins match the versions the contracts are developed against.
set -euo pipefail

cd "$(dirname "$0")/.."

pin() {
  local url="$1" dir="$2" commit="$3"
  if [ -d "$dir/.git" ]; then
    echo "✓ $dir already present"
    return
  fi
  echo "→ cloning $dir"
  git clone --quiet "$url" "$dir"
  git -C "$dir" checkout --quiet "$commit"
}

pin https://github.com/foundry-rs/forge-std lib/forge-std 8b531a016f15f761a632f5149a828228573420fc
pin https://github.com/OpenZeppelin/openzeppelin-contracts lib/openzeppelin-contracts 8b010f923a0f81599a3f8bab309a47ec99c62764

echo "✓ Solidity deps ready"
