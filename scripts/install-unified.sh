#!/usr/bin/env bash
# Unify Shaggy AI browser and kitchen dashboard under one local authenticated origin.
set -Eeuo pipefail
[[ "$EUID" == 0 ]] || { echo 'Run sudo bash scripts/install-unified.sh' >&2; exit 1; }
BASE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[[ -f "$BASE/unified/server.py" && -f "$BASE/unified/index.html" ]] || exit 1
[[ -f /opt/shaggy-os/server.py && -f /opt/shaggy-pi/app/server.py ]] || { echo 'Install both the display and AI agent first.' >&2; exit 1; }
id shaggypi >/dev/null
install -d -m 0755 /opt/shaggy-unified
install -m 0644 "$BASE/unified/server.py" /opt/shaggy-unified/server.py
install -m 0644 "$BASE/unified/index.html" /opt/shaggy-unified/index.html
cat > /etc/systemd/system/shaggy-unified.service <<'UNIT'
[Unit]
Description=Shaggy OS unified dashboard, AI browser and display control
After=network-online.target shaggy-pi.service shaggy-os.service
Wants=network-online.target
[Service]
Type=simple
User=shaggypi
Group=shaggypi
WorkingDirectory=/opt/shaggy-unified
Environment=PYTHONUNBUFFERED=1
ExecStart=/usr/bin/python3 /opt/shaggy-unified/server.py
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadOnlyPaths=/opt/shaggy-unified
UMask=0077
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable shaggy-unified
systemctl restart shaggy-unified
for i in {1..25}; do
  if curl --fail --silent http://127.0.0.1:8800/health >/dev/null 2>&1; then
    echo 'Unified dashboard responding. Local agent and kitchen display preserved.'
    echo 'The public website is not switched until the secure relay and proxy are checked.'
    exit 0
  fi
  sleep 1
done
echo 'Dashboard did not start. Inspect sudo journalctl -u shaggy-unified -n 80' >&2
exit 1
