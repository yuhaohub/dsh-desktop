/**
 * Pure helpers for the lightweight in-app update check.
 *
 * No Electron dependency — plain CommonJS, usable from main.js and from
 * plain-node test scripts.
 */

const GITHUB_REPO = 'yuhaohub/dsh-desktop';

function parseVersion(v) {
  return String(v || '')
    .replace(/^v/i, '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
}

/** -1 if a < b, 0 if equal, 1 if a > b (semver-ish, up to 3 parts). */
function compareVersions(a, b) {
  const A = parseVersion(a);
  const B = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if ((A[i] || 0) !== (B[i] || 0)) return (A[i] || 0) > (B[i] || 0) ? 1 : -1;
  }
  return 0;
}

/** URL of the latest-release API endpoint for the repo. */
function latestReleaseUrl(repo = GITHUB_REPO) {
  return `https://api.github.com/repos/${repo}/releases/latest`;
}

/**
 * Find the zip asset matching an arch ("arm64" | "x64") inside a GitHub
 * release JSON object. Returns { name, url } or null.
 */
function findArchAsset(releaseJson, arch) {
  const assets = (releaseJson && releaseJson.assets) || [];
  const wanted = `-${arch}.zip`;
  const hit = assets.find(
    (a) => typeof a.browser_download_url === 'string' && a.browser_download_url.endsWith(wanted),
  );
  if (hit) return { name: hit.name, url: hit.browser_download_url };
  return null;
}

module.exports = { GITHUB_REPO, compareVersions, parseVersion, latestReleaseUrl, findArchAsset };
