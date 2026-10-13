import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { files, sameBytes } from "./transfer-integrity.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const site = join(repo, "site");
const candidate = resolve(process.argv[2] ?? "");
const source = "f2e4deafbe73899413428e19519fcd5f37a34006";
const safeGit = ["-c", `safe.directory=${repo.replaceAll("\\", "/")}`];
const git = args => execFileSync("git", [...safeGit, ...args], {cwd: repo, encoding: "utf8"}).trim();
const verify = root => execFileSync(process.execPath, [join(repo, "scripts", "verify-publication.mjs"), root], {cwd: repo, encoding: "utf8"}).trim();
const inside = (root, path) => path === root || path.startsWith(root + sep);
const remove = path => {
  if (!inside(repo, path) && !inside(resolve(tmpdir()), path)) throw new Error("Unsafe cleanup target");
  rmSync(path, {recursive: true, force: true});
};
if (process.argv.length !== 3 || candidate === site || inside(repo, candidate) || !existsSync(candidate)) throw new Error("Provide an external audited output directory");
if (git(["status", "--porcelain"]) !== "") throw new Error("Public repository must be clean before transfer");
if (git(["rev-parse", "HEAD"]) !== git(["rev-parse", "origin/main"])) throw new Error("Public repository is not at origin/main");
const manifest = JSON.parse(readFileSync(join(candidate, "publication-manifest.json"), "utf8"));
if (manifest.source_commit !== source || manifest.live_demo_url !== null) throw new Error("Candidate source or live URL is not approved");
verify(candidate);
const temporary = mkdtempSync(join(tmpdir(), "tracedora-publish-"));
const staged = join(temporary, "staged");
const backup = join(temporary, "backup");
try {
  cpSync(candidate, staged, {recursive: true, errorOnExist: true, force: false});
  sameBytes(candidate, staged);
  verify(staged);
  cpSync(site, backup, {recursive: true, errorOnExist: true, force: false});
  remove(site);
  try {
    cpSync(staged, site, {recursive: true, errorOnExist: true, force: false});
    sameBytes(staged, site);
    verify(site);
  } catch (error) {
    remove(site);
    cpSync(backup, site, {recursive: true, errorOnExist: true, force: false});
    sameBytes(backup, site);
    throw error;
  }
  console.log(`Staged ${files(site).length} byte-identical approved files from ${source}; review and commit site/ only.`);
} finally {
  remove(temporary);
}
