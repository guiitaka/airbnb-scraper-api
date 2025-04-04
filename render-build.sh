#!/usr/bin/env bash
# exit on error
set -o errexit

echo "Starting Render build script..."

# Ensure .cache directory exists
mkdir -p .cache/puppeteer
echo "Created puppeteer cache directory"

# Store/retrieve Puppeteer cache with build cache
if [[ -d $XDG_CACHE_HOME/puppeteer ]]; then
  echo "Copying Puppeteer Cache from Build Cache to project directory" 
  cp -R $XDG_CACHE_HOME/puppeteer/ .cache/
else
  echo "No existing Puppeteer cache found in build cache"
fi

# Install dependencies
npm ci

# Store the cache back to the build cache location
echo "Storing Puppeteer Cache in Build Cache for future builds"
mkdir -p $XDG_CACHE_HOME/puppeteer
cp -R .cache/puppeteer/ $XDG_CACHE_HOME/

echo "Render build script completed successfully!" 