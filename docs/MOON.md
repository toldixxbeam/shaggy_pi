# Shaggy Moon deployment

The kitchen display serves Shaggy Moon locally from /opt/shaggy-os/moon, through the existing display service on port 8790. The unified dashboard proxies the same assets. No new domain, third-party CDN or monthly hosting is needed. Artwork and phase calculations work without internet.

The month occupies the left two-thirds; today is top-right; Shaggy Moon is bottom-right. All eight lunar phases have three rotating actions. The phase follows the current date automatically.

Update from the Pi login user:

```sh
cd ~/shaggy-pi-build/shaggy_pi
git pull --ff-only
sudo bash scripts/install-os.sh
sudo bash scripts/install-unified.sh
sudo reboot
```

Source: toldixxbeam/shaggy_moon. Bundled assets are pinned copies, so a private moon-repository checkout is not required on the Pi. Refresh the bundled moon.js and assets together for later releases. See moon/assets/CREDITS.md for artwork credits.
