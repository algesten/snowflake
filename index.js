const { core, github } = require('./src/utils');
const { parseLineWidthRules, checkLineWidth } = require('./src/line-width');
const { checkRustImports } = require('./src/rust-imports');

async function run() {
    try {
        // Get inputs
        const lineWidthRules = core.getInput('line_width_rules');
        const token = core.getInput('github_token');
        const octokit = github.getOctokit(token);

        // Parse line width rules
        const rules = parseLineWidthRules(lineWidthRules);

        // Check 1: Line width
        const lineWidthResults = await checkLineWidth(rules);

        // Check 2: Rust import style
        const rustImportResults = await checkRustImports();

        // Create check runs for both checks
        await createCheckRun(octokit, 'Line Width Check', lineWidthResults);
        await createCheckRun(octokit, 'Rust Import Style Check', rustImportResults);

        // Set outputs
        core.setOutput('line_width_result', lineWidthResults.success ? 'success' : 'failure');
        core.setOutput('rust_import_result', rustImportResults.success ? 'success' : 'failure');

        // Fail the action if any checks failed
        if (!lineWidthResults.success || !rustImportResults.success) {
            let errorMessage = 'One or more checks failed:\n';

            // Add line width violations details
            if (!lineWidthResults.success) {
                errorMessage += `\nLine Width Check failed with ${lineWidthResults.violations.length} violations:\n`;

                // Include up to 5 violations in the error message for line width
                lineWidthResults.violations.slice(0, 5).forEach(violation => {
                    errorMessage += `- ${violation.file}:${violation.line} (${violation.length} chars, max: ${violation.maxWidth})\n`;
                });

                if (lineWidthResults.violations.length > 5) {
                    errorMessage += `  ...and ${lineWidthResults.violations.length - 5} more violations\n`;
                }
            }

            // Add Rust import violations details
            if (!rustImportResults.success) {
                errorMessage += `\nRust Import Style Check failed with ${rustImportResults.violations.length} violations:\n`;

                // Include up to 5 violations in the error message for Rust imports
                rustImportResults.violations.slice(0, 5).forEach(violation => {
                    errorMessage += `- ${violation.file}:${violation.lineStart}-${violation.lineEnd}\n`;
                });

                if (rustImportResults.violations.length > 5) {
                    errorMessage += `  ...and ${rustImportResults.violations.length - 5} more violations\n`;
                }
            }

            core.setFailed(errorMessage);
        }
    } catch (error) {
        core.setFailed(`Action failed with error: ${error.message}`);
    }
}

// Create GitHub check run
async function createCheckRun(octokit, name, results) {
    const context = github.context;

    // Only create check runs for pull request events
    if (!context.payload.pull_request) {
        core.warning('Not a pull request event. Skipping check run creation.');
        return;
    }

    try {
        const checkRunDetails = {
            owner: context.repo.owner,
            repo: context.repo.repo,
            name,
            head_sha: context.payload.pull_request.head.sha,
            status: 'completed',
            conclusion: results.success ? 'success' : 'failure',
            output: {
                title: results.success ? `${name} passed` : `${name} failed`,
                summary: results.summary,
                text: formatViolations(results.violations, name)
            }
        };

        await octokit.rest.checks.create(checkRunDetails);
    } catch (error) {
        // Don't fail the whole action if check run creation fails
        core.warning(`Failed to create check run for ${name}: ${error.message}`);
        // Still report results in the logs
        core.warning(`Results for ${name}: ${results.success ? 'PASSED' : 'FAILED'}`);
        if (!results.success) {
            core.warning(`${results.violations.length} violations found.`);
        }
    }
}

// Format violations for check run output
function formatViolations(violations, checkName) {
    if (violations.length === 0) {
        return 'No violations found. Good job!';
    }

    let output = '';

    if (checkName === 'Line Width Check') {
        output = '## Line Width Violations\n\n';
        output += '| File | Line | Length | Max Width | Content |\n';
        output += '| ---- | ---- | ------ | --------- | ------- |\n';

        for (const violation of violations.slice(0, 50)) {
            output += `| ${violation.file} | ${violation.line} | ${violation.length} | ${violation.maxWidth} | \`${violation.content.replace(/\|/g, '\\|')}\` |\n`;
        }

        if (violations.length > 50) {
            output += `\n... and ${violations.length - 50} more violations`;
        }

        output += '\n\nPlease ensure all lines are within the maximum width.';
    } else {
        output = '## Multi-line Use Statement Violations\n\n';
        output += '### INCORRECT format:\n```rust\nuse crate::rtp_::{\n    Bitrate, Descriptions,\n    Extension\n};\n```\n\n';
        output += '### CORRECT format:\n```rust\nuse crate::rtp_::Bitrate, Descriptions;\nuse crate::rtp_::Extension;\n```\n\n';

        output += '### Violations found:\n\n';

        for (const violation of violations.slice(0, 20)) {
            output += `**File**: ${violation.file}\n`;
            output += `**Lines**: ${violation.lineStart}-${violation.lineEnd}\n`;
            output += '```rust\n' + violation.content + '\n```\n\n';
        }

        if (violations.length > 20) {
            output += `... and ${violations.length - 20} more violations`;
        }
    }

    return output;
}

// Run the action
run();
