"""
Kasbah Guard v2.0 — Behavioral Anomaly Detection Engine
Uses Isolation Forest (unsupervised ML) on real telemetry to detect anomalies
without static thresholds. Trains locally, no data leaves the device.

Replaces: static threshold heuristics in BehavioralTracker
Integrates with: guard.rs /classify endpoint via HTTP
"""

import json
import time
import os
import pickle
import hashlib
import requests
import numpy as np
from collections import deque
from pathlib import Path

try:
    from sklearn.ensemble import IsolationForest
    from sklearn.preprocessing import StandardScaler
    HAS_SKLEARN = True
except ImportError:
    HAS_SKLEARN = False


GUARD_URL = "http://127.0.0.1:8788"
MODEL_DIR = Path.home() / "Library" / "Application Support" / "KasbahGuard" / "ml"
MODEL_PATH = MODEL_DIR / "isolation_forest.pkl"
SCALER_PATH = MODEL_DIR / "scaler.pkl"
TELEMETRY_PATH = MODEL_DIR / "telemetry_buffer.json"
MIN_SAMPLES = 200  # Minimum samples before model is considered trained


class BehavioralBaseline:
    """
    Unsupervised anomaly detection using Isolation Forest.
    Features: [syscall_rate, clipboard_rate, file_entropy, time_of_day,
               data_volume_kb, unique_content_ratio, risk_score_avg]
    """

    FEATURE_NAMES = [
        "events_per_min",       # Event frequency in sliding window
        "clipboard_rate",       # Clipboard scans per minute
        "keystroke_rate",       # Keystroke alerts per minute
        "file_scan_rate",       # File scans per minute
        "avg_risk_score",       # Average risk score of recent events
        "high_risk_ratio",      # Ratio of high-risk events (>60)
        "hour_of_day",          # 0-23, normalized to 0-1
        "data_volume_kb",       # Total data volume in window (KB)
        "unique_content_ratio", # Ratio of unique content hashes
        "velocity_boost",       # Current velocity boost from guard
    ]

    def __init__(self):
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        self.telemetry_buffer = deque(maxlen=50000)
        self.model = None
        self.scaler = None
        self.is_trained = False
        self.training_count = 0
        self.last_train_time = 0
        self._load_state()

    def _load_state(self):
        """Load persisted model and telemetry buffer."""
        if MODEL_PATH.exists() and SCALER_PATH.exists():
            try:
                with open(MODEL_PATH, "rb") as f:
                    self.model = pickle.load(f)
                with open(SCALER_PATH, "rb") as f:
                    self.scaler = pickle.load(f)
                self.is_trained = True
            except Exception:
                self.model = None
                self.scaler = None

        if TELEMETRY_PATH.exists():
            try:
                with open(TELEMETRY_PATH) as f:
                    data = json.load(f)
                self.telemetry_buffer = deque(data.get("buffer", []), maxlen=50000)
                self.training_count = data.get("training_count", 0)
            except Exception:
                pass

    def _save_state(self):
        """Persist model and telemetry to disk."""
        if self.model and self.scaler:
            with open(MODEL_PATH, "wb") as f:
                pickle.dump(self.model, f)
            with open(SCALER_PATH, "wb") as f:
                pickle.dump(self.scaler, f)

        # Save telemetry buffer (last 10k entries to avoid huge files)
        recent = list(self.telemetry_buffer)[-10000:]
        with open(TELEMETRY_PATH, "w") as f:
            json.dump({
                "buffer": recent,
                "training_count": self.training_count,
                "last_save": time.time(),
            }, f)

    def collect_features(self) -> dict:
        """Collect real-time features from the guard service."""
        features = {}
        try:
            # Get behavioral data from guard
            resp = requests.get(f"{GUARD_URL}/behavioral", timeout=2)
            if resp.ok:
                data = resp.json()
                features["events_per_min"] = data.get("source_events", 0)
                features["data_volume_kb"] = data.get("volume_bytes", 0) / 1024.0
                features["unique_content_ratio"] = 1.0 / max(data.get("repeat_count", 1), 1)
                features["velocity_boost"] = data.get("behavioral_boost", 0)

            # Get velocity data
            resp = requests.get(f"{GUARD_URL}/velocity", timeout=2)
            if resp.ok:
                vel = resp.json()
                features["high_risk_ratio"] = vel.get("high_risk_events", 0) / max(vel.get("events_in_window", 1), 1)
                features["avg_risk_score"] = 0  # Will be computed from status

            # Get status for rates
            resp = requests.get(f"{GUARD_URL}/status", timeout=2)
            if resp.ok:
                status = resp.json()
                features["clipboard_rate"] = status.get("clipboard_scans", 0)
                features["keystroke_rate"] = status.get("keystroke_flags", 0)
                features["file_scan_rate"] = status.get("fs_scans", 0)

            # Time of day (normalized 0-1)
            features["hour_of_day"] = time.localtime().tm_hour / 23.0

        except Exception:
            return {}

        # Ensure all features present
        for name in self.FEATURE_NAMES:
            features.setdefault(name, 0.0)

        return features

    def record(self, features: dict):
        """Record a feature vector to the telemetry buffer."""
        if not features:
            return
        vec = [float(features.get(name, 0.0)) for name in self.FEATURE_NAMES]
        self.telemetry_buffer.append(vec)

    def train(self, force=False):
        """Train/retrain Isolation Forest on accumulated telemetry."""
        if not HAS_SKLEARN:
            return {"error": "scikit-learn not installed"}

        n = len(self.telemetry_buffer)
        if n < MIN_SAMPLES and not force:
            return {
                "status": "insufficient_data",
                "samples": n,
                "required": MIN_SAMPLES,
            }

        X = np.array(list(self.telemetry_buffer))

        # Fit scaler
        self.scaler = StandardScaler()
        X_scaled = self.scaler.fit_transform(X)

        # Train Isolation Forest
        self.model = IsolationForest(
            n_estimators=200,
            contamination=0.02,  # Expect ~2% anomalies
            max_samples=min(n, 5000),
            random_state=42,
            n_jobs=-1,
        )
        self.model.fit(X_scaled)

        self.is_trained = True
        self.training_count += 1
        self.last_train_time = time.time()
        self._save_state()

        return {
            "status": "trained",
            "samples": n,
            "training_count": self.training_count,
            "contamination": 0.02,
            "n_estimators": 200,
        }

    def detect_anomaly(self, features: dict) -> dict:
        """Score a feature vector. Returns anomaly score and decision."""
        if not self.is_trained or not self.model or not self.scaler:
            return {
                "is_anomaly": False,
                "score": 0.0,
                "reason": "model_not_trained",
                "samples_collected": len(self.telemetry_buffer),
                "samples_required": MIN_SAMPLES,
            }

        vec = np.array([[float(features.get(name, 0.0)) for name in self.FEATURE_NAMES]])
        vec_scaled = self.scaler.transform(vec)

        # decision_function: negative = anomaly, positive = normal
        score = float(self.model.decision_function(vec_scaled)[0])
        is_anomaly = score < -0.5

        # Compute which features contributed most to anomaly
        contributing_features = []
        if is_anomaly:
            mean = self.scaler.mean_
            std = self.scaler.scale_
            for i, name in enumerate(self.FEATURE_NAMES):
                z = abs((vec[0][i] - mean[i]) / max(std[i], 1e-10))
                if z > 2.0:  # More than 2 std devs from mean
                    contributing_features.append({
                        "feature": name,
                        "value": round(float(vec[0][i]), 3),
                        "z_score": round(z, 2),
                    })

        return {
            "is_anomaly": is_anomaly,
            "score": round(score, 4),
            "threshold": -0.5,
            "contributing_features": contributing_features,
            "model_training_count": self.training_count,
            "buffer_size": len(self.telemetry_buffer),
        }

    def get_status(self) -> dict:
        """Return current engine status."""
        return {
            "engine": "isolation_forest_v1",
            "is_trained": self.is_trained,
            "training_count": self.training_count,
            "buffer_size": len(self.telemetry_buffer),
            "min_samples": MIN_SAMPLES,
            "last_train_time": self.last_train_time,
            "feature_names": self.FEATURE_NAMES,
            "model_path": str(MODEL_PATH),
            "has_sklearn": HAS_SKLEARN,
        }


