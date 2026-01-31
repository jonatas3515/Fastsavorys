const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../assets/js/admin.js');

try {
    // Read as binary buffer
    const buffer = fs.readFileSync(filePath);

    // Convert to string assuming UTF-8
    let content = buffer.toString('utf8');

    // Fix common double-encoding artifacts if any (simple replacement for the specific case seen)
    // The screenshot showed "âœDi¸" which is likely "âœ…" (pencil) or similar double encoded.
    // However, simply writing back as clean UTF-8 might fix it if it was just a BOM issue interpreted wrongly.
    // Or if PowerShell wrote it as one encoding and we want another.

    // Let's try to just write it back as plain UTF-8 without BOM first.
    // If double encoding happened (UTF-8 bytes interpreted as Latin1 and then saved as UTF-8), we might need to reverse it.

    // Test: check for the corrupted sequence seen in screenshot: 'âœ'
    if (content.includes('âœ')) {
        console.log('Detected corrupted characters. Attempting to fix...');

        // This usually means UTF-8 bytes were interpreted as Windows-1252/Latin-1
        // We can try to "latin1" encode it back to binary, then utf8 decode.
        const fixed = Buffer.from(content, 'binary').toString('utf8');

        // Check if it looks better
        if (!fixed.includes('âœ') && (fixed.includes('✏️') || fixed.includes('✎'))) {
            console.log('Fix successful using binary -> utf8 strategy.');
            content = fixed;
        } else {
            // Maybe it was 'latin1'
            const fixed2 = Buffer.from(content, 'latin1').toString('utf8');
            if (!fixed2.includes('âœ')) {
                console.log('Fix successful using latin1 -> utf8 strategy.');
                content = fixed2;
            }
        }
    }

    fs.writeFileSync(filePath, content, { encoding: 'utf8' });
    console.log('admin.js saved with UTF-8 encoding.');

} catch (e) {
    console.error('Error fixing encoding:', e);
}
