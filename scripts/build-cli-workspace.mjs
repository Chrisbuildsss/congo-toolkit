// Builds the gocongo workspace interface (packages/cli/workspace-ui) into packages/cli/dist/workspace-ui: one HTML
// page, one script, one stylesheet and the fonts, using the toolkit’s locked build dependencies.
// The npm package ships the result; `gocongo workspace` serves it on this computer.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const modules = path.join(root, 'node_modules'), require = createRequire(path.join(root, 'package.json'));
function local(name, from = require) {
  const file = from.resolve(name + '/package.json');
  if (!path.resolve(file).startsWith(modules + path.sep)) throw Error(name + ' must be installed in the toolkit (run `npm ci`); found ' + file);
  return path.dirname(file);
}
const esbuild = require(local('esbuild')), react = local('react'), reactDom = local('react-dom'), scheduler = local('scheduler', createRequire(path.join(reactDom, 'package.json')));
const source = path.join(root, 'packages/cli/workspace-ui'), out = path.join(root, 'packages/cli/dist/workspace-ui');

export async function buildWorkspaceUi(target = out) {
  await fs.rm(target, {recursive: true, force: true});
  await fs.mkdir(path.join(target, 'assets'), {recursive: true});
  const result = await esbuild.build({
    entryPoints: {app: path.join(source, 'src/main.tsx')}, bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, jsx: 'automatic',
    alias: {react, 'react-dom': reactDom, scheduler}, define: {'process.env.NODE_ENV': '"production"'},
    loader: {'.woff2': 'file', '.woff': 'file', '.png': 'file', '.svg': 'file'}, assetNames: '[name]-[hash]', entryNames: '[name]-[hash]',
    absWorkingDir: root, outdir: path.join(target, 'assets'), publicPath: '/assets', metafile: true, legalComments: 'linked', logLevel: 'warning',
  });
  const outputs = Object.keys(result.metafile.outputs).map(file => path.relative(path.join(target, 'assets'), path.resolve(root, file)).split(path.sep).join('/'));
  const script = outputs.find(file => /^app-.*\.js$/.test(file)), style = outputs.find(file => /^app-.*\.css$/.test(file));
  if (!script || !style) throw Error('The workspace build made no script or stylesheet');
  const html = (await fs.readFile(path.join(source, 'index.html'), 'utf8'))
    .replace('<script type="module" src="/src/main.tsx"></script>', `<link rel="stylesheet" href="/assets/${style}" />\n    <script type="module" src="/assets/${script}"></script>`);
  if (!html.includes(script)) throw Error('index.html no longer has the entry script line');
  await fs.writeFile(path.join(target, 'index.html'), html);
  await fs.cp(path.join(source, 'notices'), path.join(target, 'notices'), {recursive: true});
  let bytes = 0;
  for (const file of outputs) bytes += (await fs.stat(path.join(target, 'assets', file))).size;
  return {out: path.relative(root, target), files: outputs.length + 1, bytes};
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) console.log(JSON.stringify(await buildWorkspaceUi(process.argv[2] ? path.resolve(process.argv[2]) : out)));
