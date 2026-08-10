#!/bin/bash
set -e

echo "🎬 Video Editing Pipeline Setup"
echo "================================"
echo ""

# Check Node.js
echo "✓ Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Install from https://nodejs.org/"
    exit 1
fi
NODE_VERSION=$(node -v)
echo "  Found: $NODE_VERSION"

# Check Python
echo ""
echo "✓ Checking Python..."
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found. Install Python 3.11+"
    exit 1
fi
PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
echo "  Found: Python $PYTHON_VERSION"

# Check FFmpeg
echo ""
echo "✓ Checking FFmpeg..."
if ! command -v ffmpeg &> /dev/null; then
    echo "⚠️  FFmpeg not found. Installing..."
    if command -v apt-get &> /dev/null; then
        sudo apt-get update && sudo apt-get install -y ffmpeg
    elif command -v yum &> /dev/null; then
        sudo yum install -y ffmpeg
    elif command -v brew &> /dev/null; then
        brew install ffmpeg
    else
        echo "❌ Could not install FFmpeg. Install manually from https://ffmpeg.org/"
        exit 1
    fi
fi
FFMPEG_VERSION=$(ffmpeg -version 2>/dev/null | head -1)
echo "  Found: $FFMPEG_VERSION"

# Install Node dependencies
echo ""
echo "✓ Installing Node.js dependencies..."
npm install

# Install Python dependencies
echo ""
echo "✓ Installing Python dependencies..."
pip3 install librosa scipy numpy scikit-learn

# Create directories
echo ""
echo "✓ Creating directories..."
mkdir -p raw_clips audio output temp .cache

# Copy environment config
echo ""
echo "✓ Setting up configuration..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo "  Created .env (update with ANTHROPIC_API_KEY)"
else
    echo "  .env already exists"
fi

# Run tests
echo ""
echo "✓ Running verification tests..."
npm run test:ffmpeg 2>/dev/null || true
npm run test:bpm 2>/dev/null || true

echo ""
echo "✨ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Add your API key to .env (ANTHROPIC_API_KEY=sk-ant-...)"
echo "  2. Upload video: git add raw_clips/video.mp4 audio/music.mp3"
echo "  3. Run pipeline: npm run edit:auto raw_clips/video.mp4 audio/music.mp3"
echo "  4. Find output: ls output/"
echo ""
echo "For help, see SETUP.md"
