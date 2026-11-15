#!/usr/bin/env bash
# Install/update Shaggy OS 2.0 alongside the existing AI agent without wiping data.
set -Eeuo pipefail
[[ ${EUID} -eq 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE="$(cd "$SCRIPT_DIR/.." && pwd)"
[[ -f "$BASE/shaggy_os/server.py" && -f "$BASE/shaggy_os/index.html" ]] || { echo 'Missing Shaggy OS files' >&2; exit 1; }
[[ "$(getconf LONG_BIT)" == "64" ]] || { echo '64-bit OS required' >&2; exit 1; }
if ! id shaggypi >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/shaggypi --create-home --shell /usr/sbin/nologin shaggypi
fi
install -d -o shaggypi -g shaggypi -m 0700 /var/lib/shaggypi
install -d -m 0755 /opt/shaggy-os
install -m 0644 "$BASE/shaggy_os/server.py" /opt/shaggy-os/server.py
install -m 0644 "$BASE/shaggy_os/index.html" /opt/shaggy-os/index.html
cat > /etc/systemd/system/shaggy-os.service <<'UNIT'
[Unit]
Description=Shaggy OS 2.0 kitchen display and phone control
Wants=network-online.target
After=network-online.target
[Service]
Type=simple
User=shaggypi
Group=shaggypi
WorkingDirectory=/opt/shaggy-os
Environment=SHAGGY_OS_DATA=/var/lib/shaggypi
Environment=PYTHONUNBUFFERED=1
ExecStart=/usr/bin/python3 /opt/shaggy-os/server.py
Restart=on-failure
RestartSec=4
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/shaggypi
UMask=0077
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable shaggy-os.service
systemctl restart shaggy-os.service
for i in {1..30}; do
  if curl -fsS --max-time 2 http://127.0.0.1:8790/health >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS http://127.0.0.1:8790/health
echo
# Desktop kiosk autostart uses a different Chromium profile from agent's Xvfb browser.
# Target the SSH invoking user, not the shaggypi service user.
DESKTOP_USER="${SUDO_USER:-}"
if [[ -n "$DESKTOP_USER" && "$DESKTOP_USER" != root ]] && id "$DESKTOP_USER" >/dev/null 2>&1; then
  HOME_DIR="$(getent passwd "$DESKTOP_USER" | cut -d: -f6)"
  AUTOSTART="$HOME_DIR/.config/autostart"
  install -d -o "$DESKTOP_USER" -g "$(id -gn "$DESKTOP_USER")" -m 0755 "$AUTOSTART"
  KIOSK="$AUTOSTART/shaggy-os.desktop"
  if [[ -f "$KIOSK" ]]; then cp -a "$KIOSK" "$KIOSK.backup.$(date +%Y%m%d%H%M%S)"; fi
  cat > "$KIOSK" <<'DESKTOP'
[Desktop Entry]
Type=Application
Name=Shaggy OS Kitchen Display
Comment=Launch Shaggy OS HDMI dashboard
Exec=sh -c 'sleep 8; chromium --kiosk --no-first-run --disable-session-crashed-bubble --user-data-dir="$HOME/.config/shaggy-os-kiosk" http://127.0.0.1:8790/display'
Terminal=false
X-GNOME-Autostart-enabled=true
DESKTOP
  chown "$DESKTOP_USER:$(id -gn "$DESKTOP_USER")" "$KIOSK"
  echo "HDMI kiosk autostart configured for $DESKTOP_USER. Start the graphical desktop session or reboot to see it."
else
  echo 'No desktop user detected; kiosk autostart not configured. Run with sudo as your login user.'
fi
echo 'Control service available via SSH forwarding: Windows -L 8791:127.0.0.1:8790'
echo 'Private display token: sudo cat /var/lib/shaggypi/display-token'
echo 'This installer does not change the public domain or the AI browser service.'
