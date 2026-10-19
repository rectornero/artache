#!/usr/bin/env node
// artache-sync: send this computer's Claude Code session history to Artache.
//
// Reads ~/.claude/projects/*/*.jsonl (Claude Code's local transcripts), keeps
// only metadata (title, folder, branch, model, counts, timestamps) and posts it
// to the Artache sync endpoint. Message contents never leave the machine.
//
// Usage:
//   ARTACHE_URL=https://<ref>.supabase.co ARTACHE_TOKEN=art_... node artache-sync.mjs
//   node artache-sync.mjs --dry-run        # print what would be sent
//
// Config can also live in ~/.artache.json: { "url": "...", "token": "art_..." }

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir, hostname, platform } from "node:os";
import { basename, join } from "node:path";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");

function loadConfig() {
  const file = join(homedir(), ".artache.json");
  const fromFile = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  return {
    url: process.env.ARTACHE_URL ?? fromFile.url,
    token: process.env.ARTACHE_TOKEN ?? fromFile.token,
    machine: process.env.ARTACHE_MACHINE ?? fromFile.machine ?? hostname(),
    claudeDir: process.env.CLAUDE_CONFIG_DIR ?? fromFile.claudeDir ?? join(homedir(), ".claude"),
  };
}

function textOf(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.filter((c) => c?.type === "text").map((c) => c.text).join(" ");
  }
  return "";
}

function cleanTitle(text) {
  const t = text.replace(/<command-[a-z]+>[^<]*<\/command-[a-z]+>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!t || t.startsWith("Caveat:")) return null;
  return t.length > 120 ? `${t.slice(0, 117)}...` : t;
}

function parseSession(file) {
  const s = {
    external_id: basename(file, ".jsonl"),
    cwd: null,
    title: null,
    summary: null,
    git_branch: null,
    model: null,
    message_count: 0,
    started_at: null,
    last_activity_at: null,
  };
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (e.type === "summary" && e.summary) s.summary = e.summary;
    if (e.sessionId) s.external_id = e.sessionId;
    if (e.cwd) s.cwd = e.cwd;
    if (e.gitBranch) s.git_branch = e.gitBranch;
    if (e.timestamp) {
      if (!s.started_at || e.timestamp < s.started_at) s.started_at = e.timestamp;
      if (!s.last_activity_at || e.timestamp > s.last_activity_at) s.last_activity_at = e.timestamp;
    }
    if (e.type === "user" || e.type === "assistant") {
      if (e.isMeta || e.isSidechain) continue;
      s.message_count += 1;
      if (e.type === "assistant" && e.message?.model && e.message.model !== "<synthetic>") s.model = e.message.model;
      if (e.type === "user" && !s.title) s.title = cleanTitle(textOf(e.message?.content));
    }
  }
  if (!s.title) s.title = s.summary;
  return s.cwd && s.message_count > 0 ? s : null;
}

function repoFor(cwd) {
  try {
    const url = execFileSync("git", ["-C", cwd, "remote", "get-url", "origin"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const m = url.match(/github\.com[:/]([^/]+\/[^/.]+)(\.git)?$/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function collect(claudeDir) {
  const root = join(claudeDir, "projects");
  if (!existsSync(root)) throw new Error(`No Claude Code history found at ${root}`);
  const sessions = [];
  for (const dir of readdirSync(root)) {
    const full = join(root, dir);
    if (!statSync(full).isDirectory()) continue;
    for (const f of readdirSync(full)) {
      if (!f.endsWith(".jsonl")) continue;
      const s = parseSession(join(full, f));
      if (s) sessions.push(s);
    }
  }
  const projects = [...new Set(sessions.map((s) => s.cwd))].map((path) => ({
    path,
    name: basename(path),
    repo: existsSync(path) ? repoFor(path) : null,
  }));
  return { projects, sessions };
}

async function main() {
  const cfg = loadConfig();
  const { projects, sessions } = collect(cfg.claudeDir);
  const payload = { machine: { name: cfg.machine, platform: platform() }, projects, sessions };

  if (dryRun) {
    console.log(JSON.stringify({ ...payload, sessions: sessions.slice(0, 5) }, null, 2));
    console.log(`\n${projects.length} projects, ${sessions.length} sessions (showing 5).`);
    return;
  }
  if (!cfg.url || !cfg.token) {
    console.error("Set ARTACHE_URL and ARTACHE_TOKEN, or create ~/.artache.json. Get both from Artache > Settings.");
    process.exit(1);
  }

  const res = await fetch(`${cfg.url.replace(/\/$/, "")}/functions/v1/sync`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`Sync failed (${res.status}): ${body.error ?? res.statusText}`);
    process.exit(1);
  }
  console.log(`Synced ${body.sessions} sessions across ${body.projects} projects from ${body.machine}.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
