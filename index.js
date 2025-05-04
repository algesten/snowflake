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
            core.setFailed('One or more checks failed');
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
