const assert = require('assert');
const mockFs = require('mock-fs');
const path = require('path');

// Functions to test
const { parseLineWidthRules, checkLineWidth } = require('../src/line-width');

describe('Line Width Rules Parser', () => {
    it('should parse line width rules correctly', () => {
        // Test with default rules
        const rules = parseLineWidthRules('CHANGELOG.md:80;*.md:110;*.rs:110;*.toml:110;DEFAULT=110');

        assert.strictEqual(rules.default, 110);
        assert.strictEqual(rules.patterns.length, 4);

        // Check specific patterns
        const changelog = rules.patterns.find(p => p.pattern === 'CHANGELOG.md');
        assert.strictEqual(changelog.width, 80);

        const markdown = rules.patterns.find(p => p.pattern === '*.md');
        assert.strictEqual(markdown.width, 110);
    });

    it('should handle empty rules', () => {
        const rules = parseLineWidthRules('');
        assert.strictEqual(rules.default, 110); // Default value
        assert.strictEqual(rules.patterns.length, 0);
    });

    it('should handle DEFAULT override', () => {
        const rules = parseLineWidthRules('DEFAULT=120');
        assert.strictEqual(rules.default, 120);
        assert.strictEqual(rules.patterns.length, 0);
    });
});

describe('Line Width Checker', () => {
    describe('parseLineWidthRules', () => {
        it('should parse line width rules string correctly', () => {
            const rulesStr = 'CHANGELOG.md:80;*.md:110;*.rs:110;*.toml:110;DEFAULT=120';
            const result = parseLineWidthRules(rulesStr);

            assert.strictEqual(result.default, 120);
            assert.strictEqual(result.patterns.length, 4);

            // Check individual patterns
            const changelogRule = result.patterns.find(p => p.pattern === 'CHANGELOG.md');
            assert.ok(changelogRule, 'CHANGELOG.md pattern should exist');
            assert.strictEqual(changelogRule.width, 80);

            const mdRule = result.patterns.find(p => p.pattern === '*.md');
            assert.ok(mdRule, '*.md pattern should exist');
            assert.strictEqual(mdRule.width, 110);
        });

        it('should handle rules with missing values', () => {
            const rulesStr = 'CHANGELOG.md:80;*.md:;DEFAULT=120';
            const result = parseLineWidthRules(rulesStr);

            assert.strictEqual(result.default, 120);
            assert.strictEqual(result.patterns.length, 1);

            const changelogRule = result.patterns.find(p => p.pattern === 'CHANGELOG.md');
            assert.ok(changelogRule, 'CHANGELOG.md pattern should exist');
            assert.strictEqual(changelogRule.width, 80);
        });

        it('should use default width when not specified', () => {
            const rulesStr = 'CHANGELOG.md:80;*.md:110';
            const result = parseLineWidthRules(rulesStr);

            assert.strictEqual(result.default, 110); // Default from the code
            assert.strictEqual(result.patterns.length, 2);
        });
    });

    describe('checkLineWidth', () => {
        beforeEach(() => {
            // Set up mock file system
            mockFs({
                'test-files': {
                    'test.md': 'This is a test file.\nThis line is not too long.\n' +
                        'This line is way too long and should exceed the limit we set for testing purposes in our GitHub Action implementation.',
                    'CHANGELOG.md': 'This is a test changelog file.\nThis line is not too long.\n' +
                        'This line is too long for a changelog file but might be OK for other types of files.',
                    'test.rs': 'fn main() {\n    println!("Hello, world!");\n' +
                        '    // This is a very long comment line that should exceed the Rust file width limit we would set in our test.'
                }
            });
        });

        afterEach(() => {
            // Restore real file system
            mockFs.restore();
        });

        it('should detect lines exceeding max width based on file pattern', async function () {
            const rules = parseLineWidthRules('CHANGELOG.md:40;*.md:50;*.rs:60;DEFAULT=70');
            const results = await checkLineWidth(rules, 'test-files');

            assert.strictEqual(results.success, false);
            assert.ok(results.violations.length >= 3, 'Should have at least 3 violations');

            // Check violations for various file types
            const changelogViolation = results.violations.find(v => v.file.includes('CHANGELOG.md'));
            assert.ok(changelogViolation, 'Should have CHANGELOG.md violation');
            assert.strictEqual(changelogViolation.maxWidth, 40);

            const mdViolation = results.violations.find(v => v.file.includes('test.md') && !v.file.includes('CHANGELOG'));
            assert.ok(mdViolation, 'Should have test.md violation');
            assert.strictEqual(mdViolation.maxWidth, 50);

            const rsViolation = results.violations.find(v => v.file.includes('test.rs'));
            assert.ok(rsViolation, 'Should have test.rs violation');
            assert.strictEqual(rsViolation.maxWidth, 60);
        });

        it('should pass when no lines exceed max width', async function () {
            // Use very high width limits so no violations occur
            const rules = parseLineWidthRules('CHANGELOG.md:1000;*.md:1000;*.rs:1000;DEFAULT=1000');
            const results = await checkLineWidth(rules, 'test-files');

            assert.strictEqual(results.success, true);
            assert.strictEqual(results.violations.length, 0);
        });

        it('should use default width when no specific pattern matches', async function () {
            // Only set changelog rule and default, forcing md and rs files to use default
            const rules = parseLineWidthRules('CHANGELOG.md:1000;DEFAULT=50');
            const results = await checkLineWidth(rules, 'test-files');

            assert.strictEqual(results.success, false);

            // CHANGELOG.md should have no violations (1000 char limit)
            const changelogViolations = results.violations.filter(v => v.file.includes('CHANGELOG.md'));
            assert.strictEqual(changelogViolations.length, 0);

            // Other files should use default of 50
            const otherViolations = results.violations.filter(v => !v.file.includes('CHANGELOG.md'));
            assert.ok(otherViolations.length >= 2, 'Should have at least 2 violations');
            otherViolations.forEach(v => {
                assert.strictEqual(v.maxWidth, 50);
            });
        });
    });
});