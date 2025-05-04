const fs = require('fs').promises;
const path = require('path');
const { execFileSync } = require('child_process');

// ----- GitHub Actions Toolkit replacements -----

// Replacement for @actions/core
const core = {
    getInput: (name) => {
        const key = `INPUT_${name.replace(/ /g, '_').toUpperCase()}`;
        return process.env[key] || '';
    },
    setOutput: (name, value) => {
        // Use the new GITHUB_OUTPUT environment file approach
        const fs = require('fs');
        if (process.env.GITHUB_OUTPUT) {
            fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
        } else {
            // Fallback for local testing or older GitHub Actions runners
            console.log(`::set-output name=${name}::${value}`);
        }
    },
    setFailed: (message) => {
        if (process.env.GITHUB_STEP_SUMMARY) {
            // Use the new approach if running in GitHub Actions
            const fs = require('fs');
            fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Error\n${message}\n`);

            // Also log to console for immediate visibility in logs
            console.error(`::error::${message.split('\n')[0]}`);

            // If the message has multiple lines, log them in a more readable format
            if (message.includes('\n')) {
                console.error('\nDetails:');
                message.split('\n').slice(1).forEach(line => {
                    if (line.trim()) console.error(`  ${line}`);
                });
            }

            process.exit(1);
        } else {
            // Fallback for local testing or older GitHub Actions runners
            console.error(`::error::${message}`);
            process.exit(1);
        }
    },
    warning: (message) => {
        if (process.env.GITHUB_STEP_SUMMARY) {
            // Use the new approach if running in GitHub Actions
            const fs = require('fs');
            fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Warning\n${message}\n`);
        } else {
            // Fallback for local testing or older GitHub Actions runners
            console.warn(`::warning::${message}`);
        }
    }
};

// Get changed files and line numbers in a PR using the event payload
async function getPullRequestChanges() {
    if (!process.env.GITHUB_EVENT_NAME?.includes('pull_request')) {
        return null; // Not a PR event
    }

    try {
        // For PR-only checking, we need to get the base and head commits
        // First, try to get a proper base ref using common GitHub environment variables
        let baseRef;

        try {
            // Try to get the PR base ref directly from the GITHUB_BASE_REF env var
            if (process.env.GITHUB_BASE_REF) {
                // If available, get the SHA of the base ref
                baseRef = execFileSync('git', ['rev-parse', `origin/${process.env.GITHUB_BASE_REF}`], { encoding: 'utf8' }).trim();
            } else {
                // Fallback: try to get it from the merge commit's parents
                baseRef = execFileSync('git', ['show', '--format=%P', '-s', 'HEAD'], { encoding: 'utf8' }).trim().split(' ')[0];
            }

            if (!baseRef) {
                throw new Error('Could not determine base ref');
            }

            // Get the diff between the base and head commits
            const diff = execFileSync('git', ['diff', '--unified=0', baseRef, 'HEAD'], { encoding: 'utf8' });
            return parseDiff(diff);
        } catch (error) {
            // If we failed to get the base ref or the diff, try an alternative approach
            console.warn(`Failed with first approach: ${error.message}`);

            // Alternative approach: get the list of changed files from git
            const filesOutput = execFileSync('git', ['diff', '--name-only', 'HEAD^', 'HEAD'], { encoding: 'utf8' }).trim();
            const changedFiles = filesOutput.split('\n').filter(Boolean);

            // For each file, get its diff
            const changes = {};
            for (const file of changedFiles) {
                try {
                    // Get the diff for this specific file
                    const fileDiff = execFileSync('git', ['diff', '--unified=0', 'HEAD^', 'HEAD', '--', file], { encoding: 'utf8' });
                    const parsedChanges = parseDiff(fileDiff);

                    // Merge the changes into our result
                    Object.assign(changes, parsedChanges);
                } catch (fileError) {
                    console.warn(`Failed to get diff for file ${file}: ${fileError.message}`);
                }
            }

            return Object.keys(changes).length > 0 ? changes : null;
        }
    } catch (finalError) {
        console.warn(`Failed to get PR changes: ${finalError.message}`);
        return null; // Return null on failure
    }
}

