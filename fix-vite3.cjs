const fs = require('fs');
let content = fs.readFileSync('C:/Users/28409/Desktop/claude-visual-client/claude-visual-client/claude-code-pro/vite.config.ts', 'utf8');

// Find and replace the codemirror array
const codemirrorRegex = /'codemirror':\s*\[[\s\S]*?\],/;
const newCode = `'codemirror': [
            '@codemirror/autocomplete',
            '@codemirror/commands',
            '@codemirror/language',
            '@codemirror/lint',
            '@codemirror/search',
            '@codemirror/state',
            '@codemirror/view',
            '@codemirror/lang-javascript',
            '@codemirror/lang-json',
            '@codemirror/lang-python',
            '@codemirror/lang-html',
            '@codemirror/lang-css',
            '@codemirror/lang-markdown',
          ],`;

content = content.replace(codemirrorRegex, newCode);

fs.writeFileSync('C:/Users/28409/Desktop/claude-visual-client/claude-visual-client/claude-code-pro/vite.config.ts', content);
console.log('Done');
