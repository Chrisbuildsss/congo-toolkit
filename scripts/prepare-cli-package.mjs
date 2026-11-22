// One implementation: copy the same CLI modules used by /guides/downloads.
import {chmod, mkdir, readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {CLI_VERSION} from './congo.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const target = path.join(root, 'packages/cli');
const pkg = JSON.parse(await readFile(path.join(target, 'package.json'), 'utf8'));
if (pkg.version !== CLI_VERSION) throw Error('CLI_VERSION and packages/cli/package.json version must match');
await mkdir(path.join(target, 'dist'), {recursive: true});
for (const name of ['congo.mjs', 'congo-version-range.mjs', 'congo-workspace.mjs', 'congo-skills.mjs']) {
  await writeFile(path.join(target, 'dist', name), await readFile(path.join(root, 'scripts', name)));
}
// The workspace interface ships prebuilt; the skills ship as Markdown from packages/cli/skills.
const {buildWorkspaceUi} = await import('./build-cli-workspace.mjs');
const ui = await buildWorkspaceUi(path.join(target, 'dist', 'workspace-ui'));
await chmod(path.join(target, 'bin/congo.mjs'), 0o755);
console.log(`Prepared Congo installer ${pkg.version} with the workspace (${ui.bytes} bytes) and skills; no catalog source included.`);
