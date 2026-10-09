import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";

const root = resolve(process.argv[2] ?? "site");
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)])) : value;
const publication = JSON.parse(readFileSync(join(root, "publication-manifest.json"), "utf8"));
const snapshot = JSON.parse(readFileSync(join(root, "snapshot-manifest.json"), "utf8"));
const deterministic = {...snapshot};
delete deterministic.generated_at;
delete deterministic.content_digest;
if (publication.schema_version !== 1 || publication.source_repository !== "Selvynallotey/TraceDora-source" || !/^[a-f0-9]{40}$/.test(publication.source_commit) || publication.synthetic_content_digest !== snapshot.content_digest) throw new Error("Publication identity mismatch");
if (snapshot.schema_version !== 2 || snapshot.source_commit !== "332fb36227604e970f8b33bc9b245a6ca2bf5a65" || snapshot.migration !== "6f2a9c4d8e10" || snapshot.organisation_id !== "15000000-0000-4000-8000-000000000001" || !snapshot.synthetic_dataset_id?.startsWith("tracedora-synthetic-") || snapshot.content_digest !== digest(`${JSON.stringify(canonical(deterministic))}\n`)) throw new Error("Synthetic snapshot manifest is invalid");
if (snapshot.record_counts.organisations !== 1 || snapshot.route_counts.governance_directories !== 8 || snapshot.route_counts.not_found !== 1) throw new Error("Synthetic publication is incomplete");
const allowed = new Set([".html", ".js", ".css", ".json", ".txt", ".svg", ".png", ".ico", ".woff", ".woff2"]);
const forbidden = [/postgresql\+psycopg:/i, /tracedora_demo_(admin|reader)/i, /\/api\/v1\//i, /data\/source\/Dataset\.xlsx/i, /BEGIN (?:RSA |EC )?PRIVATE KEY/i, /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|(?:10|192\.168)\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(?::\d+)?(?:\/|["'`]|$)/i, /<form\b(?![^>]*class="global-search")/i, /<button\b[^>]*>\s*(?:Create|Save|Delete|Publish|Approve|Transition)\b/i];
const seen = new Set();
function scan(folder) {
  for (const name of readdirSync(folder)) {
    const path = join(folder, name);
    if (lstatSync(path).isSymbolicLink()) throw new Error(`Symbolic link: ${path}`);
    if (lstatSync(path).isDirectory()) { scan(path); continue; }
    const label = relative(root, path).split(sep).join("/");
    if (label !== "publication-manifest.json") {
      if (!allowed.has(extname(name)) || /(?:^|\/)(?:\.env|credentials?|secrets?|logs?|research|Dataset)(?:[./]|$)/i.test(label)) throw new Error(`Forbidden file: ${label}`);
      const bytes = readFileSync(path);
      if (publication.files[label] !== digest(bytes)) throw new Error(`Hash mismatch: ${label}`);
      const content = bytes.toString("utf8");
      if (forbidden.some(pattern => pattern.test(content))) throw new Error(`Forbidden content: ${label}`);
      if (extname(name) === ".html") for (const [, href] of content.matchAll(/href="([^"]+)"/g)) {
        if (!href.startsWith("/TraceDora/")) continue;
        const route = decodeURIComponent(new URL(href, "https://example.invalid").pathname.slice("/TraceDora/".length));
        const destination = join(root, route);
        const target = existsSync(destination) && statSync(destination).isDirectory() ? join(destination, "index.html") : destination;
        if (!existsSync(target)) throw new Error(`Broken link in ${label}: ${href}`);
      }
    }
    seen.add(label);
  }
}
scan(root);
if (Object.keys(publication.files).length !== seen.size - 1 || seen.size < 30 || !seen.has("404.html") || !seen.has("index.html") || !seen.has("snapshot-manifest.json")) throw new Error("Publication file set is incomplete");
if (!readFileSync(join(root, "index.html"), "utf8").includes("Live demo unavailable")) throw new Error("Live entry must remain unavailable");
console.log(`Verified ${seen.size} public files from ${publication.source_commit}`);
