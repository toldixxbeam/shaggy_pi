#!/usr/bin/env bash
# Run from an SSH session on an already configured 64-bit Raspberry Pi.
set -Eeuo pipefail
command -v git >/dev/null || { echo 'Install git first: sudo apt-get install git'; exit 1; }
WORKDIR="${HOME}/shaggy-pi-build"
mkdir -p "$WORKDIR"
if [[ -d "$WORKDIR/shaggy_pi/.git" ]]; then git -C "$WORKDIR/shaggy_pi" pull --ff-only; else git clone https://github.com/toldixxbeam/shaggy_pi.git "$WORKDIR/shaggy_pi"; fi
mkdir -p "$WORKDIR/shaggy_pi/vendor"
if [[ -d "$WORKDIR/shaggy_pi/vendor/shaggy/.git" ]]; then git -C "$WORKDIR/shaggy_pi/vendor/shaggy" pull --ff-only; else git clone https://github.com/toldixxbeam/shaggy.git "$WORKDIR/shaggy_pi/vendor/shaggy"; fi
cd "$WORKDIR/shaggy_pi"
sudo bash scripts/install-pi.sh
