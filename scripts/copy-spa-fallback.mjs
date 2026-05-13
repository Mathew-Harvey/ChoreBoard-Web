import { copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const dist = resolve('dist');
await copyFile(resolve(dist, 'index.html'), resolve(dist, '404.html'));
console.log('Copied dist/index.html to dist/404.html for SPA deep-link fallback.');
