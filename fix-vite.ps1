$content = Get-Content "C:/Users/28409/Desktop/claude-visual-client/claude-visual-client/claude-code-pro/vite.config.ts" -Raw
$content = $content -replace "'@codemirror/lang-rust',", ""
$content = $content -replace "'@codemirror/lang-java',", ""
$content = $content -replace "            \r?\n            '@codemirror/lang-json',", "`r`n            '@codemirror/lang-json',"
$content = $content -replace "            \r?\n            '@codemirror/lang-html',", "`r`n            '@codemirror/lang-html',"
$content = $content -replace "'@codemirror/lang-css',\r?\n          \],", "'@codemirror/lang-css',`r`n            '@codemirror/lang-markdown',`r`n          ],"
$content = $content -replace "`r`n`r`n", "`r`n"
Set-Content "C:/Users/28409/Desktop/claude-visual-client/claude-visual-client/claude-code-pro/vite.config.ts" -Value $content -NoNewline
