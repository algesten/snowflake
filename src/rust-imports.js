const fs = require('fs').promises;
const path = require('path');
const { core, globFiles } = require('./utils');

// Check Rust import style
async function checkRustImports(rootPath = '.', prChanges = null) {
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

    // If PR changes are provided, filter files to only include changed Rust files
    if (prChanges) {
        const changedRustFiles = Object.keys(prChanges).filter(file => file.endsWith('.rs'));
        files = files.filter(file => {
            // Convert to relative path to match prChanges format
            const relativePath = path.relative(rootPath, file);
            return changedRustFiles.some(changedPath =>
                relativePath === changedPath || relativePath.endsWith(changedPath));
        });
    }

    for (const file of files) {
        try {
            const content = await fs.readFile(file, 'utf8');
            const lines = content.split('\n');

            // Get the relative path to match prChanges format
            const relativePath = path.relative(rootPath, file);

            let inMultilineUse = false;
            let useStartLine = -1;
            let useContent = [];

            // Only check use statements where at least one line was modified in the PR
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                const lineNumber = i + 1;

                // Start of a use statement
                if (line.startsWith('use ') && line.includes('{') && !line.includes('}')) {
                    inMultilineUse = true;
                    useStartLine = lineNumber;
                    useContent = [line];
                }
                // Continuation of a multiline use
                else if (inMultilineUse) {
                    useContent.push(line);

                    // End of the multiline use statement
                    if (line.includes('}')) {
                        // Check if any lines in this use statement were modified
                        let shouldCheck = !prChanges; // Check all if no PR changes provided

                        if (prChanges && prChanges[relativePath]) {
                            // Check if any line in this block was modified
                            for (let j = useStartLine; j <= lineNumber; j++) {
                                if (prChanges[relativePath].additions.includes(j)) {
                                    shouldCheck = true;
                                    break;
                                }
                            }
                        }

                        if (shouldCheck) {
                            violations.push({
                                file,
                                lineStart: useStartLine,
                                lineEnd: lineNumber,
                                content: useContent.join('\n')
                            });
                            success = false;
                        }

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