#!/usr/bin/env node
// scripts/patch-ledgerhq.js
//
// @ledgerhq/errors@6.x ships an ESM build (lib-es/index.js) that imports
// './helpers' without the mandatory .js extension required by Node.js's
// strict ESM resolver. This causes Next.js static generation to fail with
// ERR_MODULE_NOT_FOUND during `next build`.
//
// This script patches the file in-place after `npm install` so the import
// resolves correctly. It is idempotent and safe to re-run.

const fs = require('fs');
const path = require('path');

const target = path.resolve(
  __dirname,
  '../node_modules/@ledgerhq/errors/lib-es/index.js',
);

if (!fs.existsSync(target)) {
  console.log('[patch-ledgerhq] File not found — skipping patch:', target);
  process.exit(0);
}

let content = fs.readFileSync(target, 'utf8');
const patched = content.replace(/from "\.\/helpers"/g, 'from "./helpers.js"');

if (patched === content) {
  console.log('[patch-ledgerhq] Already patched — nothing to do.');
} else {
  fs.writeFileSync(target, patched, 'utf8');
  console.log('[patch-ledgerhq] Patched @ledgerhq/errors/lib-es/index.js ✓');
}
