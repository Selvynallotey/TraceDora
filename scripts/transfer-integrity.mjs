import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export function files(root) {
  const result = [];
  const walk = folder => {
    for (const name of readdirSync(folder)) {
      const path = join(folder, name);
      if (statSync(path).isDirectory()) walk(path);
      else result.push(relative(root, path).split(sep).join("/"));
    }
  };
  walk(root);
  return result.sort();
}

export function sameBytes(left, right) {
  const labels = files(left);
  if (JSON.stringify(labels) !== JSON.stringify(files(right))) throw new Error("Transferred file inventory differs");
  for (const label of labels) if (!readFileSync(join(left, label)).equals(readFileSync(join(right, label)))) throw new Error(`Transferred bytes differ: ${label}`);
}
