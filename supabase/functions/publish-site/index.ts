import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://testpontifexx.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const validColor = (s: unknown) => typeof s === "string" && /^#[0-9a-fA-F]{6}$/.test(s);
function validate(body: any) {
  if (!body || !Array.isArray(body.links) || body.links.length > 30) throw new Error("Ongeldige links.");
  for (const link of body.links) {
    if (!link || typeof link.label !== "string" || !link.label.trim() || link.label.length > 100 ||
        typeof link.url !== "string" || link.url.length > 2048 ||
        !/^(https:\/\/|http:\/\/|mailto:)/i.test(link.url) ||
        typeof link.enabled !== "boolean") throw new Error("Een link bevat ongeldige velden.");
    if (link.accessibleLabel !== undefined && (typeof link.accessibleLabel !== "string" || link.accessibleLabel.length > 200)) throw new Error("Ongeldig toegankelijk label.");
    if (link.icon !== undefined && (typeof link.icon !== "string" || link.icon.length > 30)) throw new Error("Ongeldig icoon.");
  }
  const c = body.content;
  if (!c || ["title","welcome","description","closing","footer"].some(k => typeof c[k] !== "string" || c[k].length > 3000)) throw new Error("Ongeldige pagina-inhoud.");
  const d = body.design;
  if (!d || !validColor(d.navy) || !validColor(d.pale) || !validColor(d.peach)) throw new Error("Ongeldige kleuren.");
}
async function githubFile(path: string, token: string, ownerRepo: string, branch: string) {
  const url = `https://api.github.com/repos/${ownerRepo}/contents/${path}?ref=${encodeURIComponent(branch)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" } });
  if (!r.ok) throw new Error(`GitHub kon ${path} niet lezen (HTTP ${r.status}).`);
  return await r.json();
}
async function putFile(path: string, content: string, token: string, ownerRepo: string, branch: string, message: string) {
  const old = await githubFile(path, token, ownerRepo, branch);
  const bytes = new TextEncoder().encode(content);
  let binary = ""; for (const b of bytes) binary += String.fromCharCode(b);
  const r = await fetch(`https://api.github.com/repos/${ownerRepo}/contents/${path}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" },
    body: JSON.stringify({ message, content: btoa(binary), sha: old.sha, branch }),
  });
  const result = await r.json();
  if (!r.ok) throw new Error(`GitHub kon ${path} niet bijwerken (HTTP ${r.status}).`);
  return result.commit?.sha as string | undefined;
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Methode niet toegestaan." }, 405);
  const origin = req.headers.get("origin");
  if (origin && origin !== "https://testpontifexx.github.io") return json({ error: "Origin niet toegestaan." }, 403);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    const adminEmail = Deno.env.get("ADMIN_EMAIL")?.trim().toLowerCase();
    const token = Deno.env.get("GITHUB_TOKEN");
    const ownerRepo = Deno.env.get("GITHUB_REPO") ?? "TestPontifexx/pontifexx-links";
    const branch = Deno.env.get("GITHUB_BRANCH") ?? "main";
    if (!url || !anon || !adminEmail || !token) return json({ error: "Serverconfiguratie ontbreekt. Publiceren is uitgeschakeld." }, 503);
    const auth = req.headers.get("authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Inloggen vereist." }, 401);
    const supabase = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: auth } } });
    const { data, error } = await supabase.auth.getUser(auth.slice(7));
    if (error || !data.user?.email || data.user.email.toLowerCase() !== adminEmail || !data.user.email_confirmed_at) return json({ error: "Niet geautoriseerd. Alleen het bevestigde beheerdersaccount mag publiceren." }, 403);
    const body = await req.json();
    validate(body);
    const links = body.links.map((l: any) => ({ label: l.label.trim(), accessibleLabel: (l.accessibleLabel || l.label).trim(), icon: l.icon || "globe", url: l.url.trim(), enabled: l.enabled }));
    const content = { title: body.content.title, welcome: body.content.welcome, description: body.content.description, closing: body.content.closing, footer: body.content.footer };
    const htmlFile = await githubFile("index.html", token, ownerRepo, branch);
    const rawHtml = atob(htmlFile.content.replace(/\n/g, ""));
    const decoded = new TextDecoder().decode(Uint8Array.from(rawHtml, c => c.charCodeAt(0)));
    let updatedHtml = decoded;
    const replacements: [RegExp, string][] = [
      [/--navy:\s*#[0-9a-fA-F]{6}/, `--navy: ${body.design.navy}`],
      [/--blue-pale:\s*#[0-9a-fA-F]{6}/, `--blue-pale: ${body.design.pale}`],
      [/--peach:\s*#[0-9a-fA-F]{6}/, `--peach: ${body.design.peach}`],
    ];
    for (const [pattern, value] of replacements) {
      if (!pattern.test(updatedHtml)) throw new Error("De verwachte stijlvariabele ontbreekt; er is niets gepubliceerd.");
      updatedHtml = updatedHtml.replace(pattern, value);
    }
    // Validate all inputs before writing. GitHub's contents API commits each file separately.
    const commits: string[] = [];
    const commit1 = await putFile("data/links.json", JSON.stringify(links, null, 2) + "\n", token, ownerRepo, branch, "Update Pontifexx links via admin");
    if (commit1) commits.push(commit1);
    const commit2 = await putFile("data/content.json", JSON.stringify(content, null, 2) + "\n", token, ownerRepo, branch, "Update Pontifexx page text via admin");
    if (commit2) commits.push(commit2);
    const commit3 = await putFile("index.html", updatedHtml, token, ownerRepo, branch, "Update Pontifexx theme via admin");
    if (commit3) commits.push(commit3);
    return json({ ok: true, commit: commits.at(-1), commits });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Onverwachte fout." }, 400);
  }
});
