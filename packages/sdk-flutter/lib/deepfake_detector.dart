/// Flutter SDK - Cross-platform deepfake detection
///
/// Provides unified API for deepfake detection on iOS and Android.
/// Supports detection in video, image, and audio formats.
///
/// Usage:
/// ```dart
/// final detector = DeepfakeDetector();
/// final result = await detector.detectInImage('file:///path/to/image.jpg');
/// print(result.verdict); // 'deepfake', 'authentic', or 'uncertain'
/// ```

import 'package:flutter/services.dart';

/// Verdict for deepfake detection
enum DetectionVerdict {
  deepfake,
  authentic,
  uncertain
}

/// Verdict for voice detection
enum VoiceVerdict {
  synthetic,
  authentic,
  uncertain
}

/// Generator attribution information
class GeneratorAttribution {
  final String generatorName;
  final String generatorType; // 'image', 'audio', 'video'
  final String vendor;
  final double confidence;
  final List<MapEntry<String, double>> alternativeGenerators;

  GeneratorAttribution({
    required this.generatorName,
    required this.generatorType,
    required this.vendor,
    required this.confidence,
    this.alternativeGenerators = const [],
  });

  factory GeneratorAttribution.fromMap(Map<dynamic, dynamic> map) {
    return GeneratorAttribution(
      generatorName: map['generator_name'] ?? 'unknown',
      generatorType: map['generator_type'] ?? 'image',
      vendor: map['vendor'] ?? 'unknown',
      confidence: (map['confidence'] ?? 0.0).toDouble(),
      alternativeGenerators: (map['alternative_generators'] as List?)
              ?.cast<Map<dynamic, dynamic>>()
              .map((e) => MapEntry(
                    e['name'] as String? ?? '',
                    (e['confidence'] as num?)?.toDouble() ?? 0.0,
                  ))
              .toList() ??
          [],
    );
  }
}

/// Maqasid (Islamic objectives) scores
class MaqasidScores {
  final double hifz_nafs;    // Preservation of Life
  final double hifz_din;     // Preservation of Faith
  final double hifz_aql;     // Preservation of Intellect
  final double hifz_nasl;    // Preservation of Lineage
  final double hifz_mal;     // Preservation of Property

  MaqasidScores({
    required this.hifz_nafs,
    required this.hifz_din,
    required this.hifz_aql,
    required this.hifz_nasl,
    required this.hifz_mal,
  });

  double get average => (hifz_nafs + hifz_din + hifz_aql + hifz_nasl + hifz_mal) / 5;

  factory MaqasidScores.fromMap(Map<dynamic, dynamic> map) {
    return MaqasidScores(
      hifz_nafs: (map['hifz_nafs'] ?? 0.5).toDouble(),
      hifz_din: (map['hifz_din'] ?? 0.5).toDouble(),
      hifz_aql: (map['hifz_aql'] ?? 0.5).toDouble(),
      hifz_nasl: (map['hifz_nasl'] ?? 0.5).toDouble(),
      hifz_mal: (map['hifz_mal'] ?? 0.5).toDouble(),
    );
  }
}

/// Ethics evaluation result
class EthicsEvaluation {
  final bool permissible;
  final double ethicalScore;
  final MaqasidScores maqasidScores;

  EthicsEvaluation({
    required this.permissible,
    required this.ethicalScore,
    required this.maqasidScores,
  });

  factory EthicsEvaluation.fromMap(Map<dynamic, dynamic> map) {
    return EthicsEvaluation(
      permissible: map['permissible'] ?? false,
      ethicalScore: (map['ethical_score'] ?? 0.0).toDouble(),
      maqasidScores: MaqasidScores.fromMap(map['maqasid_scores'] ?? {}),
    );
  }
}

/// Analysis breakdown
class Analysis {
  final double spatialScore;
  final GeneratorAttribution generatorAttribution;
  final double calibratedConfidence;
  final EthicsEvaluation ethicsEvaluation;

  Analysis({
    required this.spatialScore,
    required this.generatorAttribution,
    required this.calibratedConfidence,
    required this.ethicsEvaluation,
  });

  factory Analysis.fromMap(Map<dynamic, dynamic> map) {
    return Analysis(
      spatialScore: (map['spatial_score'] ?? 0.0).toDouble(),
      generatorAttribution: GeneratorAttribution.fromMap(map['generator_attribution'] ?? {}),
      calibratedConfidence: (map['calibrated_confidence'] ?? 0.0).toDouble(),
      ethicsEvaluation: EthicsEvaluation.fromMap(map['ethical_evaluation'] ?? {}),
    );
  }
}

