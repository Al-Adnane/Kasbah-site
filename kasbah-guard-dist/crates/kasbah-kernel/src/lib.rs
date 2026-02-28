pub mod policy;
pub mod redact;
pub mod audit;
pub mod integrity;
pub mod gate;
pub mod capabilities;
pub mod telemetry;
pub mod evolution;
pub mod partnership;

pub use policy::policy_preflight;
pub use redact::{Finding, redact_text};
pub use audit::{content_hash, create_ticket, verify_ticket};
pub use integrity::{calculate_sii, adapt_threshold, IntegritySnapshot};
pub use gate::{authorize_execution, GateResult, R_MIN, B_MAX, H_MAX};
pub use capabilities::{
    Capability, CapabilityRequest, issue_capability, revoke_capability,
    check_capability, check_capabilities,
};

#[cfg(feature = "sqlite")]
pub use audit::{append_audit, init_audit_db};
