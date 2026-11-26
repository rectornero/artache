# Artache Chat

A private, end-to-end encrypted chat that runs on Nero's own PC, for Nero and invited
friends: text, voice messages, images, videos and links. Part of the Artache suite.

Status (2026-11-25): server kit written and tested in the cloud (8 of 8 checks pass). Not
yet installed on the PC. No Artache interface yet; any Matrix app works meanwhile.

## How it fits together

```
 Friend's phone/PC                 Nero's PC (Windows)
 ┌──────────────┐   Tailscale    ┌──────────────────────────────────────────┐
 │ Artache Chat │──(https, ts.net)──▶ Tailscale ─▶ 127.0.0.1:8008           │
 │ app, or any  │                │                 │                        │
 │ Matrix app   │                │        Docker: Tuwunel (Matrix server)   │
 └──────────────┘                │                 │                        │
   encrypts and decrypts         │        volume artache-chat_db            │
   on the device                 │        (only ciphertext of messages      │
                                 │         and media, plus account data)    │
                                 └──────────────────────────────────────────┘
```

- **Server**: [Tuwunel](https://github.com/matrix-construct/tuwunel) 2.0.0, a small Rust
  Matrix homeserver (Apache-2.0), in Docker. Settings in `server/tuwunel.toml`, version pinned
  in `server/docker-compose.yml`.
- **Encryption**: the standard Matrix scheme (Olm/Megolm, as used by Element and audited). It
  happens only on the devices. The server is never given keys. We write no crypto of our own.
- **Reach**: the server listens only on `127.0.0.1`. Friends reach it through Tailscale,
  either Funnel (a public `https://<pc>.<tailnet>.ts.net` address) or by joining Nero's
  tailnet. The home router stays closed.
- **IDs**: `@name:tzero.live` (Nero's choice, 2026-11-26), fixed forever at setup. tzero.live
  (on Netlify) serves one static file, `/.well-known/matrix/client`, pointing apps to the
  PC's `https://<pc>.<tailnet>.ts.net` address. `setup` prints its exact contents.
- **Invite-only**: accounts need the current invite token. `invite` makes a new one and the
  old one stops working at once (no restart). The first account becomes the admin.
- **Private island**: federation with other Matrix servers is off, link previews on the server
  are off, every new room is encrypted by default, uploads up to 200 MiB.

## Why the interface can change freely

The server speaks only the open [Matrix Client-Server API](https://spec.matrix.org/latest/client-server-api/).
Whatever the Artache app ends up looking like, it talks to the server through a Matrix SDK
that does the encryption on the device:

- web or desktop (Tauri/Electron): `matrix-js-sdk` with its Rust crypto (`initRustCrypto`),
  the same stack `test/smoke.mjs` uses;
- native or mobile later: `matrix-rust-sdk`.

So no interface change ever needs a server change, and friends can keep using Element until
the Artache app is ready. Media is encrypted on the device before upload (see the image step
in `test/smoke.mjs`); the server only stores the encrypted bytes.

## What stays private, what does not

Private (encrypted on the devices): message text, images, videos, voice messages, files,
reactions, and links inside messages.

Visible to whoever controls the PC or its disk (metadata): who has an account, who is in which
room, when messages are sent and their size, display names and avatars, and the Tailscale
address each friend connects from. Tailscale sees which devices connect, not the contents.

Main risks: a compromised PC (exposes the metadata and lets an attacker interfere with the
server, not read past messages); lost keys (each person must turn on key backup / recovery
key in their app, or a lost phone means lost history); an out-of-date server (run `update`
when a release lands); disk space for videos.

## Using it on the PC

Needs Docker Desktop and Tailscale, both signed in. From PowerShell in this `chat` folder:

```powershell
.\scripts\artache-chat.ps1 setup -ServerName tzero.live   # once: server name, invite token, start, open to friends
.\scripts\artache-chat.ps1 status
.\scripts\artache-chat.ps1 invite                # new invite token for a friend
.\scripts\artache-chat.ps1 backup                # copy to Documents\Artache Chat backups (keeps 7)
.\scripts\artache-chat.ps1 restore -From "<backup folder>"
.\scripts\artache-chat.ps1 update -Version v2.0.1
.\scripts\artache-chat.ps1 stop | start | logs
```

Every action is logged to `logs/artache-chat.log`. Nothing runs on a timer.

## Testing

With a server running (for example `SERVER_NAME=chat.test docker compose up -d` in `server/`
on any machine with Docker, after putting a token in `server/secrets/invite-token`):

```bash
cd test && npm install
node smoke.mjs http://127.0.0.1:8008 "$(cat ../server/secrets/invite-token)"
```

It proves: no account without the token; new rooms are encrypted; text and an image arrive and
decrypt on the friend's device; the server holds only `m.room.encrypted` events and encrypted
media. The accounts it makes stay on the server, so use a test server.

## Cost

Runs entirely on the PC and Tailscale (free plan). No Netlify functions, database or deploys;
`netlify.toml` skips the Artache site build when only `chat/` changes.
