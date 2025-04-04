#!/usr/bin/env bash
# exit on error
set -o errexit

echo "Starting Render build script..."

# Set environment variables for Puppeteer
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
export PUPPETEER_CACHE_DIR=$(pwd)/.cache/puppeteer

# Ensure cache directory exists
mkdir -p $PUPPETEER_CACHE_DIR
echo "Created puppeteer cache directory at $PUPPETEER_CACHE_DIR"

# Check if we have a cached Puppeteer
if [[ -d $XDG_CACHE_HOME/puppeteer ]]; then
  echo "Found existing Puppeteer cache in build cache, copying to project directory"
  cp -R $XDG_CACHE_HOME/puppeteer/ .cache/
else
  echo "No existing Puppeteer cache found in build cache"
fi

# Install dependencies
echo "Installing dependencies..."
npm ci

# Run Puppeteer check to verify installation and troubleshoot issues
echo "Running Puppeteer checks..."
node check-puppeteer.js

# Store the cache back to the build cache location
echo "Saving Puppeteer cache for future builds..."
mkdir -p $XDG_CACHE_HOME/puppeteer
cp -R .cache/puppeteer/ $XDG_CACHE_HOME/ || echo "Warning: Could not save cache (this is normal for first build)"

echo "Render build script completed!" 