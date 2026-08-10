#!/usr/bin/env python3
"""
Audio analysis module for beat detection and tempo analysis.
Handles BPM detection, beat tracking, and audio feature extraction.
"""

import json
import sys
import argparse
from pathlib import Path
from typing import Dict, List, Tuple, Any

try:
    import librosa
    import numpy as np
    from scipy import signal
except ImportError:
    print("ERROR: Required libraries not found. Install with:", file=sys.stderr)
    print("pip3 install librosa scipy numpy", file=sys.stderr)
    sys.exit(1)


class AudioAnalyzer:
    """Analyzes audio files for tempo, beats, and other features."""

    def __init__(self, audio_path: str, sr: int = 22050):
        """Initialize analyzer with audio file."""
        self.audio_path = audio_path
        self.sr = sr
        self.y, self.sr = librosa.load(audio_path, sr=sr)
        self.duration = librosa.get_duration(y=self.y, sr=sr)

    def detect_tempo(self) -> Dict[str, Any]:
        """Detect BPM and confidence of the audio."""
        try:
            onset_env = librosa.onset.onset_strength(y=self.y, sr=self.sr)
            # Estimate global tempo
            tempos = librosa.feature.tempogram_sinusoid(onset_env=onset_env, sr=self.sr)
            tempo = np.median(
                librosa.tempo(onset_env=onset_env, sr=self.sr, aggregate=None)
            )

            # Spectral centroid for confidence scoring
            spectral_centroids = librosa.feature.spectral_centroid(y=self.y, sr=self.sr)[0]
            confidence = min(1.0, np.std(spectral_centroids) / 5000)

            return {
                "bpm": float(tempo),
                "confidence": float(confidence),
                "tempos_detected": [float(t) for t in librosa.tempo(onset_env=onset_env, sr=self.sr, aggregate=None)[:5]],
            }
        except Exception as e:
            return {"bpm": 0, "confidence": 0, "error": str(e)}

    def detect_beats(self) -> Dict[str, Any]:
        """Detect beat frames and times."""
        try:
            onset_env = librosa.onset.onset_strength(y=self.y, sr=self.sr)
            tempo, beats = librosa.beat.beat_track(y=self.y, sr=self.sr, onset_env=onset_env)

            beat_times = librosa.frames_to_time(beats, sr=self.sr).tolist()
            beat_ms = [t * 1000 for t in beat_times]

            return {
                "tempo": float(tempo),
                "beat_count": len(beats),
                "beat_times_seconds": [float(t) for t in beat_times],
                "beat_times_ms": beat_ms,
                "beats_per_second": float(tempo / 60),
            }
        except Exception as e:
            return {"tempo": 0, "beat_count": 0, "error": str(e)}

    def detect_onsets(self) -> Dict[str, Any]:
        """Detect audio onsets (sharp changes in amplitude)."""
        try:
            onset_env = librosa.onset.onset_strength(y=self.y, sr=self.sr)
            onsets = librosa.onset.onset_detect(onset_env=onset_env, sr=self.sr, units='time')

            return {
                "onset_count": int(len(onsets)),
                "onset_times_seconds": [float(t) for t in onsets],
                "onset_times_ms": [float(t * 1000) for t in onsets],
            }
        except Exception as e:
            return {"onset_count": 0, "error": str(e)}

    def detect_sections(self) -> Dict[str, Any]:
        """Detect repeating sections and structure."""
        try:
            S = librosa.feature.melspectrogram(y=self.y, sr=self.sr)
            X = librosa.power_to_db(S, ref=np.max)

            # Use dynamic time warping for structure analysis
            rec = librosa.sequence.transition_loop(2, 2)
            sections = librosa.sequence.viterbi(X, rec, p_state=0.1, p_init=np.ones(2) / 2)

            # Get times for detected sections
            frame_times = librosa.frames_to_time(np.arange(len(sections)), sr=self.sr)
            section_changes = [
                {"time_seconds": float(frame_times[i]), "time_ms": float(frame_times[i] * 1000)}
                for i in range(1, len(sections)) if sections[i] != sections[i - 1]
            ]

            return {
                "section_count": len(section_changes) + 1,
                "section_changes": section_changes,
            }
        except Exception as e:
            return {"section_count": 0, "error": str(e)}

    def analyze_loudness(self) -> Dict[str, Any]:
        """Analyze audio loudness envelope."""
        try:
            S = librosa.feature.melspectrogram(y=self.y, sr=self.sr)
            db = librosa.power_to_db(S, ref=np.max)
            loudness = np.mean(db, axis=0)

            frame_times = librosa.frames_to_time(np.arange(len(loudness)), sr=self.sr)

            # Find quiet and loud sections
            mean_loudness = np.mean(loudness)
            std_loudness = np.std(loudness)

            return {
                "mean_db": float(mean_loudness),
                "std_db": float(std_loudness),
                "max_db": float(np.max(loudness)),
                "min_db": float(np.min(loudness)),
                "duration_seconds": float(self.duration),
            }
        except Exception as e:
            return {"error": str(e)}

    def full_analysis(self) -> Dict[str, Any]:
        """Run complete audio analysis."""
        return {
            "audio_file": self.audio_path,
            "duration_seconds": self.duration,
            "sample_rate": self.sr,
            "tempo": self.detect_tempo(),
            "beats": self.detect_beats(),
            "onsets": self.detect_onsets(),
            "sections": self.detect_sections(),
            "loudness": self.analyze_loudness(),
        }


def main():
    parser = argparse.ArgumentParser(description="Analyze audio file for tempo and beats")
    parser.add_argument("audio_file", help="Path to audio file")
    parser.add_argument("--output", "-o", help="Output JSON file (default: stdout)")
    parser.add_argument("--analysis", "-a", choices=["full", "tempo", "beats", "onsets"],
                       default="full", help="Type of analysis")

    args = parser.parse_args()

    if not Path(args.audio_file).exists():
        print(f"ERROR: Audio file not found: {args.audio_file}", file=sys.stderr)
        sys.exit(1)

    try:
        analyzer = AudioAnalyzer(args.audio_file)

        if args.analysis == "full":
            result = analyzer.full_analysis()
        elif args.analysis == "tempo":
            result = analyzer.detect_tempo()
        elif args.analysis == "beats":
            result = analyzer.detect_beats()
        elif args.analysis == "onsets":
            result = analyzer.detect_onsets()

        output = json.dumps(result, indent=2)

        if args.output:
            Path(args.output).write_text(output)
            print(f"Analysis saved to {args.output}")
        else:
            print(output)

    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
