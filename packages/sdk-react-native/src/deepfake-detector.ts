/**
 * React Native SDK - Mobile deepfake detection
 *
 * Provides native bindings to Kasbah deepfake detection on iOS and Android.
 * Supports detection in video, image, and audio formats with batch processing.
 *
 * Usage:
 * ```typescript
 * const detector = new DeepfakeDetector();
 * const result = await detector.detectInImage(imageUri);
 * console.log(result.verdict); // 'deepfake' | 'authentic' | 'uncertain'
 * ```
 */

import { NativeModules, Platform } from 'react-native';

/**
 * Detection result for media analysis
 */
export interface DetectionResult {
  /** Verdict: deepfake, authentic, or uncertain */
  verdict: 'deepfake' | 'authentic' | 'uncertain';

  /** Confidence score 0-1 */
  confidence: number;

  /** Detailed analysis breakdown */
  analysis: {
    spatial_score: number;
    generator_attribution: GeneratorAttribution;
    calibrated_confidence: number;
    ethical_evaluation: EthicsEvaluation;
  };

  /** Timestamp of detection */
  timestamp: string;

  /** Processing time in milliseconds */
  processing_time_ms: number;
}

/**
 * Voice/audio detection result
 */
export interface VoiceDetectionResult {
  /** Verdict: synthetic or authentic */
  verdict: 'synthetic' | 'authentic' | 'uncertain';

  /** Confidence score 0-1 */
  confidence: number;

  /** Detected voice characteristics */
  voice_analysis: {
    pitch_consistency: number;
    formant_stability: number;
    breath_artifacts: number;
    prosody_naturalness: number;
  };

  /** Potential generator if synthetic */
  possible_generator?: string;

  /** Timestamp of detection */
  timestamp: string;

  /** Processing time in milliseconds */
  processing_time_ms: number;
}

/**
 * Generator attribution result
 */
export interface GeneratorAttribution {
  generator_name: string;
  generator_type: 'image' | 'audio' | 'video';
  vendor: string;
  confidence: number;
  alternative_generators: Array<[string, number]>;
}

/**
 * Ethical evaluation result
 */
export interface EthicsEvaluation {
  permissible: boolean;
  ethical_score: number;
  maqasid_scores: {
    hifz_nafs: number;      // Preservation of Life
    hifz_din: number;       // Preservation of Faith
    hifz_aql: number;       // Preservation of Intellect
    hifz_nasl: number;      // Preservation of Lineage
    hifz_mal: number;       // Preservation of Property
  };
}

/**
 * Configuration options for detector
 */
export interface DetectorConfig {
  /** Enable spatial intelligence analysis */
  enableSpatialAnalysis?: boolean;

  /** Enable generator attribution */
  enableGeneratorAttribution?: boolean;

  /** Enable confidence calibration */
  enableCalibration?: boolean;

  /** Enable ethical evaluation */
  enableEthicsEvaluation?: boolean;

  /** Confidence threshold for reporting */
  confidenceThreshold?: number;

  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Main detector class for React Native
 */
export class DeepfakeDetector {
  private nativeModule = NativeModules.DeepfakeDetectorModule;
  private config: DetectorConfig;

  constructor(config: Partial<DetectorConfig> = {}) {
    if (!this.nativeModule) {
      throw new Error(
        'DeepfakeDetectorModule not available. ' +
        'Ensure native module is properly linked in Xcode/Android Studio.'
      );
    }

    this.config = {
      enableSpatialAnalysis: true,
      enableGeneratorAttribution: true,
      enableCalibration: true,
      enableEthicsEvaluation: true,
      confidenceThreshold: 0.5,
      verbose: false,
      ...config
    };
  }

  /**
   * Detect deepfake in video file
   *
   * @param videoUri - URI to video file (file://, content://)
   * @returns Detection result
   * @throws Error if video cannot be accessed or processed
   */
  async detectInVideo(videoUri: string): Promise<DetectionResult> {
    try {
      const result = await this.nativeModule.detectDeepfakeInVideo(videoUri, this.config);
      return this._normalizeResult(result);
    } catch (error) {
      throw new Error(`Failed to detect deepfake in video: ${error}`);
    }
  }

