#!/bin/bash
set -e

if [ -z "$SLACK_WEBHOOK_URL" ]; then
  if [ -f ".env" ]; then
    echo "Loading SLACK_WEBHOOK_URL from .env file..."
    
    export $(grep -v '^#' .env | xargs)
    
    if [ -z "$SLACK_WEBHOOK_URL" ]; then
      echo "Error: SLACK_WEBHOOK_URL not found in .env file."
      echo "Please add 'SLACK_WEBHOOK_URL=your_webhook_url' to your .env file."
      exit 1
    else
      echo "Successfully loaded SLACK_WEBHOOK_URL from .env file."
    fi
  else
    echo "Error: SLACK_WEBHOOK_URL environment variable is not set and .env file does not exist."
    echo "Please create a .env file with 'SLACK_WEBHOOK_URL=your_webhook_url'"
    echo "or set the environment variable with: export SLACK_WEBHOOK_URL='your_webhook_url'"
    exit 1
  fi
fi

echo "Running act with local workflow..."
act -j lighthouse -W .github/workflows/act-local.yml --secret SLACK_WEBHOOK_URL=$SLACK_WEBHOOK_URL
