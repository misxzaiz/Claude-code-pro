const fs = require('fs');
let content = fs.readFileSync('vite.config.ts', 'utf8');
content = content.replace(/'@codemirror\/lang-rust',\s*\n/g, '');
content = content.replace(/'@codemirror\/lang-java',\s*\n/g, '');
// Remove extra blank lines
content = content.replace(/\n\n\n+/g, '\n\n');
// Add lang-markdown if not present
if (!content.includes("'@codemirror/lang-markdown'")) {
    content = content.replace(
        "'@codemirror/lang-css',\n          ],",
        "'@codemirror/lang-css',\n            '@codemirror/lang-markdown',\n          ],"
    );
}
fs.writeFileSync('vite.config.ts', content);
console.log('Done');
