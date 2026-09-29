// Rebuild the Training Hub page: embeds shots/*.jpg into template.html → training-hub.html.
// Then publish training-hub.html to https://claude.ai/artifact/AbrNrnppYs6PXa7WujzRfk (same URL).
const fs = require('fs'), path = require('path');
const dir = __dirname;
let h = fs.readFileSync(path.join(dir, 'template.html'), 'utf8');
h = h.replace(/\{\{img:([a-z0-9-]+)\}\}/g, (m, n) => 'data:image/jpeg;base64,' + fs.readFileSync(path.join(dir, 'shots', n + '.jpg')).toString('base64'));
fs.writeFileSync(path.join(dir, 'training-hub.html'), h);
console.log('built', h.length, 'bytes');
