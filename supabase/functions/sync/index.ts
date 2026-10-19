// Artache sync endpoint.
// The `artache-sync` CLI posts session metadata here, authenticated with a
// personal sync token created in Settings. Only the token's SHA-256 is stored.
import { createClient } from "npm:@supabase/supabase-js@2";

type IncomingProject = {
  path: string;
  name: string;
  repo?: string | null;
};

type IncomingSession = {
  external_id: string;
  cwd: string;
  title?: string | null;
  summary?: string | null;
  git_branch?: string | null;
  model?: string | null;
  message_count: number;
  started_at?: string | null;
  last_activity_at?: string | null;
};

type Payload = {
  machine: { name: string; platform?: string };
  projects: IncomingProject[];
  sessions: IncomingSession[];
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-") || "project";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token?.startsWith("art_")) return json({ error: "missing sync token" }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: tok } = await admin
    .from("sync_tokens")
    .select("id, owner, revoked_at")
    .eq("token_hash", await sha256(token))
    .maybeSingle();
  if (!tok || tok.revoked_at) return json({ error: "invalid sync token" }, 401);
  const owner = tok.owner as string;

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  if (!payload?.machine?.name || !Array.isArray(payload.sessions)) {
    return json({ error: "machine and sessions are required" }, 400);
  }

  const now = new Date().toISOString();
  await admin.from("sync_tokens").update({ last_used_at: now }).eq("id", tok.id);

  const { data: machine, error: machineError } = await admin
    .from("machines")
    .upsert(
      { owner, name: payload.machine.name, platform: payload.machine.platform ?? null, last_seen_at: now },
      { onConflict: "owner,name" },
    )
    .select("id")
    .single();
  if (machineError) return json({ error: machineError.message }, 500);

  // Projects are matched by slug so the same repo on two machines merges into one.
  const { data: existing } = await admin
    .from("projects")
    .select("id, slug, local_paths, repo_full_name, last_activity_at")
    .eq("owner", owner);
  const bySlug = new Map((existing ?? []).map((p) => [p.slug as string, p]));
  const projectIdByPath = new Map<string, string>();

  const lastActivityByPath = new Map<string, string>();
  for (const s of payload.sessions) {
    const t = s.last_activity_at ?? "";
    if (t > (lastActivityByPath.get(s.cwd) ?? "")) lastActivityByPath.set(s.cwd, t);
  }

  for (const p of payload.projects ?? []) {
    const slug = slugify(p.repo?.split("/").pop() ?? p.name);
    const lastActivity = lastActivityByPath.get(p.path) ?? null;
    const found = bySlug.get(slug);
    if (found) {
      const paths = new Set<string>(found.local_paths ?? []);
      paths.add(p.path);
      const newer = lastActivity && lastActivity > (found.last_activity_at ?? "") ? lastActivity : found.last_activity_at;
      await admin
        .from("projects")
        .update({ local_paths: [...paths], repo_full_name: found.repo_full_name ?? p.repo ?? null, last_activity_at: newer })
        .eq("id", found.id);
      projectIdByPath.set(p.path, found.id);
    } else {
      const { data: created, error } = await admin
        .from("projects")
        .insert({ owner, name: p.name, slug, repo_full_name: p.repo ?? null, local_paths: [p.path], last_activity_at: lastActivity })
        .select("id, slug, local_paths, repo_full_name, last_activity_at")
        .single();
      if (error) return json({ error: error.message }, 500);
      bySlug.set(slug, created);
      projectIdByPath.set(p.path, created.id);
    }
  }

  const rows = payload.sessions.map((s) => ({
    owner,
    machine_id: machine.id,
    project_id: projectIdByPath.get(s.cwd) ?? null,
    external_id: s.external_id,
    source: "cli",
    title: s.title?.slice(0, 300) ?? null,
    summary: s.summary?.slice(0, 2000) ?? null,
    cwd: s.cwd,
    git_branch: s.git_branch ?? null,
    model: s.model ?? null,
    message_count: s.message_count ?? 0,
    started_at: s.started_at ?? null,
    last_activity_at: s.last_activity_at ?? null,
  }));

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin
      .from("sessions")
      .upsert(rows.slice(i, i + 500), { onConflict: "owner,external_id" });
    if (error) return json({ error: error.message }, 500);
  }

  return json({ ok: true, machine: payload.machine.name, projects: projectIdByPath.size, sessions: rows.length });
});