# ── CLI interface for standalone testing ──
if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Kasbah Behavioral ML Engine")
    parser.add_argument("--collect", action="store_true", help="Collect one telemetry sample")
    parser.add_argument("--train", action="store_true", help="Train the model")
    parser.add_argument("--detect", action="store_true", help="Run anomaly detection")
    parser.add_argument("--status", action="store_true", help="Show engine status")
    parser.add_argument("--daemon", action="store_true", help="Run as daemon (collect every 30s, train every hour)")
    args = parser.parse_args()

    engine = BehavioralBaseline()

    if args.status:
        print(json.dumps(engine.get_status(), indent=2))

    elif args.collect:
        features = engine.collect_features()
        if features:
            engine.record(features)
            engine._save_state()
            print(json.dumps({"collected": features, "buffer_size": len(engine.telemetry_buffer)}, indent=2))
        else:
            print(json.dumps({"error": "Could not collect features. Is guard running?"}))

    elif args.train:
        result = engine.train()
        print(json.dumps(result, indent=2))

    elif args.detect:
        features = engine.collect_features()
        if features:
            engine.record(features)
            result = engine.detect_anomaly(features)
            print(json.dumps(result, indent=2))
        else:
            print(json.dumps({"error": "Could not collect features"}))

    elif args.daemon:
        print("[Kasbah ML] Behavioral daemon starting...")
        print(f"[Kasbah ML] Model trained: {engine.is_trained}, buffer: {len(engine.telemetry_buffer)}")
        collect_interval = 30  # seconds
        train_interval = 3600  # 1 hour
        last_train = time.time()

        while True:
            features = engine.collect_features()
            if features:
                engine.record(features)
                result = engine.detect_anomaly(features)
                if result.get("is_anomaly"):
                    print(f"[ANOMALY] score={result['score']}, features={result['contributing_features']}")

            # Retrain periodically
            if time.time() - last_train > train_interval:
                train_result = engine.train()
                print(f"[Kasbah ML] Retrain: {train_result}")
                last_train = time.time()

            engine._save_state()
            time.sleep(collect_interval)

    else:
        parser.print_help()
