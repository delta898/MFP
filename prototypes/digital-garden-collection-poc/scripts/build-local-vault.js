import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vaultRoot = path.resolve(process.env.GARDEN_VAULT_ROOT || path.resolve(root, '../../vault_example/vault_root'));
const distDir = path.join(root, 'dist/vault-local');
const bundleDir = path.join(root, 'dist/vault-local-bundle');

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)));
  });
}

await mkdir(path.dirname(distDir), { recursive: true });
const env = { ...process.env, GARDEN_VAULT_ROOT: vaultRoot, GARDEN_BUNDLE_DIR: bundleDir };
const conversionStart = performance.now();
await run(process.execPath, ['scripts/convert.js'], env);
const conversionSeconds = (performance.now() - conversionStart) / 1000;

const buildStart = performance.now();
await run(path.join(root, 'node_modules/.bin/astro'), ['build', '--outDir', distDir], {
  ...env,
  GARDEN_BASE_PATH: '/',
});
const buildSeconds = (performance.now() - buildStart) / 1000;
const summary = JSON.parse(await readFile(path.join(bundleDir, 'summary.json'), 'utf8'));
const report = {
  ...summary,
  conversionSeconds: Number(conversionSeconds.toFixed(2)),
  astroBuildSeconds: Number(buildSeconds.toFixed(2)),
  totalLocalBuildSeconds: Number((conversionSeconds + buildSeconds).toFixed(2)),
  deployment: 'not run (local build only)',
  outputDirectory: distDir,
  normalizedBundleDirectory: bundleDir,
};
await writeFile(path.join(distDir, 'poc-summary.json'), `${JSON.stringify(report, null, 2)}\n`);

console.log('\nLOCAL BUILD SUMMARY');
console.log(JSON.stringify(report, null, 2));
console.log(`\nServe the output with: npx http-server ${JSON.stringify(distDir)} -p 4173`);
