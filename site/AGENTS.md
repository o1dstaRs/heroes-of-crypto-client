# Marketing site assets

## Shared source of truth

The user has explicitly requested that new site artwork, sprite atlases, animation metadata,
and source materials also be saved to the shared Google Drive. This is the standing destination
for site asset handoff; local working files may remain as development copies.

- Canonical release: [heroesofcrypto / website / homepage-20260922](https://drive.google.com/drive/folders/1pcP4X2Xv_Rwkiuawb9PE1XcTZd1QZjNv).
- Take the approved production images from that Drive release. Its six runtime images, including
  the Play Now button, are WebP. `homepage-source-materials.zip` contains the source artwork,
  earlier variants and generation materials in their original formats; do not deploy that archive.
- `hero-assets.json` pins filenames, destination paths, dimensions and SHA-256 hashes. Import a
  downloaded/synchronized Drive release with `bun run sync:hero -- <release-directory>`, or set
  `HOC_SITE_ASSETS_DIR` to that directory for the build. No machine-specific default path is allowed.
- Files under `public` are versioned deployment exports of this Drive release, not independent
  source artwork. A clean checkout must build using the verified exports without access to a
  developer's computer, home directory, local dev server, or private browser session.
- Production serves the bundled files through the website's `/assets/` URLs. Do not use `file://`,
  localhost URLs, `/Users/...` paths, Drive preview pages, or authenticated Drive links as browser
  image sources. Drive is the build/handoff source; the deployed site serves the resulting assets.
- For subsequent art changes, upload a new Drive release first, verify the upload, update the
  manifest and exports together, then run `bun run check:hero` and `bun run build`.
- Deployment remains an administrator action. Follow `ASSETS.md`; do not deploy merely because
  an asset upload or PR update was requested.
