import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const approved = join(repo, "site");
const verifier = join(repo, "scripts", "verify-publication.mjs");
const hash = value => createHash("sha256").update(value).digest("hex");
const read = (root, name) => JSON.parse(readFileSync(join(root, name), "utf8"));
const write = (root, name, value) => writeFileSync(join(root, name), JSON.stringify(value) + "\n");
const run = root => spawnSync(process.execPath, [verifier, root], {cwd: repo, encoding: "utf8"});

function fixture() {
  const parent = mkdtempSync(join(tmpdir(), "tracedora-public-verify-"));
  const root = join(parent, "site");
  cpSync(approved, root, {recursive: true});
  return {parent, root};
}

function cleanup(parent) {
  const absolute = resolve(parent);
  if (!absolute.startsWith(resolve(tmpdir()) + sep) || !absolute.includes("tracedora-public-verify-")) throw new Error("Unsafe temporary cleanup path");
  rmSync(absolute, {recursive: true, force: true});
}

function rehash(root, label) {
  const publication = read(root, "publication-manifest.json");
  publication.files[label] = hash(readFileSync(join(root, label)));
  write(root, "publication-manifest.json", publication);
}

function rejected(name, change, reason) {
  test(name, () => {
    const {parent, root} = fixture();
    try {
      change(root);
      const result = run(root);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, reason);
    } finally {
      cleanup(parent);
    }
  });
}

test("the handed-off schema-3 artifact passes every public gate", () => {
  const result = run(approved);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Verified 700 public files from f2e4deafbe73899413428e19519fcd5f37a34006/);
});

rejected("rejects a schema mismatch", root => {
  const value = read(root, "snapshot-manifest.json");
  value.schema_version = 2;
  write(root, "snapshot-manifest.json", value);
}, /Synthetic snapshot manifest is invalid/);

rejected("rejects a source commit mismatch", root => {
  const publication = read(root, "publication-manifest.json");
  publication.source_commit = "a".repeat(40);
  write(root, "publication-manifest.json", publication);
}, /Publication identity mismatch/);

rejected("rejects an altered manifest digest", root => {
  const value = read(root, "snapshot-manifest.json");
  value.content_digest = "0".repeat(64);
  write(root, "snapshot-manifest.json", value);
  const publication = read(root, "publication-manifest.json");
  publication.synthetic_content_digest = value.content_digest;
  write(root, "publication-manifest.json", publication);
}, /Synthetic snapshot manifest is invalid/);

rejected("rejects modified file content", root => {
  writeFileSync(join(root, "index.html"), readFileSync(join(root, "index.html"), "utf8") + "changed");
}, /Hash mismatch: index.html/);

rejected("rejects unexpected JSON fields", root => {
  const value = read(root, "publication-manifest.json");
  value.private_field = "should not publish";
  write(root, "publication-manifest.json", value);
}, /Unexpected publication manifest fields/);

rejected("rejects an unexpected organisation", root => {
  const value = read(root, "snapshot-manifest.json");
  value.organisation_id = "00000000-0000-0000-0000-000000000000";
  write(root, "snapshot-manifest.json", value);
}, /Synthetic snapshot manifest is invalid/);

for (const [name, content] of [
  ["credentials", "postgresql+psycopg://demo:secret@host/db"],
  ["private network URL", "http://127.0.0.1:18102/api/v1/organisation"],
]) rejected(`rejects forbidden ${name}`, root => {
  writeFileSync(join(root, "index.html"), readFileSync(join(root, "index.html"), "utf8") + content);
  rehash(root, "index.html");
}, /Forbidden content: index.html/);

rejected("rejects missing required routes", root => {
  rmSync(join(root, "current-risk", "index.html"));
}, /Missing required route/);

rejected("rejects broken internal links", root => {
  writeFileSync(join(root, "index.html"), readFileSync(join(root, "index.html"), "utf8") + '<a href="/TraceDora/missing-risk/">Broken</a>');
  rehash(root, "index.html");
}, /Broken link in index.html/);

rejected("rejects unexpected mutation controls", root => {
  writeFileSync(join(root, "index.html"), readFileSync(join(root, "index.html"), "utf8") + "<button>Save</button>");
  rehash(root, "index.html");
}, /Forbidden content: index.html/);

rejected("rejects unapproved analytical outcomes even after rehashing the page", root => {
  const label = "current-risk/c0cc6aa3-d5e5-5049-9529-f6b7b63bebba/index.html";
  writeFileSync(join(root, label), readFileSync(join(root, label), "utf8") + "Supported estimate available: EUR 100");
  rehash(root, label);
}, /Unapproved analytical outcome/);