  /**
   * Detect deepfake in image file
   *
   * @param imageUri - URI to image file (file://, content://)
   * @returns Detection result
   * @throws Error if image cannot be accessed or processed
   */
  async detectInImage(imageUri: string): Promise<DetectionResult> {
    try {
      const result = await this.nativeModule.detectDeepfakeInImage(imageUri, this.config);
      return this._normalizeResult(result);
    } catch (error) {
      throw new Error(`Failed to detect deepfake in image: ${error}`);
    }
  }

  /**
   * Detect voice synthesis in audio file
   *
   * @param audioUri - URI to audio file (file://, content://)
   * @returns Voice detection result
   * @throws Error if audio cannot be accessed or processed
   */
  async detectInAudio(audioUri: string): Promise<VoiceDetectionResult> {
    try {
      const result = await this.nativeModule.detectVoiceSynthesis(audioUri, this.config);
      return this._normalizeAudioResult(result);
    } catch (error) {
      throw new Error(`Failed to detect voice synthesis: ${error}`);
    }
  }

  /**
   * Batch detect deepfakes in multiple media files
   *
   * @param mediaUris - Array of URIs to check
   * @returns Array of detection results in same order as input
   */
  async batchDetect(mediaUris: string[]): Promise<DetectionResult[]> {
    try {
      const results = await this.nativeModule.batchDetect(mediaUris, this.config);
      return results.map((r: any) => this._normalizeResult(r));
    } catch (error) {
      throw new Error(`Failed to batch detect: ${error}`);
    }
  }

  /**
   * Stream detection progress for long operations
   *
   * @param mediaUri - URI to analyze
   * @param onProgress - Callback for progress updates (0-100)
   * @returns Final detection result
   */
  async detectWithProgress(
    mediaUri: string,
    onProgress: (progress: number) => void
  ): Promise<DetectionResult> {
    return new Promise((resolve, reject) => {
      this.nativeModule.detectWithProgress(
        mediaUri,
        this.config,
        (progress: number) => onProgress(progress),
        (result: any) => resolve(this._normalizeResult(result)),
        (error: any) => reject(new Error(`Detection failed: ${error}`))
      );
    });
  }

  /**
   * Get SDK version and capabilities
   */
  async getCapabilities(): Promise<{
    version: string;
    platform: 'ios' | 'android';
    supportedFormats: string[];
    maxFileSize: number;
  }> {
    return this.nativeModule.getCapabilities();
  }

  /**
   * Clear cache and free resources
   */
  async clearCache(): Promise<void> {
    return this.nativeModule.clearCache();
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(partialConfig: Partial<DetectorConfig>): void {
    this.config = { ...this.config, ...partialConfig };
  }

  /**
   * Normalize native result to standard format
   */
  private _normalizeResult(nativeResult: any): DetectionResult {
    return {
      verdict: nativeResult.verdict || 'uncertain',
      confidence: nativeResult.confidence || 0,
      analysis: {
        spatial_score: nativeResult.analysis?.spatial_score || 0,
        generator_attribution: nativeResult.analysis?.generator_attribution || {},
        calibrated_confidence: nativeResult.analysis?.calibrated_confidence || 0,
        ethical_evaluation: nativeResult.analysis?.ethical_evaluation || {}
      },
      timestamp: nativeResult.timestamp || new Date().toISOString(),
      processing_time_ms: nativeResult.processing_time_ms || 0
    };
  }

  /**
   * Normalize native audio result to standard format
   */
  private _normalizeAudioResult(nativeResult: any): VoiceDetectionResult {
    return {
      verdict: nativeResult.verdict || 'uncertain',
      confidence: nativeResult.confidence || 0,
      voice_analysis: {
        pitch_consistency: nativeResult.voice_analysis?.pitch_consistency || 0,
        formant_stability: nativeResult.voice_analysis?.formant_stability || 0,
        breath_artifacts: nativeResult.voice_analysis?.breath_artifacts || 0,
        prosody_naturalness: nativeResult.voice_analysis?.prosody_naturalness || 0
      },
      possible_generator: nativeResult.possible_generator,
      timestamp: nativeResult.timestamp || new Date().toISOString(),
      processing_time_ms: nativeResult.processing_time_ms || 0
    };
  }
}

export default DeepfakeDetector;
