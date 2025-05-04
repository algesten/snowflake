# PR Code Quality Checks

A GitHub Action that runs code quality checks on both Pull Requests and Push events:

1. **Line Width Check**: Ensures files adhere to maximum line width rules
2. **Rust Import Style Check**: Prevents multi-line use statements in Rust code

## Usage

Add this action to your GitHub workflow:

```yaml
name: Code Quality

on:
  pull_request:
    branches: [ main, master ]
  push:
    branches: [ main, master ]

jobs:
  quality-checks:
    runs-on: ubuntu-latest
    name: Run code quality checks
    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Code Quality Checks
        uses: your-username/pr-code-quality-checks@v1
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          # Optional: Override default line width rules
          # line_width_rules: 'CHANGELOG.md:80;*.md:110;*.rs:110;*.toml:110;DEFAULT=110'
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `github_token` | GitHub token for creating check runs | Yes | `${{ github.token }}` |
| `line_width_rules` | Rules for max line width in format: `file_pattern:width;file_pattern:width` | No | `CHANGELOG.md:80;*.md:110;*.rs:110;*.toml:110;DEFAULT=110` |
| `check_diff` | If true, only checks files and lines changed in the current event (PR or push) | No | `true` |

## Outputs

| Output | Description |
|--------|-------------|
| `line_width_result` | Result of line width check (`success` or `failure`) |
| `rust_import_result` | Result of Rust import style check (`success` or `failure`) |

## Line Width Rules Format

The `line_width_rules` input accepts a semicolon-separated list of rules in the format:

```
file_pattern:max_width;file_pattern:max_width;DEFAULT=default_width
```

For example:
- `CHANGELOG.md:80` - CHANGELOG.md files have a max width of 80 characters
- `*.md:110` - All markdown files have a max width of 110 characters
- `DEFAULT=110` - All other files have a max width of 110 characters

## Rust Import Style Check

This check enforces the following style for Rust imports:

### INCORRECT format:
```rust
use crate::rtp_::{
    Bitrate, Descriptions,
    Extension
};
```

### CORRECT format:
```rust
use crate::rtp_::Bitrate, Descriptions;
use crate::rtp_::Extension;
```

## Development

### Running Tests

To run the tests locally:

```bash
npm install
npm test
```

For continuous test running during development:

```bash
npm run test:watch
```

## License

MIT