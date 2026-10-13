import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import test from "node:test";
import { sameBytes } from "./transfer-integrity.mjs";

test("transfer requires exactly identical relative files and bytes", () => {
  const root = mkdtempSync(join(tmpdir(), "tracedora-transfer-test-"));
  const left = join(root, "left");
  const right = join(root, "right");
  try {
    mkdirSync(left);
    mkdirSync(right);
    writeFileSync(join(left, "index.html"), "approved");
    writeFileSync(join(right, "index.html"), "approved");
    assert.doesNotThrow(() => sameBytes(left, right));
    writeFileSync(join(right, "index.html"), "altered");
    assert.throws(() => sameBytes(left, right), /Transferred bytes differ/);
    writeFileSync(join(right, "index.html"), "approved");
    writeFileSync(join(right, "extra.txt"), "unaudited");
    assert.throws(() => sameBytes(left, right), /Transferred file inventory differs/);
  } finally {
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep)) throw new Error("Unsafe test cleanup path");
    rmSync(root, {recursive: true, force: true});
  }
});
