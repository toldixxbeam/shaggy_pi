#!/bin/sh
# Started by labwc in the logged-in graphical user's session.
# Never reuse the AI workstation's Chromium profile.
set -u
URL="http://127.0.0.1:8790/display"
PROFILE="$HOME/.config/shaggy-os-kiosk"
mkdir -p "$PROFILE"
# Only one kiosk per user/session; avoid piling up Chromium windows on compositor restarts.
if command -v flock >/dev/null 2>&1; then
  exec 9>"$HOME/.config/shaggy-os-kiosk.lock"
  flock -n 9 || exit 0
fi
# Wait for Shaggy OS, with a bounded startup delay.
attempt=0
while [ "$attempt" -lt 30 ]; do
  if curl --fail --silent --max-time 2 http://127.0.0.1:8790/health >/dev/null 2>&1; then break; fi
  attempt=$((attempt + 1))
  sleep 2
done
if [ "$attempt" -ge 30 ]; then
  echo "Shaggy OS kiosk: dashboard service was not ready" >&2
  exit 1
fi
exec /usr/bin/chromium --ozone-platform=wayland --kiosk --no-first-run \
  --password-store=basic \
  --disable-session-crashed-bubble --disable-infobars \
  --user-data-dir="$PROFILE" "$URL"
