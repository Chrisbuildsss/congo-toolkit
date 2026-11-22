#!/usr/bin/env node
import {main} from '../dist/congo.mjs';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 20)) {
  console.error('Congo requires Node.js 22.20.0 or later.');
  process.exitCode = 1;
} else {
  await main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
