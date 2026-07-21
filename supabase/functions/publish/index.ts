// GrowthLens admin: fires the publish-resources GitHub workflow for an
// authenticated admin. Deploy: Supabase Dashboard → Edge Functions → new
// function named `publish` → paste this file (or `supabase functions deploy
// publish`). Secrets: GITHUB_PAT — fine-grained PAT scoped to
// PRiME-2019/growthlens with Actions read+write (org policy must allow
// fine-grained PATs; a classic PAT with `workflow` scope is the fallback).
// SUPABASE_URL / SUPABASE_ANON_KEY are injected automatically.
//
// CORS stays permissive on purpose: the security boundary is the JWT check
// below (signups are closed, so any authenticated user is the admin).
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
  );
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return json({ error: "not signed in" }, 401);

  const r = await fetch(
    "https://api.github.com/repos/PRiME-2019/growthlens/actions/workflows/publish-resources.yml/dispatches",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("GITHUB_PAT")}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "growthlens-admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main" }),
    },
  );
  if (r.status !== 204) {
    const detail = await r.text();
    return json({ error: `GitHub dispatch failed (${r.status})`, detail }, 502);
  }
  return json({ ok: true });
});