/// Detection result for image/video
class DetectionResult {
  final DetectionVerdict verdict;
  final double confidence;
  final Analysis analysis;
  final DateTime timestamp;
  final int processingTimeMs;

  DetectionResult({
    required this.verdict,
    required this.confidence,
    required this.analysis,
    required this.timestamp,
    required this.processingTimeMs,
  });

  factory DetectionResult.fromMap(Map<dynamic, dynamic> map) {
    final verdictStr = map['verdict'] as String? ?? 'uncertain';
    final verdict = DetectionVerdict.values.firstWhere(
      (v) => v.toString().split('.').last == verdictStr,
      orElse: () => DetectionVerdict.uncertain,
    );

    return DetectionResult(
      verdict: verdict,
      confidence: (map['confidence'] ?? 0.0).toDouble(),
      analysis: Analysis.fromMap(map['analysis'] ?? {}),
      timestamp: map['timestamp'] != null
          ? DateTime.parse(map['timestamp'] as String)
          : DateTime.now(),
      processingTimeMs: (map['processing_time_ms'] ?? 0) as int,
    );
  }

  /// Is this result above the threshold?
  bool get isAboveThreshold => confidence > 0.5;

  /// Get human-readable verdict
  String get verdictLabel {
    switch (verdict) {
      case DetectionVerdict.deepfake:
        return 'Deepfake Detected';
      case DetectionVerdict.authentic:
        return 'Authentic Content';
      case DetectionVerdict.uncertain:
        return 'Cannot Determine';
    }
  }
}

/// Voice detection result
class VoiceDetectionResult {
  final VoiceVerdict verdict;
  final double confidence;
  final VoiceAnalysis voiceAnalysis;
  final String? possibleGenerator;
  final DateTime timestamp;
  final int processingTimeMs;

  VoiceDetectionResult({
    required this.verdict,
    required this.confidence,
    required this.voiceAnalysis,
    this.possibleGenerator,
    required this.timestamp,
    required this.processingTimeMs,
  });

  factory VoiceDetectionResult.fromMap(Map<dynamic, dynamic> map) {
    final verdictStr = map['verdict'] as String? ?? 'uncertain';
    final verdict = VoiceVerdict.values.firstWhere(
      (v) => v.toString().split('.').last == verdictStr,
      orElse: () => VoiceVerdict.uncertain,
    );

    return VoiceDetectionResult(
      verdict: verdict,
      confidence: (map['confidence'] ?? 0.0).toDouble(),
      voiceAnalysis: VoiceAnalysis.fromMap(map['voice_analysis'] ?? {}),
      possibleGenerator: map['possible_generator'] as String?,
      timestamp: map['timestamp'] != null
          ? DateTime.parse(map['timestamp'] as String)
          : DateTime.now(),
      processingTimeMs: (map['processing_time_ms'] ?? 0) as int,
    );
  }

  String get verdictLabel {
    switch (verdict) {
      case VoiceVerdict.synthetic:
        return 'AI-Generated Voice';
      case VoiceVerdict.authentic:
        return 'Authentic Voice';
      case VoiceVerdict.uncertain:
        return 'Uncertain';
    }
  }
}

/// Voice analysis details
class VoiceAnalysis {
  final double pitchConsistency;
  final double formantStability;
  final double breathArtifacts;
  final double prosodyNaturalness;

  VoiceAnalysis({
    required this.pitchConsistency,
    required this.formantStability,
    required this.breathArtifacts,
    required this.prosodyNaturalness,
  });

  factory VoiceAnalysis.fromMap(Map<dynamic, dynamic> map) {
    return VoiceAnalysis(
      pitchConsistency: (map['pitch_consistency'] ?? 0.0).toDouble(),
      formantStability: (map['formant_stability'] ?? 0.0).toDouble(),
      breathArtifacts: (map['breath_artifacts'] ?? 0.0).toDouble(),
      prosodyNaturalness: (map['prosody_naturalness'] ?? 0.0).toDouble(),
    );
  }
}

/// Detector configuration
class DetectorConfig {
  final bool enableSpatialAnalysis;
  final bool enableGeneratorAttribution;
  final bool enableCalibration;
  final bool enableEthicsEvaluation;
  final double confidenceThreshold;
  final bool verbose;

  DetectorConfig({
    this.enableSpatialAnalysis = true,
    this.enableGeneratorAttribution = true,
    this.enableCalibration = true,
    this.enableEthicsEvaluation = true,
    this.confidenceThreshold = 0.5,
    this.verbose = false,
  });

  Map<String, dynamic> toMap() => {
    'enableSpatialAnalysis': enableSpatialAnalysis,
    'enableGeneratorAttribution': enableGeneratorAttribution,
    'enableCalibration': enableCalibration,
    'enableEthicsEvaluation': enableEthicsEvaluation,
    'confidenceThreshold': confidenceThreshold,
    'verbose': verbose,
  };
}

