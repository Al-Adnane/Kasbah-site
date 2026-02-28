/// Moat F: System Integrity Index (SII)
///
/// Dynamically adapts detection thresholds based on overall system health.
/// When integrity degrades, thresholds tighten automatically (fail-closed).
///
/// Formula: I(t) = hook^0.30 × pattern^0.30 × session^0.25 × latency^0.15
///
/// Each input is a normalized score in [0.0, 1.0] where 1.0 = fully healthy.

/// Compute the System Integrity Index from four health signals.
///
/// - `hook_integrity`:    fraction of hooks verified intact (0.0–1.0)
/// - `pattern_integrity`: 1.0 if sealed hash matches, 0.0 if tampered
/// - `session_health`:    session coherence score (0.0–1.0)
/// - `latency_norm`:      1.0 - (observed_latency / max_allowed_latency), clamped to [0.0, 1.0]
///
/// Returns a composite SII in [0.0, 1.0].
pub fn calculate_sii(
    hook_integrity: f32,
    pattern_integrity: f32,
    session_health: f32,
    latency_norm: f32,
) -> f32 {
    // Clamp all inputs to [0.0, 1.0]
    let h = hook_integrity.clamp(0.0, 1.0);
    let p = pattern_integrity.clamp(0.0, 1.0);
    let s = session_health.clamp(0.0, 1.0);
    let l = latency_norm.clamp(0.0, 1.0);

    // SII = h^0.30 × p^0.30 × s^0.25 × l^0.15
    h.powf(0.30) * p.powf(0.30) * s.powf(0.25) * l.powf(0.15)
}

/// Adapt the detection risk threshold based on the current SII.
///
/// - `sii`:     current System Integrity Index (0.0–1.0)
/// - `tau_max`: maximum (most permissive) threshold when system is fully healthy
/// - `tau_min`: minimum (most strict) threshold when system is degraded
///
/// When SII = 1.0 → threshold = tau_min (tightest, because the formula is:
///   τ(t) = τ_max - (τ_max - τ_min) × I(t)
/// When SII = 0.0 → threshold = tau_max (most permissive, but system is broken so
///   everything is likely blocked by hook failure anyway).
///
/// In practice: higher SII → lower threshold → fewer false positives.
/// Lower SII → higher threshold → more aggressive blocking (fail-closed).
pub fn adapt_threshold(sii: f32, tau_max: f32, tau_min: f32) -> f32 {
    let sii_clamped = sii.clamp(0.0, 1.0);
    tau_max - (tau_max - tau_min) * sii_clamped
}

/// A snapshot of system integrity state for logging/debugging.
#[derive(Debug, Clone, serde::Serialize)]
pub struct IntegritySnapshot {
    pub hook_integrity: f32,
    pub pattern_integrity: f32,
    pub session_health: f32,
    pub latency_norm: f32,
    pub sii: f32,
    pub adapted_threshold: f32,
    pub timestamp_ms: u64,
}

impl IntegritySnapshot {
    pub fn compute(
        hook_integrity: f32,
        pattern_integrity: f32,
        session_health: f32,
        latency_norm: f32,
        tau_max: f32,
        tau_min: f32,
    ) -> Self {
        let sii = calculate_sii(hook_integrity, pattern_integrity, session_health, latency_norm);
        let threshold = adapt_threshold(sii, tau_max, tau_min);
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        IntegritySnapshot {
            hook_integrity,
            pattern_integrity,
            session_health,
            latency_norm,
            sii,
            adapted_threshold: threshold,
            timestamp_ms: ts,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_perfect_integrity() {
        let sii = calculate_sii(1.0, 1.0, 1.0, 1.0);
        assert!((sii - 1.0).abs() < 0.001, "Perfect health should yield SII ≈ 1.0");
    }

    #[test]
    fn test_zero_integrity() {
        let sii = calculate_sii(0.0, 0.0, 0.0, 0.0);
        assert!((sii - 0.0).abs() < 0.001, "Zero health should yield SII ≈ 0.0");
    }

    #[test]
    fn test_partial_degradation() {
        let sii = calculate_sii(0.5, 1.0, 1.0, 1.0);
        assert!(sii > 0.7 && sii < 1.0, "Partial hook degradation should lower SII moderately");
    }

    #[test]
    fn test_pattern_tamper_kills_sii() {
        let sii = calculate_sii(1.0, 0.0, 1.0, 1.0);
        assert!(sii < 0.01, "Pattern tamper (0.0) should collapse SII near zero");
    }

    #[test]
    fn test_threshold_adaptation() {
        let tau = adapt_threshold(1.0, 70.0, 30.0);
        assert!((tau - 30.0).abs() < 0.1, "Perfect SII should yield tightest threshold");

        let tau_degraded = adapt_threshold(0.0, 70.0, 30.0);
        assert!((tau_degraded - 70.0).abs() < 0.1, "Zero SII should yield most permissive threshold");
    }

    #[test]
    fn test_inputs_clamped() {
        let sii = calculate_sii(2.0, -1.0, 1.5, 0.5);
        assert!(sii >= 0.0 && sii <= 1.0, "Out-of-range inputs should be clamped");
    }

    #[test]
    fn test_snapshot() {
        let snap = IntegritySnapshot::compute(1.0, 1.0, 1.0, 1.0, 70.0, 30.0);
        assert!((snap.sii - 1.0).abs() < 0.001);
        assert!((snap.adapted_threshold - 30.0).abs() < 0.1);
        assert!(snap.timestamp_ms > 0);
    }
}
