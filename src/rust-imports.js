const fs = require('fs').promises;
const path = require('path');
const { core, globFiles } = require('./utils');

// Check Rust import style
async function checkRustImports(rootPath = '.') {
    let files = [];
    const violations = [];
    let success = true;

    // Check if rootPath is a directory or a file
    const stats = await fs.stat(rootPath);
    if (stats.isDirectory()) {
        // If directory, get all .rs files
        files = await globFiles('**/*.rs', rootPath);
    } else if (stats.isFile() && rootPath.endsWith('.rs')) {
        // If it's a single Rust file
        files = [rootPath];
    } else {
        // Not a directory or .rs file
        return {
            success: true,
            violations: [],
            summary: 'No Rust files to check'
        };
    }

    for (const file of files) {
        try {
            const content = await fs.readFile(file, 'utf8');
            const lines = content.split('\n');

            let inMultilineUse = false;
            let useStartLine = -1;
            let useContent = [];

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();

                // Start of a use statement
                if (line.startsWith('use ') && line.includes('{') && !line.includes('}')) {
                    inMultilineUse = true;
                    useStartLine = i + 1;
                    useContent = [line];
                }
                // Continuation of a multiline use
                else if (inMultilineUse) {
                    useContent.push(line);

                    // End of the multiline use statement
                    if (line.includes('}')) {
                        violations.push({
                            file,
                            lineStart: useStartLine,
                            lineEnd: i + 1,
                            content: useContent.join('\n')
                        });
                        success = false;
                        inMultilineUse = false;
                    }
                }
            }
        } catch (error) {
            core.warning(`Error processing file ${file}: ${error.message}`);
        }
    }

    return {
        success,
        violations,
        summary: `${violations.length} multi-line use statements found`
    };
}

module.exports = {
    checkRustImports
};