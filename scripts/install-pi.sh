#!/usr/bin/env bash
# Shaggy Pi: non-destructive installer for Raspberry Pi OS 64-bit (Debian Bookworm/Trixie).
set -Eeuo pipefail
if [[ ${EUID} -ne 0 ]]; then echo 'Use sudo bash scripts/install-pi.sh' >&2; exit 1; fi
. /etc/os-release
if [[ "${ID}" != "debian" && "${ID}" != "raspbian" ]]; then echo 'Raspberry Pi OS (Debian) required; refusing unsupported OS.' >&2; exit 1; fi
if [[ "$(uname -m)" != "aarch64" ]]; then echo '64-bit ARM Raspberry Pi OS is required. No changes made.' >&2; exit 1; fi
if [[ ! -d app && ! -d vendor/shaggy/app ]]; then
  echo 'Missing agent source. Run from checkout with vendor/shaggy or app.' >&2; exit 1
fi
SOURCE_DIR="$PWD"
AGENT_SOURCE="$SOURCE_DIR/vendor/shaggy"
[[ -d "$SOURCE_DIR/app" ]] && AGENT_SOURCE="$SOURCE_DIR"
[[ -f "$AGENT_SOURCE/app/server.py" ]] || { echo 'Agent source incomplete.' >&2; exit 1; }
[[ -f "$AGENT_SOURCE/requirements.txt" ]] || { echo 'Agent requirements missing.' >&2; exit 1; }
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y python3 python3-venv python3-pip git curl xvfb xauth chromium libnss3 libatk-bridge2.0-0 libgbm1 libasound2t64 2>/dev/null || apt-get install -y python3 python3-venv python3-pip git curl xvfb xauth chromium libnss3 libatk-bridge2.0-0 libgbm1 libasound2
id shaggypi >/dev/null 2>&1 || useradd --system --home-dir /var/lib/shaggypi --create-home --shell /usr/sbin/nologin shaggypi
install -d -o shaggypi -g shaggypi -m 0700 /var/lib/shaggypi
install -d -m 0755 /opt/shaggy-pi/app
cp -a "$AGENT_SOURCE/app/." /opt/shaggy-pi/app/
cp "$AGENT_SOURCE/requirements.txt" /opt/shaggy-pi/requirements.txt
python3 -m venv /opt/shaggy-pi/.venv
/opt/shaggy-pi/.venv/bin/pip install --disable-pip-version-check -r /opt/shaggy-pi/requirements.txt
# Playwright's bundled Linux browser is not guaranteed on ARM64; use distro Chromium.
CHROMIUM="$(command -v chromium || command -v chromium-browser)"
[[ -x "$CHROMIUM" ]] || { echo 'Chromium missing'; exit 1; }
cat > /etc/systemd/system/shaggy-pi.service <<EOF
[Unit]
Description=Shaggy Pi AI browser agent
Wants=network-online.target
After=network-online.target
[Service]
Type=simple
User=shaggypi
Group=shaggypi
WorkingDirectory=/opt/shaggy-pi
Environment=SHAGGY_DATA=/var/lib/shaggypi
Environment=SHAGGY_CHROMIUM_PATH=$CHROMIUM
Environment=PYTHONUNBUFFERED=1
ExecStart=/usr/bin/xvfb-run -a -s "-screen 0 1280x800x24 -nolisten tcp" /opt/shaggy-pi/.venv/bin/python -m app.server
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/shaggypi
UMask=0077
[Install]
WantedBy=multi-user.target
EOF
# Wrapper patch only adds the executable_path option to the existing browser code.
python3 - <<'PY'
from pathlib import Path
p=Path('/opt/shaggy-pi/app/server.py')
s=p.read_text()
needle="str(DATA / 'browser-profile'), headless=os.getenv('SHAGGY_HEADLESS') == '1',"
replacement="str(DATA / 'browser-profile'), executable_path=os.getenv('SHAGGY_CHROMIUM_PATH') or None, headless=os.getenv('SHAGGY_HEADLESS') == '1',"
if needle not in s:
    raise SystemExit('Browser upstream changed. Refusing to patch an unrecognized version.')
p.write_text(s.replace(needle,replacement,1))
PY
chown -R root:root /opt/shaggy-pi
chmod 0755 /opt/shaggy-pi
systemctl daemon-reload
systemctl enable --now shaggy-pi.service
for n in {1..30}; do
  if curl -fsS --max-time 2 http://127.0.0.1:8787/health >/dev/null; then
    echo 'Shaggy Pi healthy on localhost:8787. Existing kiosk and SSH untouched.'
    echo 'Read login token locally with: sudo cat /var/lib/shaggypi/access-token'
    exit 0
  fi
  sleep 2
done
echo 'Agent health check failed. Existing kiosk untouched. See sudo journalctl -u shaggy-pi -n 50.' >&2
exit 1
