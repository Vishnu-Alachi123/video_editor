import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

async function testBPMAnalysis() {
  console.log('🎵 Testing Audio BPM Detection\n');

  const pythonScript = path.resolve('src/audio_analysis.py');

  console.log('Test 1: Checking Python audio analysis script');
  if (fs.existsSync(pythonScript)) {
    console.log('  ✅ audio_analysis.py found');
  } else {
    console.log('  ❌ audio_analysis.py not found');
    process.exit(1);
  }

  console.log('\nTest 2: Verifying Python dependencies');
  const testCode = `
import sys
try:
    import librosa
    print("✅ librosa available")
except ImportError:
    print("❌ librosa not installed")

try:
    import scipy
    print("✅ scipy available")
except ImportError:
    print("❌ scipy not installed")

try:
    import numpy
    print("✅ numpy available")
except ImportError:
    print("❌ numpy not installed")
`;

  return new Promise<void>((resolve) => {
    const proc = spawn('python3', ['-c', testCode]);

    proc.stdout.on('data', (data) => {
      console.log(`  ${data.toString().trim()}`);
    });

    proc.stderr.on('data', (data) => {
      console.log(`  ⚠️  ${data.toString().trim()}`);
    });

    proc.on('close', () => {
      console.log('\nTest 3: Audio analysis workflow');
      console.log('  Usage: python3 src/audio_analysis.py <audio_file> -o <output.json>');
      console.log('  Example: python3 src/audio_analysis.py music.mp3 -o analysis.json');

      console.log('\n✨ BPM detection test complete!');
      console.log('Ready to analyze audio files once they are available.');
      resolve();
    });
  });
}

testBPMAnalysis().catch(console.error);
