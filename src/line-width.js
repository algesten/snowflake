const fs = require('fs').promises;
const path = require('path');
const { core, matchFilePattern, globFiles } = require('./utils');

// Parse line width rules from input string
function parseLineWidthRules(rulesStr) {
    const result = {
        patterns: [],
        default: 110
    };

    const parts = rulesStr.split(';');

    for (const part of parts) {
        if (part.startsWith('DEFAULT=')) {
            result.default = parseInt(part.substring(8), 10);
            continue;
        }

        const [pattern, widthStr] = part.split(':');
        if (pattern && widthStr) {
            const width = parseInt(widthStr, 10);
            if (!isNaN(width)) {
                result.patterns.push({ pattern, width });
            }
        }
    }

    return result;
}

// Check line width for all files
async function checkLineWidth(rules, rootDir = '.') {
    // Find all files in the rootDir using the globFiles utility
    const files = await globFiles('**/*', rootDir);

    const violations = [];
    let success = true;

    for (const file of files) {
        try {
            const stats = await fs.stat(file);
            if (!stats.isFile()) continue;

            // Skip node_modules, .git, etc.
            if (file.includes('node_modules') || file.includes('.git')) continue;

            // Find matching rule
            let maxWidth = rules.default;
            for (const { pattern, width } of rules.patterns) {
                const filename = path.basename(file);
                if (matchFilePattern(filename, pattern)) {
                    maxWidth = width;
                    break;
                }
            }

            const content = await fs.readFile(file, 'utf8');
            const lines = content.split('\n');

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.length > maxWidth) {
                    violations.push({
                        file,
                        line: i + 1,
                        length: line.length,
                        maxWidth,
                        content: line.length > 100 ? `${line.substring(0, 100)}...` : line
                    });
                    success = false;
                }
            }
        } catch (error) {
            core.warning(`Error processing file ${file}: ${error.message}`);
        }
    }

    return {
        success,
        violations,
        summary: `${violations.length} line width violations found`
    };
}

module.exports = {
    parseLineWidthRules,
    checkLineWidth
};