// Get changed files and line numbers in a push event
async function getPushChanges() {
    if (!process.env.GITHUB_EVENT_NAME?.includes('push')) {
        return null; // Not a push event
    }

    try {
        // Try multiple strategies to get pushed changes
        try {
            // Strategy 1: Compare the current commit with its parent
            const currentCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
            const parentCommit = execFileSync('git', ['rev-parse', 'HEAD~1'], { encoding: 'utf8' }).trim();

            // Get the diff between the current commit and its parent
            const diff = execFileSync('git', ['diff', '--unified=0', parentCommit, currentCommit], { encoding: 'utf8' });
            return parseDiff(diff);
        } catch (error) {
            console.warn(`Failed with first push detection approach: ${error.message}`);

            // Strategy 2: If we've checked out a shallow clone, or if this is the first commit
            // Get a list of changed files in the most recent commit
            const filesOutput = execFileSync('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'], { encoding: 'utf8' }).trim();
            const changedFiles = filesOutput.split('\n').filter(Boolean);

            if (changedFiles.length === 0) {
                console.warn('No changed files found in the current commit');
                return null;
            }

            // For each file, try to get its diff relative to the previous version
            const changes = {};
            for (const file of changedFiles) {
                try {
                    // Get the change content for this file
                    // We're passing only one commit, so git will show the changes introduced by that commit
                    const fileDiff = execFileSync('git', ['show', '--unified=0', 'HEAD', '--', file], { encoding: 'utf8' });
                    const parsedChanges = parseDiff(fileDiff);

                    // Merge the changes into our result
                    Object.assign(changes, parsedChanges);
                } catch (fileError) {
                    console.warn(`Failed to get diff for file ${file}: ${fileError.message}`);
                }
            }

            return Object.keys(changes).length > 0 ? changes : null;
        }
    } catch (finalError) {
        console.warn(`Failed to get push changes: ${finalError.message}`);
        return null; // Return null on failure
    }
}

// Get changes based on the event type (PR or push)
async function getChanges() {
    if (process.env.GITHUB_EVENT_NAME?.includes('pull_request')) {
        return getPullRequestChanges();
    } else if (process.env.GITHUB_EVENT_NAME?.includes('push')) {
        return getPushChanges();
    }
    return null;
}

// Simple diff parser to extract changed files and line numbers
function parseDiff(diff) {
    const changedFiles = {};

    // Split the diff by file sections
    const fileSections = diff.split(/^diff --git /m).slice(1);

    for (const section of fileSections) {
        // Extract the file path
        const fileMatch = section.match(/^a\/(.+?) b\//m);
        if (!fileMatch) continue;

        const filePath = fileMatch[1];
        changedFiles[filePath] = {
            additions: [],
            deletions: []
        };

        // Extract the hunk headers and changed lines
        const hunks = section.split(/^@@/m).slice(1);

        for (const hunk of hunks) {
            // Parse the hunk header to get line numbers
            const headerMatch = hunk.match(/^ -(\d+),?(\d+)? \+(\d+),?(\d+)? @@/);
            if (!headerMatch) continue;

            const oldStart = parseInt(headerMatch[1], 10);
            const newStart = parseInt(headerMatch[3], 10);

            // Split the hunk by lines and process each line
            const lines = hunk.split('\n').slice(1);
            let oldLineNumber = oldStart;
            let newLineNumber = newStart;

            for (const line of lines) {
                if (line.startsWith('+')) {
                    // Added line
                    changedFiles[filePath].additions.push(newLineNumber);
                    newLineNumber++;
                } else if (line.startsWith('-')) {
                    // Removed line
                    changedFiles[filePath].deletions.push(oldLineNumber);
                    oldLineNumber++;
                } else if (!line.startsWith('\\')) {
                    // Context line (not a "No newline at end of file" marker)
                    oldLineNumber++;
                    newLineNumber++;
                }
            }
        }
    }

    return changedFiles;
}

// ----- glob/minimatch replacements -----

// Custom glob implementation
async function globFiles(pattern, rootDir = '.') {
    const results = [];

    // Handle simplified basic patterns without full glob syntax
    // This supports basic patterns like *.md, CHANGELOG.md, etc.
    const isWildcard = pattern.includes('*');

    // Walk directory recursively
    async function walk(dir) {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            // Skip node_modules and .git
            if (entry.name === 'node_modules' || entry.name === '.git') {
                continue;
            }

            if (entry.isDirectory()) {
                await walk(fullPath);
            } else if (entry.isFile()) {
                // For "**/*.extension" patterns, check against the relative path
                if (pattern.startsWith('**/*')) {
                    const relPath = path.relative(rootDir, fullPath);
                    const extension = pattern.slice(4); // Remove "**/*"
                    if (relPath.endsWith(extension)) {
                        results.push(fullPath);
                    }
                }
                // For other patterns, match against the filename
                else if (matchFilePattern(entry.name, pattern)) {
                    results.push(fullPath);
                }
            }
        }
    }

    await walk(rootDir);
    return results;
}

// Simple file pattern matcher (replacement for minimatch)
function matchFilePattern(filename, pattern) {
    // Handle exact matches
    if (!pattern.includes('*')) {
        return filename === pattern;
    }

    // Handle **/*.extension pattern (matches any file with the extension in any directory)
    if (pattern.startsWith('**/*.')) {
        const extension = pattern.slice(4); // Remove "**/*"
        return filename.endsWith(extension);
    }

    // Handle *.extension pattern (matches files with the extension in current directory)
    if (pattern.startsWith('*.')) {
        const extension = pattern.slice(1);
        return filename.endsWith(extension);
    }

    // For more complex patterns, we could implement more logic here
    // but this covers our basic needs

    return false;
}

module.exports = {
    core,
    globFiles,
    matchFilePattern,
    getPullRequestChanges,
    getPushChanges,
    getChanges
};