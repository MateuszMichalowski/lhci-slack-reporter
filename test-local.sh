#!/bin/bash
set -e

if [ -z "$SLACK_WEBHOOK_URL" ]; then
  echo "Error: SLACK_WEBHOOK_URL environment variable is not set."
  echo "Please set it with: export SLACK_WEBHOOK_URL='your_webhook_url'"
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Building the action..."
npm run build

INPUTS_FILE=$(mktemp)
cat > "$INPUTS_FILE" << EOL
{
  "urls": "https://example.com,https://google.com",
  "device_types": "mobile,desktop",
  "categories": "performance,accessibility",
  "slack_webhook_url": "$SLACK_WEBHOOK_URL",
  "slack_title": "Local Test Results",
  "fail_on_score_below": "0",
  "chrome_flags": "--no-sandbox --headless --disable-gpu",
  "timeout": "30"
}
EOL

echo "Testing with inputs:"
cat "$INPUTS_FILE"

export INPUT_URLS="https://example.com,https://google.com"
export INPUT_DEVICE_TYPES="mobile,desktop"
export INPUT_CATEGORIES="performance,accessibility"
export INPUT_SLACK_WEBHOOK_URL="$SLACK_WEBHOOK_URL"
export INPUT_SLACK_TITLE="Local Test Results"
export INPUT_FAIL_ON_SCORE_BELOW="0"
export INPUT_CHROME_FLAGS="--no-sandbox --headless --disable-gpu"
export INPUT_TIMEOUT="30"

echo "Running the action locally..."
node dist/index.js

rm "$INPUTS_FILE"
echo "Done!"
