import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const example = path.join(root, '.env.example');
const local = path.join(root, '.env.local');

if (fs.existsSync(local)) {
  console.log('.env.local already exists — not overwriting.');
  process.exit(0);
}
if (!fs.existsSync(example)) {
  console.error('Missing .env.example');
  process.exit(1);
}
fs.copyFileSync(example, local);
console.log('Created .env.local from .env.example');
console.log('Next: edit .env.local with Slack + KV values, then run: npm run env:pull (if using Vercel)');
