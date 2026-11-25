// End-to-end check of an Artache Chat server.
//
// Usage:  node smoke.mjs <server-url> <invite-token>
//   e.g.  node smoke.mjs http://127.0.0.1:8008 "$(cat ../server/data/db/secrets/invite-token)"
//
// It makes two throwaway accounts, then proves:
//   1. an account cannot be made without the invite token;
//   2. a new room is end-to-end encrypted without anyone asking for it;
//   3. a text message and an image arrive and decrypt on the friend's side;
//   4. the server itself only ever holds ciphertext (it sees "m.room.encrypted",
//      never the words or the picture).
// Use it on a test server: the accounts it makes stay on the server.

import * as sdk from "matrix-js-sdk";
import { decryptAttachment, encryptAttachment } from "matrix-encrypt-attachment";
import { randomBytes } from "node:crypto";

// Print only our PASS/FAIL lines; the SDK and its crypto log a lot to the console.
const say = console.log.bind(console);
console.log = console.info = console.debug = console.warn = () => {};

const [baseUrl = "http://127.0.0.1:8008", token] = process.argv.slice(2);
if (!token) {
  console.error("Usage: node smoke.mjs <server-url> <invite-token>");
  process.exit(2);
}

const run = randomBytes(3).toString("hex");
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  say(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

async function api(path, { method = "GET", body, accessToken } = {}) {
  const res = await fetch(baseUrl + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

// Registration with the m.login.registration_token step (Matrix spec v1.2+).
async function register(username, password, inviteToken) {
  const first = await api("/_matrix/client/v3/register", {
    method: "POST",
    body: { username, password, initial_device_display_name: "smoke test" },
  });
  if (first.status !== 401 || !first.json.session) return first;
  const flow = { type: "m.login.registration_token", session: first.json.session };
  if (inviteToken !== undefined) flow.token = inviteToken;
  return api("/_matrix/client/v3/register", {
    method: "POST",
    body: { username, password, auth: flow, initial_device_display_name: "smoke test" },
  });
}

async function startClient(creds) {
  const client = sdk.createClient({
    baseUrl,
    accessToken: creds.access_token,
    userId: creds.user_id,
    deviceId: creds.device_id,
  });
  await client.initRustCrypto({ useIndexedDB: false });
  await new Promise((resolve) => {
    client.once(sdk.ClientEvent.Sync, (state) => state === "PREPARED" && resolve());
    client.startClient({ initialSyncLimit: 10 });
  });
  return client;
}

function waitForDecrypted(client, roomId, predicate, ms = 20000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for message")), ms);
    const onDecrypted = (event) => {
      if (event.getRoomId() === roomId && !event.isDecryptionFailure() && predicate(event)) {
        clearTimeout(timer);
        client.off(sdk.MatrixEventEvent.Decrypted, onDecrypted);
        resolve(event);
      }
    };
    client.on(sdk.MatrixEventEvent.Decrypted, onDecrypted);
  });
}

const password = randomBytes(12).toString("hex");

// 1. Invite token required.
const noToken = await register(`intruder${run}`, password);
check("account without invite token is refused", !noToken.json.access_token, `HTTP ${noToken.status}`);
const badToken = await register(`intruder${run}b`, password, "wrong-token");
check("account with a wrong invite token is refused", !badToken.json.access_token, `HTTP ${badToken.status}`);

const a = await register(`alice${run}`, password, token);
const b = await register(`bruno${run}`, password, token);
check("accounts with the invite token are made", !!(a.json.access_token && b.json.access_token));
if (!a.json.access_token || !b.json.access_token) {
  console.error(a.json, b.json);
  process.exit(1);
}

const alice = await startClient(a.json);
const bruno = await startClient(b.json);

// 2. Encrypted by default: create a plain DM without asking for encryption.
const { room_id: roomId } = await alice.createRoom({ is_direct: true, invite: [bruno.getUserId()] });
const enc = await api(
  `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.encryption/`,
  { accessToken: a.json.access_token },
);
check("new rooms start end-to-end encrypted", enc.json.algorithm === "m.megolm.v1.aes-sha2", enc.json.algorithm);

await bruno.joinRoom(roomId);
// Let both sides see each other's devices before sending.
await new Promise((r) => setTimeout(r, 1500));

// 3a. Text.
const secret = `the lighthouse key is ${run}`;
const gotText = waitForDecrypted(bruno, roomId, (e) => e.getContent().body === secret);
await alice.sendTextMessage(roomId, secret);
const textEvent = await gotText;
check("text message decrypts on the friend's device", textEvent.getContent().body === secret);

// 3b. Image: encrypted on the sender's device before upload, as Matrix apps do.
const imageBytes = randomBytes(64 * 1024);
const encrypted = await encryptAttachment(imageBytes);
const upload = await alice.uploadContent(Buffer.from(encrypted.data), {
  type: "application/octet-stream",
  name: "photo.bin",
});
const gotImage = waitForDecrypted(bruno, roomId, (e) => e.getContent().msgtype === "m.image");
await alice.sendMessage(roomId, {
  msgtype: "m.image",
  body: "photo.jpg",
  info: { mimetype: "image/jpeg", size: imageBytes.length },
  file: { ...encrypted.info, url: upload.content_uri },
});
const imageEvent = await gotImage;
const file = imageEvent.getContent().file;
const [serverName, mediaId] = file.url.replace("mxc://", "").split("/");
const dl = await fetch(`${baseUrl}/_matrix/client/v1/media/download/${serverName}/${mediaId}`, {
  headers: { authorization: `Bearer ${b.json.access_token}` },
});
const stored = Buffer.from(await dl.arrayBuffer());
const decrypted = Buffer.from(await decryptAttachment(stored, file));
check("image downloads and decrypts on the friend's device", decrypted.equals(imageBytes));
check("server stores the image only as ciphertext", !stored.equals(imageBytes) && stored.length === imageBytes.length);

// 4. What the server holds: read the room history straight from the API, no client crypto.
const raw = await api(
  `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=20`,
  { accessToken: b.json.access_token },
);
const messages = raw.json.chunk.filter((e) => e.type.startsWith("m.room.message") || e.type === "m.room.encrypted");
const leaks = JSON.stringify(raw.json).includes(secret);
check(
  "server holds only m.room.encrypted events, never the text",
  messages.length >= 2 && messages.every((e) => e.type === "m.room.encrypted") && !leaks,
  `${messages.length} messages`,
);

alice.stopClient();
bruno.stopClient();

const failed = results.filter((r) => !r.ok).length;
say(`\n${results.length - failed} of ${results.length} checks passed.`);
process.exit(failed ? 1 : 0);
