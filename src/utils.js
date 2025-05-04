const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const https = require('https');
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

// Simple replacement for GitHub API operations needed
const github = {
    context: {
        repo: {
            owner: process.env.GITHUB_REPOSITORY_OWNER || '',
            repo: process.env.GITHUB_REPOSITORY?.split('/')[1] || '',
        },
        payload: {
            pull_request: process.env.GITHUB_REF?.startsWith('refs/pull/') ? {
                head: {
                    sha: process.env.GITHUB_SHA || ''
                }
            } : null
        }
    },
    getOctokit: (token) => ({
        rest: {
            checks: {
                create: async (params) => {
                    // Simple implementation to post a check run
                    // This would normally make a GitHub API call
                    return postToGitHub(`/repos/${params.owner}/${params.repo}/check-runs`, token, {
                        name: params.name,
                        head_sha: params.head_sha,
                        status: params.status,
                        conclusion: params.conclusion,
                        output: params.output
                    });
                }
            }
        }
    })
};

// Helper function to post to GitHub API
async function postToGitHub(endpoint, token, data) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: endpoint,
            method: 'POST',
            headers: {
                'Authorization': `token ${token}`,
                'User-Agent': 'snowflake-action',
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let responseData = '';
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(JSON.parse(responseData));
                } else {
                    reject(new Error(`GitHub API error: ${res.statusCode} ${responseData}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.write(JSON.stringify(data));
        req.end();
    });
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
    github,
    globFiles,
    matchFilePattern
};