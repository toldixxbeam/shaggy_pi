# Shaggy OS 2.0 — Hybrid display release

Shaggy OS is **two independent services**:

- `shaggy-pi.service` — existing private AI agent and persistent Playwright Chromium browser on loopback port **8787**
- `shaggy-os.service` — lightweight kitchen display, Display Studio and Pi health on loopback port **8790**

A separate desktop Chromium profile runs the HDMI kiosk. The agent operates in its own Xvfb browser profile. Opening Jumbo or navigating a site must **not** interrupt the HDMI screen.

## Install on the existing 64-bit Raspberry Pi

You do **not** need to reflash the microSD or reinstall the AI agent for this update.

Run through SSH as your normal desktop login user (for example `shaggy`):

```bash
cd ~/shaggy-pi-build/shaggy_pi
git pull --ff-only
sudo bash scripts/install-os.sh
```

The installer creates a systemd service and an XDG desktop autostart entry for the invoking login user. It does not modify the AI agent, its settings or browser profile. The new kiosk opens when that desktop user's graphical session starts; if the screen is at a login screen, enable desktop autologin through Raspberry Pi OS configuration or log in normally. Verify the local service before restarting the desktop.

## Verify from Pi SSH

```bash
systemctl is-active shaggy-pi shaggy-os
curl -fsS http://127.0.0.1:8790/health
curl -fsS http://127.0.0.1:8790/api/display
python3 -m unittest discover -s tests -p 'test_os.py' -v
```

## Open the phone/desktop Control Center from Windows

The new control center is **not publicly exposed**. Establish its SSH tunnel from **Windows PowerShell**, not from inside the Pi:

```powershell
ssh -N -o ExitOnForwardFailure=yes -L 8791:127.0.0.1:8790 shaggy@shaggy.local
```

Open `http://127.0.0.1:8791`. Obtain its *separate* private token on Pi SSH with:

```bash
sudo cat /var/lib/shaggypi/display-token
```

The existing Shaggy AI interface still uses the other local tunnel, `8789:127.0.0.1:8787`. Both can run at once. The Display Studio can change the currently active display mode, update a household announcement, and toggle the Shaggy takeover animation. The takeover also appears automatically when the local AI agent reports an active task, then returns to the household view. It also reports CPU temperature, RAM, disk, uptime and agent health. The HDMI screen polls for changes every six seconds.

## Current feature fidelity

The release contains real dashboard rendering, persistent layout settings, authentication, health monitoring, GUI autostart and two separated browser profiles. **Weather, moon phases, Google Calendar, photos, native Jumbo shopping lists, voice-triggered HDMI takeovers and remote domain routing are not integrated yet.** Their tiles are clearly identified as not connected. AI browsing, chat, Google OAuth and other Shaggy features live in the existing agent application, which still needs its own OpenAI API key configured locally.

Do not put browser passwords, payment data or API secrets into the layout announcement. The display endpoint is read-only and deliberately requires no token so the unattended kiosk can load it, but the state is only served on loopback.

The current public `shaggy.marlonkoland.com` server is independent. A future HTTPS reverse tunnel / authenticated proxy must be tested before public remote operation; **never forward the raw control ports publicly**. A residential IP is not a guarantee of website automation permission.

## Recovery

Stop only the new dashboard (agent unaffected):

```bash
sudo systemctl disable --now shaggy-os
rm ~/.config/autostart/shaggy-os.desktop
```

The previous desktop autostart file (if any) is backed up with a timestamp. The AI browser and its private data remain in `/var/lib/shaggypi`. If another Chromium kiosk autostart exists, disable the old kiosk manually after confirming the new one works to avoid two full-screen browsers.

For diagnostics use `sudo journalctl -u shaggy-os -n 100 --no-pager` and check whether Raspberry Pi OS actually started a graphical desktop for your user. On Lite/headless installations there is no HDMI graphical session to launch the kiosk.

## Raspberry Pi OS Trixie / labwc HDMI fix

Diagnostic evidence: graphical user session and `labwc` were running, HDMI-A connected and the dashboard systemd service active, but no kiosk Chromium process was launched. The previous XDG-only `~/.config/autostart/shaggy-os.desktop` file was not reliably started by labwc. The new installer configures `~/.config/labwc/autostart`, backs up any existing file, preserves the default global desktop startup when creating a new one, and launches `/opt/shaggy-os/start-kiosk.sh` as the desktop user. The launcher waits for the local server, locks against duplicate instances and uses its own Wayland Chromium profile.

Update and reboot from Pi SSH:

```bash
cd ~/shaggy-pi-build/shaggy_pi && git pull --ff-only && sudo bash scripts/install-os.sh && sudo reboot
```

After reconnecting, verify `pgrep -af 'shaggy-os-kiosk|start-kiosk'` and the presence of `~/.config/labwc/autostart`. If the HDMI panel is still blank, inspect `journalctl --user -b` and the graphical session environment; don't touch the independent AI browser service.

## Three original Google calendars: combined day + month (15 Nov 2026)

Restored all three calendar identifiers from the original `julia.html`:
- Julia's Google calendar
- An imported Google calendar
- The additional Google group calendar

The **top-left** tile on the Pi and the Shaggy website is a combined **today agenda**, and the **bottom-left** tile is a combined **month**. All three sources are enabled by default. In **Display Studio → Calendar sources**, toggle Julia / Imported / Family individually. Both calendar iframes use the same selection, persisted on the Pi in `display.json`. Updates do not reload iframes every six seconds; only a source/date change triggers the new Google embed URL.

The calendar views use Google's supported embedded calendar interface, timezone Europe/Amsterdam; Shaggy does not receive OAuth tokens and does not modify calendar events. **Visibility depends on the calendars' Google sharing permissions and on the browser's Google login**, especially for personal calendars. If an embed displays an access error or no events, authorize the intended account and verify its sharing settings. Do not publish private ICS links or grant public visibility without informed consent. The imported feed can lag based on Google's import/update interval.

To apply to the live system: from Pi SSH, run `cd ~/shaggy-pi-build/shaggy_pi && git pull --ff-only && sudo bash scripts/install-os.sh && sudo bash scripts/install-unified.sh && sudo reboot`. The existing outbound SSH relay reconnects automatically after reboot. The domain's cloud Caddy configuration does not need another change if it already forwards to the Pi portal. Verify today's and this month's events in the browser after the device restarts.
