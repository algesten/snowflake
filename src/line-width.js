const core = require('@actions/core');
const glob = require('@actions/glob');
const fs = require('fs').promises;
const minimatch = require('minimatch');

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
    const globber = await glob.create(`${rootDir}/**/*`, { followSymbolicLinks: false });
    const files = await globber.glob();

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
                if (minimatch.minimatch(file, pattern, { matchBase: true })) {
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