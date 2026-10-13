import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";

const root = resolve(process.argv[2] ?? "site");
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)])) : value;
const approvedSources = new Set(["f2e4deafbe73899413428e19519fcd5f37a34006", "395dfdd2773fabad9925e8872c2dc52b41ff403b"]);
const approvedRecordCounts = {appetite_boundaries: 1, appetite_statements: 1, appetite_versions: 2, applications: 12, capabilities: 12, "information-assets": 1, locations: 2, organisations: 1, people: 1, portfolio_members: 2, portfolios: 1, processes: 26, risk_scenarios: 1, services: 1, "third-parties": 1, traceability_findings: 6, treatments: 1};
const approvedRouteCounts = {appetite_details: 1, appetite_index: 1, dependency_explorers: 56, governance_details: 56, governance_directories: 8, governance_index: 1, home: 1, not_found: 1, portfolio_details: 1, portfolio_index: 1, risk_details: 1, risk_index: 1, search: 1, traceability_details: 6};
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const exactValues = (value, approved) => exactKeys(value, Object.keys(approved)) && Object.entries(approved).every(([key, expected]) => value[key] === expected);
const publication = JSON.parse(readFileSync(join(root, "publication-manifest.json"), "utf8"));
if (!exactKeys(publication, ["schema_version", "source_repository", "source_commit", "synthetic_content_digest", "live_demo_url", "files"])) throw new Error("Unexpected publication manifest fields");
const liveUrl = publication.live_demo_url ?? null;
if (liveUrl !== null && (typeof liveUrl !== "string" || !/^https:\/\/[a-z0-9]([-a-z0-9]*[a-z0-9])?\.[a-z0-9]([-a-z0-9]*[a-z0-9])?\.ts\.net\/$/.test(liveUrl))) throw new Error("Unapproved live URL");
const snapshot = JSON.parse(readFileSync(join(root, "snapshot-manifest.json"), "utf8"));
if (!exactKeys(snapshot, ["content_digest", "files", "generated_at", "migration", "organisation_id", "record_counts", "route_counts", "schema_version", "source_commit", "synthetic_dataset_id"]) || !exactKeys(snapshot.files, ["snapshot.json"])) throw new Error("Unexpected snapshot manifest fields");
const deterministic = {...snapshot};
delete deterministic.generated_at;
delete deterministic.content_digest;
if (publication.schema_version !== 1 || publication.source_repository !== "Selvynallotey/TraceDora-source" || !approvedSources.has(publication.source_commit) || publication.synthetic_content_digest !== snapshot.content_digest || !publication.files || typeof publication.files !== "object" || Array.isArray(publication.files) || !Object.keys(publication.files).every(label => /^[a-f0-9]{64}$/.test(publication.files[label]))) throw new Error("Publication identity mismatch");
if (snapshot.schema_version !== 3 || snapshot.source_commit !== publication.source_commit || snapshot.migration !== "6f2a9c4d8e10" || snapshot.organisation_id !== "15000000-0000-4000-8000-000000000001" || snapshot.synthetic_dataset_id !== "tracedora-synthetic-v1" || snapshot.content_digest !== digest(`${JSON.stringify(canonical(deterministic))}\n`) || !/^[a-f0-9]{64}$/.test(snapshot.files["snapshot.json"])) throw new Error("Synthetic snapshot manifest is invalid");
if (!exactValues(snapshot.record_counts, approvedRecordCounts) || !exactValues(snapshot.route_counts, approvedRouteCounts)) throw new Error("Synthetic publication inventory is incomplete");
const gitOptions = ["-c", `safe.directory=${process.cwd().replaceAll("\\", "/")}`];
const stagedSite = root === resolve("site") && execFileSync("git", [...gitOptions, "status", "--porcelain", "--", "site"], {encoding: "utf8"}).trim() !== "";
if (root === resolve("site") && !stagedSite) {
  const handoff = execFileSync("git", [...gitOptions, "log", "-1", "--format=%B", "--", "site/publication-manifest.json"], {encoding: "utf8"}).trim();
  const expected = publication.source_commit === "f2e4deafbe73899413428e19519fcd5f37a34006"
    ? `Publish approved synthetic showcase from ${publication.source_commit}`
    : `chore: publish accessible mobile risk dashboard\n\nSource-Commit: ${publication.source_commit}`;
  if (handoff !== expected) throw new Error("Public artifact does not match approved private handoff");
}
for (const route of ["index.html", "404.html", "current-risk/index.html", "current-risk/c0cc6aa3-d5e5-5049-9529-f6b7b63bebba/index.html", "risk-portfolios/index.html", "risk-portfolios/ceb8e346-41e2-5576-845b-fb249b2bfa13/index.html", "organisation/index.html", "organisation/processes/index.html", "organisation/applications/index.html", "organisation/information-assets/index.html", "organisation/risk-appetite/index.html", "search/index.html"]) if (!existsSync(join(root, route))) throw new Error(`Missing required route: ${route}`);
const allowed = new Set([".html", ".js", ".css", ".json", ".txt", ".svg", ".png", ".ico", ".woff", ".woff2"]);
const forbidden = [/postgresql\+psycopg:/i, /tracedora_demo_(admin|reader)/i, /\/api\/v1\//i, /data\/source\/Dataset\.xlsx/i, /BEGIN (?:RSA |EC )?PRIVATE KEY/i, /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|(?:10|192\.168)\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(?::\d+)?(?:\/|["'`]|$)/i, /<form\b(?![^>]*class="global-search")/i, /<button\b[^>]*>\s*(?:Create|Save|Delete|Publish|Approve|Transition)\b/i];
const unapprovedAnalytical = /Supported estimate available|Supported analytical result recorded|Supported subset \d+|(?:EUR|USD|GBP)\s+\d+(?:[.,]\d+)?|[€£]\s*\d/i;
const seen = new Set();
function scan(folder) {
  for (const name of readdirSync(folder)) {
    const path = join(folder, name);
    if (lstatSync(path).isSymbolicLink()) throw new Error(`Symbolic link: ${path}`);
    if (lstatSync(path).isDirectory()) { scan(path); continue; }
    const label = relative(root, path).split(sep).join("/");
    if (label !== "publication-manifest.json") {
      if (extname(name) === ".json" && label !== "snapshot-manifest.json") throw new Error(`Unexpected public JSON file: ${label}`);
      if (!allowed.has(extname(name)) || /(?:^|\/)(?:\.env|credentials?|secrets?|logs?|research|Dataset)(?:[./]|$)/i.test(label)) throw new Error(`Forbidden file: ${label}`);
      const bytes = readFileSync(path);
      if (publication.files[label] !== digest(bytes)) throw new Error(`Hash mismatch: ${label}`);
      const content = bytes.toString("utf8");
      if (forbidden.some(pattern => pattern.test(content))) throw new Error(`Forbidden content: ${label}`);
      if (/\.(?:html|txt)$/.test(label) && unapprovedAnalytical.test(content)) throw new Error(`Unapproved analytical outcome: ${label}`);
      if (extname(name) === ".html") for (const [, href] of content.matchAll(/href="([^"]+)"/g)) {
        if (!href.startsWith("/TraceDora/")) continue;
        const route = decodeURIComponent(new URL(href, "https://example.invalid").pathname.slice("/TraceDora/".length));
        const destination = resolve(root, route);
        if (destination !== root && !destination.startsWith(root + sep)) throw new Error(`Link escapes approved site: ${href}`);
        const target = existsSync(destination) && statSync(destination).isDirectory() ? join(destination, "index.html") : destination;
        if (!existsSync(target)) throw new Error(`Broken link in ${label}: ${href}`);
      }
    }
    seen.add(label);
  }
}
scan(root);
if (Object.keys(publication.files).length !== seen.size - 1 || seen.size < 30 || !seen.has("404.html") || !seen.has("index.html") || !seen.has("snapshot-manifest.json")) throw new Error("Publication file set is incomplete");
const home = readFileSync(join(root, "index.html"), "utf8");
if (liveUrl ? !home.includes(`href="${liveUrl}"`) || !home.includes("Open Live Demo") : !home.includes("Live demo unavailable")) throw new Error("Live entry does not match publication attestation");
console.log(`Verified ${seen.size} public files from ${publication.source_commit}`);
