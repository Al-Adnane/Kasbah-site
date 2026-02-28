/// Moat O: Three-Gate Execution Control
///
/// Interdependent thresholds for authorizing execution.
/// ALL three gates must pass simultaneously — failure of any one blocks execution.
///
/// Gates:
///   - Reliability (R): must be >= R_MIN (0.72)
///   - Brittleness (B): must be <= B_MAX (0.18)
///   - Harm potential (H): must be <= H_MAX (0.35)

/// Default gate thresholds (can be overridden per-org).
pub const R_MIN: f32 = 0.72;
pub const B_MAX: f32 = 0.18;
pub const H_MAX: f32 = 0.35;

/// Result of a three-gate authorization check.
#[derive(Debug, Clone, serde::Serialize)]
pub struct GateResult {
    pub authorized: bool,
    pub reliability_pass: bool,
    pub brittleness_pass: bool,
    pub harm_pass: bool,
    pub reliability: f32,
    pub brittleness: f32,
    pub harm: f32,
}

/// Check whether an execution request passes all three gates.
///
/// - `reliability`:  confidence the action will succeed correctly (0.0–1.0)
/// - `brittleness`:  probability the action causes cascading failure (0.0–1.0)
/// - `harm`:         estimated harm potential if action proceeds (0.0–1.0)
pub fn authorize_execution(reliability: f32, brittleness: f32, harm: f32) -> GateResult {
    let r_pass = reliability >= R_MIN;
    let b_pass = brittleness <= B_MAX;
    let h_pass = harm <= H_MAX;

    GateResult {
        authorized: r_pass && b_pass && h_pass,
        reliability_pass: r_pass,
        brittleness_pass: b_pass,
        harm_pass: h_pass,
        reliability,
        brittleness,
        harm,
    }
}

/// Check with custom thresholds (for enterprise per-org overrides).
pub fn authorize_execution_custom(
    reliability: f32,
    brittleness: f32,
    harm: f32,
    r_min: f32,
    b_max: f32,
    h_max: f32,
) -> GateResult {
    let r_pass = reliability >= r_min;
    let b_pass = brittleness <= b_max;
    let h_pass = harm <= h_max;

    GateResult {
        authorized: r_pass && b_pass && h_pass,
        reliability_pass: r_pass,
        brittleness_pass: b_pass,
        harm_pass: h_pass,
        reliability,
        brittleness,
        harm,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_all_pass() {
        let result = authorize_execution(0.9, 0.1, 0.2);
        assert!(result.authorized);
        assert!(result.reliability_pass);
        assert!(result.brittleness_pass);
        assert!(result.harm_pass);
    }

    #[test]
    fn test_reliability_fail() {
        let result = authorize_execution(0.5, 0.1, 0.2);
        assert!(!result.authorized);
        assert!(!result.reliability_pass);
        assert!(result.brittleness_pass);
        assert!(result.harm_pass);
    }

    #[test]
    fn test_brittleness_fail() {
        let result = authorize_execution(0.9, 0.5, 0.2);
        assert!(!result.authorized);
        assert!(result.reliability_pass);
        assert!(!result.brittleness_pass);
        assert!(result.harm_pass);
    }

    #[test]
    fn test_harm_fail() {
        let result = authorize_execution(0.9, 0.1, 0.8);
        assert!(!result.authorized);
        assert!(result.reliability_pass);
        assert!(result.brittleness_pass);
        assert!(!result.harm_pass);
    }

    #[test]
    fn test_all_fail() {
        let result = authorize_execution(0.1, 0.9, 0.9);
        assert!(!result.authorized);
        assert!(!result.reliability_pass);
        assert!(!result.brittleness_pass);
        assert!(!result.harm_pass);
    }

    #[test]
    fn test_boundary_exact() {
        let result = authorize_execution(R_MIN, B_MAX, H_MAX);
        assert!(result.authorized, "Exact boundary values should pass");
    }

    #[test]
    fn test_custom_thresholds() {
        // Stricter custom thresholds
        let result = authorize_execution_custom(0.9, 0.1, 0.2, 0.95, 0.05, 0.1);
        assert!(!result.authorized, "Should fail stricter custom thresholds");
    }
}
