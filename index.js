const { core, getChanges } = require('./src/utils');
const { parseLineWidthRules, checkLineWidth } = require('./src/line-width');
const { checkRustImports } = require('./src/rust-imports');

async function run() {
    try {
        // Get inputs
        const lineWidthRules = core.getInput('line_width_rules');
        const checkDiff = core.getInput('check_diff') === 'true';

        // Parse line width rules
        const rules = parseLineWidthRules(lineWidthRules);

        // Get changes if we're only checking changed files/lines
        let changes = null;
        if (checkDiff) {
            try {
                changes = await getChanges();
                if (changes) {
                    const eventType = process.env.GITHUB_EVENT_NAME;
                    core.warning(`Checking only files and lines modified in the ${eventType} (${Object.keys(changes || {}).length} files)`);
                }
            } catch (error) {
                core.warning(`Failed to get changes, will check all files: ${error.message}`);
            }
        }

        // Check 1: Line width
        const lineWidthResults = await checkLineWidth(rules, '.', changes);

        // Check 2: Rust import style
        const rustImportResults = await checkRustImports('.', changes);

        // Set outputs
        core.setOutput('line_width_result', lineWidthResults.success ? 'success' : 'failure');
        core.setOutput('rust_import_result', rustImportResults.success ? 'success' : 'failure');

        // Report results in logs
        if (lineWidthResults.success) {
            console.log('✅ Line Width Check passed');
        } else {
            console.log(`❌ Line Width Check failed with ${lineWidthResults.violations.length} violations`);
            // Log a sample of the violations
            lineWidthResults.violations.slice(0, 5).forEach(violation => {
                console.log(`  - ${violation.file}:${violation.line} (${violation.length} chars, max: ${violation.maxWidth})`);
            });
            if (lineWidthResults.violations.length > 5) {
                console.log(`  ... and ${lineWidthResults.violations.length - 5} more violations`);
            }
        }

        if (rustImportResults.success) {
            console.log('✅ Rust Import Style Check passed');
        } else {
            console.log(`❌ Rust Import Style Check failed with ${rustImportResults.violations.length} violations`);
            // Log a sample of the violations
            rustImportResults.violations.slice(0, 5).forEach(violation => {
                console.log(`  - ${violation.file}:${violation.lineStart}-${violation.lineEnd}`);
            });
            if (rustImportResults.violations.length > 5) {
                console.log(`  ... and ${rustImportResults.violations.length - 5} more violations`);
            }
        }

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

// Run the action
run();
