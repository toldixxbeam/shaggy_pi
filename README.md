# Shaggy Pi

A phone-controlled, always-on Raspberry Pi 4 assistant and kitchen display.

## Product direction

- **Pi:** local backend, kiosk display renderer, status/telemetry, configuration and secure integrations.
- **Phone:** responsive web interface/PWA to chat with Shaggy, send voice input, change display layouts, and administer the Pi.
- **AI:** cloud model via an authenticated backend adapter; no provider API secrets in the browser or repository. Optional limited local/offline functions.
- **Eventually:** publish authenticated web UI at `https://shaggy.marlonkoland.com`, using a secure reverse proxy/tunnel without opening a raw unauthenticated Pi port.

## First release

1. Lightweight local web service and websocket channel to sync phone controls to the kiosk.
2. Mobile dashboard (Home, Displays, Shaggy AI, Accounts, System).
3. Kiosk display with customizable widgets, including clock, sunrise/sunset, weather, and calendar.
4. Local device status (CPU, memory, temperature, network, uptime) with no sensitive network information exposed to guests.
5. Layout persistence in a local database; simple profiles (Kitchen, Calendar, Photos, Custom URL).
6. AI chat adapter with streaming responses and user-supplied credentials stored in protected server configuration.
7. Phone microphone via browser audio capture after explicit permission; voice processing is opt-in.
8. Pairing flow for first admin device, signed-in sessions, access restrictions, and an audit trail for sensitive operations.
9. Systemd services for backend and Chromium kiosk; no repetitive iframe reloads.
10. Scripted deployments via GitHub with health checks and rollback.

## Repository design (target)

```
server/       Python FastAPI API, websocket, auth, AI adapters and device metrics
web/          Responsive phone UI and fullscreen Pi display modes
config/       Widget and display schemas (no secrets)
scripts/      Setup, upgrade, backup and rollback
systemd/      Services for backend and kiosk
docs/         Pi installation, account connection, remote access and troubleshooting
```

## Important boundaries

- Pi 4 does **not** have a built-in microphone: the phone provides voice input.
- Cloud AI is not the same as running an advanced LLM fully on the Pi.
- Google account access requires OAuth and the necessary scopes. Existing ChatGPT account connections do not automatically transfer to a custom Pi app.
- Avoid automatic destructive system changes; deploy application first, then migrate old kiosk with an explicit rollback option.
- Keep secrets in environment files or secure credential storage, never in GitHub.
- Install on a private LAN initially; remote access requires HTTPS + authentication.

## Previous display

The old `julia.html` embedded Google calendars and periodically reloaded calendar and weather iframes. Keep functional goals but rebuild using efficient polling/caching and only update changed UI elements.

## Raspberry Pi agent deployment (staged, not cut over)

The first implementation is committed in `scripts/install-pi.sh`, `scripts/bootstrap.sh`, and `docs/DEPLOYMENT.md`. It stages the existing `shaggy` browser agent on 64-bit Raspberry Pi OS as a separate systemd service with persistent local Chromium, cloud-model requests, token-protected local web control, and data in `/var/lib/shaggypi`.

**Do not consider this a complete kiosk/website migration.** The installer has not been verified on the actual Pi. The existing display remains active. The production domain still points at the current Shaggy service. We must test hardware compatibility, validate browser interaction, set up secure phone access, add an independent kiosk UI, configure credential migration locally, and test rollback before any cutover. Do not treat GitHub-stored secrets as deployable credentials.


## Shaggy OS 2.0 hybrid dashboard (new)

The new independent HDMI kiosk and authenticated Display Studio now live in `shaggy_os/`. It does **not** replace the existing AI browser; both run in their own Chromium profiles. Install this additional service on a Pi with the AI agent already installed by following [docs/SHAGGY_OS_2.md](docs/SHAGGY_OS_2.md).

The display service listens on local port **8790**, while the existing AI workstation stays on **8787**. The kitchen screen can remain on while the agent browses. This is an implementation milestone, not the completed remote-domain integration. Calendar, weather, photos and direct Jumbo account data are currently placeholders; the existing Shaggy browser can still handle Jumbo with the owner's authorization.
