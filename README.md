# TraceDORA public showcase artifacts

This repository contains only the audited synthetic static output under `site/`, a publication verifier, and the GitHub Pages deployment workflow. The application source, synthetic database, authoritative workbook, credentials, logs, and build caches remain in the private source repository or the ephemeral build runner.

The private `TraceDora-source` workflow regenerates the snapshot through the production read API, checks its deterministic digest, builds the static export, audits it, and publishes the approved output using a deploy key scoped to this repository. The Pages workflow verifies file hashes and source identity before uploading only `site/`.
