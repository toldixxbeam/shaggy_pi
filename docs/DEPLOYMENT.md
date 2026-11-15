# Shaggy Pi deployment and operational boundaries

## What this release does
Deploys the existing Shaggy AI browser service from the `shaggy` repository onto a Raspberry Pi 4 running 64-bit Raspberry Pi OS. The agent executes real Chromium browser actions on the home's network using cloud AI via a private API key stored on the Pi. The existing browser dashboard includes browser screenshots and manual interaction. No Jumbo-specific scripts are needed.

## What this release deliberately does not do
Does not reinstall the operating system, format a disk, change SSH authentication, replace the kitchen kiosk, migrate cloud sessions, publish a public network port, or redirect `shaggy.marlonkoland.com`. These are separate cutovers requiring a live Pi audit, tested rollback and remote connectivity. No credentials are copied from GitHub.

## Prerequisites
Raspberry Pi OS 64-bit (aarch64), internet connectivity, git, sudo, enough free disk for Chromium and Python dependencies. Existing SSH access remains enabled. The `shaggy` repository must be accessible by git; private repos need authorized authentication already configured on the Pi. Never insert credentials into a clone URL or shell history.

## Setup
From the Pi SSH shell, with git already installed:
```sh
bash -c 'set -e; d="$HOME/shaggy-pi-build"; mkdir -p "$d"; git clone https://github.com/toldixxbeam/shaggy_pi.git "$d/shaggy_pi"; bash "$d/shaggy_pi/scripts/bootstrap.sh"'
```
This command is for a staged application installation, not an OS wipe. It installs `shaggy-pi.service`, listens only on 127.0.0.1:8787, and leaves the old display running.

## Connect from another computer
```sh
ssh -N -L 8787:127.0.0.1:8787 PI_USER@PI_LAN_ADDRESS
```
Open http://127.0.0.1:8787 in that computer's browser. Get the one-time dashboard token privately from `sudo cat /var/lib/shaggypi/access-token` in Pi SSH. The browser profile remains in `/var/lib/shaggypi/browser-profile`.

## Verification and rollback
```sh
sudo systemctl status shaggy-pi --no-pager
curl -fsS http://127.0.0.1:8787/health
sudo journalctl -u shaggy-pi -n 50 --no-pager
```
Stop the deployment without affecting the old kiosk:
```sh
sudo systemctl disable --now shaggy-pi
```
Never expose port 8787 or Playwright debugging remotely. The public domain and phone-usable remote browser require authenticated reverse tunnelling and a separate tested rollout. Keep payment and account approval human-mediated. Do not paste tokens, screenshots containing personal data, or private logs into public issues.