/// Main detector class
class DeepfakeDetector {
  static const MethodChannel _channel =
      MethodChannel('com.kasbah.deepfake/detector');

  late DetectorConfig _config;

  DeepfakeDetector({DetectorConfig? config}) {
    _config = config ?? DetectorConfig();
  }

  /// Detect deepfake in video
  ///
  /// [videoPath] - Local file path or URI to video
  /// Returns [DetectionResult] with verdict and analysis
  Future<DetectionResult> detectInVideo(String videoPath) async {
    try {
      final Map<dynamic, dynamic> result = await _channel.invokeMethod(
        'detectVideo',
        {
          'path': videoPath,
          ...(_config.toMap()),
        },
      );
      return DetectionResult.fromMap(result.cast<String, dynamic>());
    } catch (e) {
      throw DeepfakeDetectionException(
        'Failed to detect deepfake in video: $e',
      );
    }
  }

  /// Detect deepfake in image
  ///
  /// [imagePath] - Local file path or URI to image
  /// Returns [DetectionResult] with verdict and analysis
  Future<DetectionResult> detectInImage(String imagePath) async {
    try {
      final Map<dynamic, dynamic> result = await _channel.invokeMethod(
        'detectImage',
        {
          'path': imagePath,
          ...(_config.toMap()),
        },
      );
      return DetectionResult.fromMap(result.cast<String, dynamic>());
    } catch (e) {
      throw DeepfakeDetectionException(
        'Failed to detect deepfake in image: $e',
      );
    }
  }

  /// Detect voice synthesis in audio
  ///
  /// [audioPath] - Local file path or URI to audio
  /// Returns [VoiceDetectionResult] with verdict and analysis
  Future<VoiceDetectionResult> detectInAudio(String audioPath) async {
    try {
      final Map<dynamic, dynamic> result = await _channel.invokeMethod(
        'detectAudio',
        {
          'path': audioPath,
          ...(_config.toMap()),
        },
      );
      return VoiceDetectionResult.fromMap(result.cast<String, dynamic>());
    } catch (e) {
      throw DeepfakeDetectionException(
        'Failed to detect voice synthesis: $e',
      );
    }
  }

  /// Batch detect multiple files
  ///
  /// [paths] - List of file paths/URIs
  /// Returns list of [DetectionResult] in same order as input
  Future<List<DetectionResult>> batchDetect(List<String> paths) async {
    try {
      final List<dynamic> results = await _channel.invokeMethod(
        'batchDetect',
        {
          'paths': paths,
          ...(_config.toMap()),
        },
      );
      return results
          .cast<Map<dynamic, dynamic>>()
          .map((m) => DetectionResult.fromMap(m.cast<String, dynamic>()))
          .toList();
    } catch (e) {
      throw DeepfakeDetectionException(
        'Failed to batch detect: $e',
      );
    }
  }

  /// Stream detection with progress updates
  ///
  /// [path] - File path/URI to analyze
  /// [onProgress] - Callback for progress (0-100)
  /// Returns final [DetectionResult]
  Future<DetectionResult> detectWithProgress(
    String path, {
    required void Function(int progress) onProgress,
  }) async {
    try {
      final Map<dynamic, dynamic> result = await _channel.invokeMethod(
        'detectWithProgress',
        {
          'path': path,
          ...(_config.toMap()),
        },
      );
      return DetectionResult.fromMap(result.cast<String, dynamic>());
    } catch (e) {
      throw DeepfakeDetectionException(
        'Failed to detect with progress: $e',
      );
    }
  }

  /// Get SDK capabilities
  Future<Map<String, dynamic>> getCapabilities() async {
    try {
      final Map<dynamic, dynamic> capabilities =
          await _channel.invokeMethod('getCapabilities');
      return capabilities.cast<String, dynamic>();
    } catch (e) {
      throw DeepfakeDetectionException(
        'Failed to get capabilities: $e',
      );
    }
  }

  /// Clear cache and free resources
  Future<void> clearCache() async {
    try {
      await _channel.invokeMethod('clearCache');
    } catch (e) {
      throw DeepfakeDetectionException(
        'Failed to clear cache: $e',
      );
    }
  }

  /// Update configuration at runtime
  void updateConfig(DetectorConfig config) {
    _config = config;
  }
}

/// Custom exception for detection errors
class DeepfakeDetectionException implements Exception {
  final String message;

  DeepfakeDetectionException(this.message);

  @override
  String toString() => 'DeepfakeDetectionException: $message';
}
