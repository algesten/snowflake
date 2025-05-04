const assert = require('assert');
const mockFs = require('mock-fs');
const path = require('path');
const { checkRustImports } = require('../src/rust-imports');

describe('Rust import multi-lineer', () => {
    beforeEach(() => {
        // Set up mock file system
        mockFs({
            'test-files': {
                'correct.rs': `
// This file has correct imports
use std::collections::HashMap;
use std::path::Path;
use std::io::Error, Result;

fn main() {
    println!("Hello");
}`,
                'incorrect.rs': `
// This file has incorrect imports
use std::collections::{
    HashMap,
    HashSet
};

use std::sync::{Arc, Mutex};

// Another incorrect import
use crate::test::{
    One,
    Two,
    Three
};

fn main() {
    println!("Hello");
}`
            }
        });
    });

    afterEach(() => {
        // Restore real file system
        mockFs.restore();
    });

    it('should detect multi-line use statements', async function () {
        const results = await checkRustImports('test-files');

        assert.strictEqual(results.success, false);
        assert.strictEqual(results.violations.length, 2);

        // Check first violation
        const firstViolation = results.violations[0];
        assert.ok(firstViolation.file.includes('incorrect.rs'), 'File should include incorrect.rs');
        assert.ok(firstViolation.content.includes('HashMap'), 'Content should include HashMap');
        assert.ok(firstViolation.content.includes('HashSet'), 'Content should include HashSet');

        // Check second violation
        const secondViolation = results.violations[1];
        assert.ok(secondViolation.file.includes('incorrect.rs'), 'File should include incorrect.rs');
        assert.ok(secondViolation.content.includes('One'), 'Content should include One');
        assert.ok(secondViolation.content.includes('Three'), 'Content should include Three');
    });

    it('should pass when no multi-line use statements are found', async function () {
        // Create a file system with only correct imports
        mockFs.restore();
        mockFs({
            'test-files': {
                'correct.rs': `
// This file has correct imports only
use std::collections::HashMap;
use std::path::Path;
use std::io::Error, Result;

fn main() {
    println!("Hello");
}`
            }
        });

        const results = await checkRustImports('test-files');

        assert.strictEqual(results.success, true);
        assert.strictEqual(results.violations.length, 0);
    });
});