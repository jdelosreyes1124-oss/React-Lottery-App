#!/usr/bin/env bash
# render-build.sh

set -e  # Exit on error

echo "🔧 Installing system dependencies..."

# Update package lists
apt-get update

# Install Chrome dependencies
apt-get install -y \
  wget \
  gnupg2 \
  ca-certificates \
  fonts-liberation \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libatspi2.0-0 \
  libcups2 \
  libdbus-1-3 \
  libdrm2 \
  libgbm1 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libwayland-client0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxkbcommon0 \
  libxrandr2 \
  xdg-utils \
  || echo "⚠️ Some dependencies failed to install"

echo "📥 Adding Google Chrome repository..."
wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add -
echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google.list

echo "🔄 Updating package lists..."
apt-get update

echo "📦 Installing Google Chrome..."
apt-get install -y google-chrome-stable || {
  echo "❌ Chrome installation failed, trying alternative..."
  apt-get install -y chromium-browser || echo "❌ Chromium installation also failed"
}

echo "✅ Verifying Chrome installation..."
if [ -f /usr/bin/google-chrome-stable ]; then
  echo "✅ Chrome installed at: /usr/bin/google-chrome-stable"
  /usr/bin/google-chrome-stable --version
elif [ -f /usr/bin/chromium-browser ]; then
  echo "✅ Chromium installed at: /usr/bin/chromium-browser"
  /usr/bin/chromium-browser --version
else
  echo "❌ No browser found after installation!"
fi

echo "📦 Installing Node dependencies..."
npm install

echo "✅ Build complete!"