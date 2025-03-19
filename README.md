# Lighthouse CI Slack Reporter

![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/yourusername/lighthouse-slack-action/test.yml?branch=main)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A GitHub Action that runs Lighthouse tests on specified URLs and reports the results to a Slack channel in a elegant, formatted table.

![Slack Message Preview](https://via.placeholder.com/600x400?text=Slack+Message+Preview)

## 🚀 Features

- Run Lighthouse tests on multiple URLs
- Device types selection (mobile, desktop)
- Categories to test (performance, accessibility, best-practices, SEO)
- Send formatted, color-coded reports to Slack with scores for each test
- Set a minimum score threshold for action failure
- Compatible with the `act` tool for local testing

## 📋 Usage

### Basic Example

```yaml
name: Lighthouse CI

on:
  push:
    branches: [ main ]
  schedule:
    - cron: '0 0 * * 1'  # Run weekly on Mondays

jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Lighthouse CI Slack Reporter
        uses: yourusername/lighthouse-slack-action@v1
        with:
          urls: 'https://example.com,https://example.com/blog'
          slack_webhook_url: ${{ secrets.SLACK_WEBHOOK_URL }}
```

### All Options

```yaml
name: Lighthouse CI

on:
  push:
    branches: [ main ]

jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Lighthouse CI Slack Reporter
        uses: yourusername/lighthouse-slack-action@v1
        with:
          # Required: URLs to test (comma-separated)
          urls: 'https://example.com,https://example.com/blog'
          
          # Optional: Device types to test (default: mobile,desktop)
          device_types: 'mobile,desktop'
          
          # Optional: Test categories to run (default: performance,accessibility,best-practices,seo)
          categories: 'performance,accessibility,best-practices,seo'
          
          # Required: Either slack_webhook_url or slack_token must be provided
          slack_webhook_url: ${{ secrets.SLACK_WEBHOOK_URL }}
          
          # Optional: Slack API token (alternative to webhook)
          # slack_token: ${{ secrets.SLACK_TOKEN }}
          
          # Optional: Slack channel to send the report to (without #)
          slack_channel: 'lighthouse-reports'
          
          # Optional: Title for the Slack message (default: 'Lighthouse Test Results')
          slack_title: 'Lighthouse Test Results - Production'
          
          # Optional: Fail the action if any score is below this threshold (0-100) (default: 0)
          fail_on_score_below: '70'
          
          # Optional: Custom Chrome flags (default: --no-sandbox --headless --disable-gpu)
          chrome_flags: '--no-sandbox --headless --disable-gpu'
          
          # Optional: Timeout for each test in seconds (default: 60)
          timeout: '60'
```

## ⚙️ Inputs

| Name | Description | Required | Default |
|------|-------------|----------|---------|
| `urls` | Comma-separated list of URLs to test | Yes | N/A |
| `device_types` | Device types to test (mobile, desktop). Comma-separated. | No | `mobile,desktop` |
| `categories` | Test categories to run (performance, accessibility, best-practices, seo). Comma-separated. | No | `performance,accessibility,best-practices,seo` |
| `slack_webhook_url` | Slack Webhook URL to send reports to | Yes (if slack_token not provided) | N/A |
| `slack_token` | Slack API token | Yes (if slack_webhook_url not provided) | N/A |
| `slack_channel` | Slack channel to send the report to (without #) | No | (webhook default) |
| `slack_title` | Title for the Slack message | No | `Lighthouse Test Results` |
| `fail_on_score_below` | Fail the action if any score is below this threshold (0-100) | No | `0` |
| `chrome_flags` | Custom flags to pass to Chrome | No | `--no-sandbox --headless --disable-gpu` |
| `timeout` | Timeout for each test in seconds | No | `60` |

## 📊 Slack Report - Message Format

The Slack report includes:

- A header with the title
- A summary of the tests run
- Average scores across all tests
- Detailed results for each URL and device type
- Color-coded indicators for scores:
   - 🟢 Green: 90-100
   - 🟡 Yellow: 50-89
   - 🔴 Red: 0-49
- Links to full HTML reports (when available)

## 🧪 Local Testing

### Using Act

You can test this action locally using [act](https://github.com/nektos/act):

1. Install act: `brew install act` or follow the [installation instructions](https://github.com/nektos/act#installation)
2. Create a `.env` file with your Slack webhook URL:
   ```
   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
   ```
3. Run act:
   ```
   act -j lighthouse --secret-file .env
   ```

### Using the Included Test Script

A test script is included to make local testing easier:

1. Make sure Chrome is installed on your system
2. Export your Slack webhook URL:
   ```
   export SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
   ```
3. Run the test script:
   ```
   chmod +x test-local.sh
   ./test-local.sh
   ```

## 🛠️ Development

### Prerequisites

- Node.js 16 or later
- npm

### Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Build the action: `npm run build`

### Commands

- `npm run build`: Build the action using ncc
- `npm test`: Run tests
- `npm run lint`: Run linting
- `npm run format`: Format code
- `npm run all`: Run lint, format, and build

## 🔍 Debugging

This action includes detailed logging to help diagnose issues:

- All steps are logged with emoji prefixes (🚀, 📋, 🔍, etc.)
- Debug information can be enabled by setting the GitHub Actions secret `ACTIONS_STEP_DEBUG` to `true`
- If tests fail, check the logs for detailed error messages
- HTML reports are generated for each test and can be accessed as artifacts

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Related Projects

- [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci) - The underlying tool used for Lighthouse testing
- [Slack API](https://api.slack.com/) - For sending messages to Slack

## 📚 Further Reading

- [Lighthouse Documentation](https://developers.google.com/web/tools/lighthouse)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Slack API Documentation](https://api.slack.com/messaging/webhooks)
