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
