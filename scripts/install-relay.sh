#!/usr/bin/env bash
# Pi side outbound reverse SSH relay. No inbound ports and no private keys in Git.
set -Eeuo pipefail
[[ "$EUID" == 0 ]] || { echo 'Run as root with sudo.' >&2; exit 1; }
PI_USER="${SUDO_USER:-shaggy}"
PI_HOME="$(getent passwd "$PI_USER" | cut -d: -f6)"
KEY="$PI_HOME/.ssh/shaggy_relay"
[[ -f "$KEY" ]] || { echo "Missing SSH key $KEY. Run ssh-keygen -t ed25519 -f ~/.ssh/shaggy_relay -N '' as your normal Pi user." >&2; exit 1; }
[[ -f "$PI_HOME/.ssh/known_hosts" ]] || { echo 'SSH host key not trusted. Verify the DigitalOcean server fingerprint before proceeding.' >&2; exit 1; }
# Require preverified host key, rather than accepting a first-seen host on boot.
sudo -u "$PI_USER" ssh -G -i "$KEY" 167.172.36.132 >/dev/null
cat > /etc/systemd/system/shaggy-pi-relay.service <<EOF
[Unit]
Description=Shaggy Pi outbound private dashboard tunnel
Wants=network-online.target
After=network-online.target shaggy-unified.service
[Service]
Type=simple
User=$PI_USER
Environment=HOME=$PI_HOME
ExecStart=/usr/bin/ssh -N -T -i $KEY -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=20 -o ServerAliveCountMax=3 -R 127.0.0.1:18800:127.0.0.1:8800 shaggyrelay@167.172.36.132
Restart=always
RestartSec=8
NoNewPrivileges=true
PrivateTmp=true
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable shaggy-pi-relay
systemctl restart shaggy-pi-relay
echo 'Relay started. Check sudo systemctl status shaggy-pi-relay --no-pager'
echo 'No router port forwarding is required. The cloud site must be cut over separately.'
