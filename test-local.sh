#!/bin/bash
set -e

# Load environment variables from .env file if it exists
if [ -f .env ]; then
  echo "Loading environment variables from .env file..."
  # Use a safer method to load .env that handles spaces and special characters
  set -a
  source .env
  set +a
  echo "✓ Environment variables loaded from .env"
fi

# Check if SLACK_WEBHOOK_URL is set (either from .env or environment)
if [ -z "$SLACK_WEBHOOK_URL" ]; then
  echo "Error: SLACK_WEBHOOK_URL is not set."
  echo ""
  echo "You can set it in one of these ways:"
  echo "1. Create a .env file with: SLACK_WEBHOOK_URL=your_webhook_url"
  echo "2. Export it: export SLACK_WEBHOOK_URL='your_webhook_url'"
  echo ""
  if [ ! -f .env ]; then
    echo "No .env file found. Would you like to create one? (y/n)"
    read -r response
    if [[ "$response" == "y" ]]; then
      echo "# Environment variables for local testing" > .env
      echo "SLACK_WEBHOOK_URL=your_webhook_url_here" >> .env
      echo ""
      echo "Created .env file. Please edit it and add your Slack webhook URL."
      exit 1
    fi
  fi
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
  "chrome_flags": "--no-sandbox --headless=new --disable-gpu --disable-dev-shm-usage",
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
export INPUT_CHROME_FLAGS="--no-sandbox --headless=new --disable-gpu --disable-dev-shm-usage"
export INPUT_TIMEOUT="30"

echo "Running the action locally..."
node dist/index.js

rm "$INPUTS_FILE"
echo "Done!"
