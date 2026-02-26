// Kasbah Guard Desktop — lib.rs
// Re-export billing kernel for use in main.rs
pub use kasbah_kernel::BillingKernel;
pub use kasbah_kernel::PlanType;
pub use kasbah_kernel::InterventionLevel;
pub use kasbah_kernel::decide_intervention;
