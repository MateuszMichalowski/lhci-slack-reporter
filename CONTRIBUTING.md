# Contributing to Lighthouse CI Slack Reporter

Thank you for considering contributing to Lighthouse CI Slack Reporter! This document outlines the process for contributing to this project.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for everyone.

## How Can I Contribute?

### Reporting Bugs

Bug reports are tracked as GitHub issues. When you create an issue, please include:

- A clear and descriptive title
- Steps to reproduce the issue
- Expected behavior vs. actual behavior
- Screenshots if applicable
- Any relevant logs or error messages

### Suggesting Enhancements

Enhancement suggestions are also tracked as GitHub issues. When suggesting an enhancement, please include:

- A clear and descriptive title
- A detailed description of the proposed feature
- Explain why this enhancement would be useful
- Include examples of how it would be used

### Pull Requests

1. Fork the repository
2. Create a new branch for your changes
3. Make your changes, including tests and documentation
4. Run tests and linting locally
5. Submit your pull request

#### Pull Request Process

1. Update the README.md if needed
2. Update CHANGELOG.md with details of your changes
3. The PR should work with GitHub Actions CI
4. Your PR will be reviewed by maintainers

## Development Setup

### Prerequisites

- Node.js 16 or later
- npm

### Setup

1. Clone your fork of the repository
2. Install dependencies: `npm install`
3. Build the action: `npm run build`

### Commands

- `npm run build`: Build the action using ncc
- `npm run lint`: Run linting
- `npm run format`: Format code
- `npm run all`: Run lint, format, and build

### Testing

You can test the action locally using the included test scripts:

```bash
# Using the test-local.sh script
export SLACK_WEBHOOK_URL=your_webhook_url
./test-local.sh

# Using act
./run-act-local.sh
```

## Style Guide

- Follow the existing code style
- Use TypeScript features and typing
- Document all public functions and classes
- Keep code modular and testable
- Write descriptive commit messages

## License

By contributing, you agree that your contributions will be licensed under the project's MIT License.
