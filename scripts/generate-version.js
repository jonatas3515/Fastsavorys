const fs = require('fs');
const path = require('path');

// Gera novo timestamp
const version = Date.now();

// Cria o arquivo version.js
const content = `// Auto-generated version file - DO NOT EDIT MANUALLY
window.APP_VERSION = ${version};
console.log('[VERSION] App version:', window.APP_VERSION);
`;

const outputPath = path.join(__dirname, '..', 'assets', 'js', 'version.js');
fs.writeFileSync(outputPath, content, 'utf8');

console.log(`✅ Version file generated: ${version}`);
