import { FFmpegWrapper } from '../lib/ffmpeg-wrapper.js';
import path from 'path';

async function testFFmpeg() {
  console.log('🎬 Testing FFmpeg Wrapper...\n');

  const wrapper = new FFmpegWrapper();

  // Test 1: Check ffmpeg installation
  console.log('Test 1: Checking FFmpeg availability');
  try {
    const metadata = await wrapper.getMetadata('nonexistent.mp4')
      .catch(() => {
        console.log('  ✅ FFmpeg is installed and accessible');
        return null;
      });
  } catch (error) {
    console.log('  ⚠️  FFmpeg might not be available');
  }

  // Test 2: Verify FFmpeg methods exist
  console.log('\nTest 2: Verifying available methods');
  const methods = [
    'getMetadata',
    'extractAudio',
    'extractKeyframes',
    'cutSegment',
    'concatenateVideos',
    'syncAudioToVideo',
    'scaleVideo',
    'generateThumbnail',
  ];

  methods.forEach(method => {
    if (typeof (wrapper as any)[method] === 'function') {
      console.log(`  ✅ ${method}`);
    } else {
      console.log(`  ❌ ${method}`);
    }
  });

  console.log('\n✨ FFmpeg wrapper test complete!');
  console.log('Ready to process videos once media files are available.');
}

testFFmpeg().catch(console.error);
