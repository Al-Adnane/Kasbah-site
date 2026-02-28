/// Moat K: Capability-Based Access Control (ABAC)
///
/// Agents get explicit, time-bound capabilities — not roles.
/// Each capability specifies exactly what resource, what action,
/// with what limits, and when it expires.
///
/// Example: "agent can query customer_segments table, max 1000 rows, 1-hour TTL"

use crate::audit::now_ms;

/// A time-bound, revocable capability grant.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Capability {
    pub id: String,
    pub resource: String,
    pub action: String,
    pub max_rows: u32,
    pub expires_at: u64,
    pub is_revoked: bool,
    pub issued_at: u64,
    pub issuer: String,
}

/// A request that needs capability authorization.
#[derive(Debug, Clone)]
pub struct CapabilityRequest {
    pub resource: String,
    pub action: String,
    pub rows: u32,
}

impl Capability {
    /// Check if this capability is still valid (not expired, not revoked).
    pub fn is_valid(&self) -> bool {
        !self.is_revoked && now_ms() < self.expires_at
    }

    /// Check if this capability is expired.
    pub fn is_expired(&self) -> bool {
        now_ms() >= self.expires_at
    }

    /// Remaining TTL in milliseconds (0 if expired).
    pub fn remaining_ttl_ms(&self) -> u64 {
        let now = now_ms();
        if now >= self.expires_at {
            0
        } else {
            self.expires_at - now
        }
    }
}

/// Issue a new capability with a TTL.
///
/// - `resource`: what the capability grants access to (e.g., "customer_segments")
/// - `action`: what operation is allowed (e.g., "query", "read", "write")
/// - `max_rows`: row limit for the operation
/// - `ttl_ms`: time-to-live in milliseconds
/// - `issuer`: who is granting this capability
pub fn issue_capability(
    resource: &str,
    action: &str,
    max_rows: u32,
    ttl_ms: u64,
    issuer: &str,
) -> Capability {
    let now = now_ms();
    Capability {
        id: uuid::Uuid::new_v4().to_string(),
        resource: resource.to_string(),
        action: action.to_string(),
        max_rows,
        expires_at: now.saturating_add(ttl_ms),
        is_revoked: false,
        issued_at: now,
        issuer: issuer.to_string(),
    }
}

/// Revoke a capability (mutation — caller must persist the change).
pub fn revoke_capability(cap: &mut Capability) {
    cap.is_revoked = true;
}

/// Check whether a request is authorized by a given capability.
///
/// Returns `Ok(())` if authorized, `Err(reason)` if denied.
pub fn check_capability(request: &CapabilityRequest, cap: &Capability) -> Result<(), String> {
    if cap.is_revoked {
        return Err("Capability has been revoked".to_string());
    }
    if cap.is_expired() {
        return Err(format!(
            "Capability expired at {}",
            cap.expires_at
        ));
    }
    if request.resource != cap.resource {
        return Err(format!(
            "Resource mismatch: requested '{}', capability grants '{}'",
            request.resource, cap.resource
        ));
    }
    if request.action != cap.action {
        return Err(format!(
            "Action mismatch: requested '{}', capability grants '{}'",
            request.action, cap.action
        ));
    }
    if request.rows > cap.max_rows {
        return Err(format!(
            "Row limit exceeded: requested {}, max allowed {}",
            request.rows, cap.max_rows
        ));
    }
    Ok(())
}

/// Check a request against a list of capabilities. Returns Ok if ANY capability matches.
pub fn check_capabilities(
    request: &CapabilityRequest,
    capabilities: &[Capability],
) -> Result<String, String> {
    for cap in capabilities {
        if check_capability(request, cap).is_ok() {
            return Ok(cap.id.clone());
        }
    }
    Err("No valid capability found for this request".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_request(resource: &str, action: &str, rows: u32) -> CapabilityRequest {
        CapabilityRequest {
            resource: resource.to_string(),
            action: action.to_string(),
            rows,
        }
    }

    #[test]
    fn test_issue_and_check() {
        let cap = issue_capability("customer_segments", "query", 1000, 3600_000, "admin");
        let req = make_request("customer_segments", "query", 500);
        assert!(check_capability(&req, &cap).is_ok());
    }

    #[test]
    fn test_wrong_resource() {
        let cap = issue_capability("customer_segments", "query", 1000, 3600_000, "admin");
        let req = make_request("financial_records", "query", 500);
        assert!(check_capability(&req, &cap).is_err());
    }

    #[test]
    fn test_wrong_action() {
        let cap = issue_capability("customer_segments", "query", 1000, 3600_000, "admin");
        let req = make_request("customer_segments", "delete", 500);
        assert!(check_capability(&req, &cap).is_err());
    }

    #[test]
    fn test_row_limit_exceeded() {
        let cap = issue_capability("customer_segments", "query", 1000, 3600_000, "admin");
        let req = make_request("customer_segments", "query", 5000);
        let result = check_capability(&req, &cap);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Row limit"));
    }

    #[test]
    fn test_revoked() {
        let mut cap = issue_capability("data", "read", 100, 3600_000, "admin");
        revoke_capability(&mut cap);
        let req = make_request("data", "read", 50);
        assert!(check_capability(&req, &cap).is_err());
    }

    #[test]
    fn test_expired() {
        let mut cap = issue_capability("data", "read", 100, 0, "admin");
        // TTL = 0, so it expires immediately
        cap.expires_at = now_ms().saturating_sub(1000); // force expired
        let req = make_request("data", "read", 50);
        assert!(check_capability(&req, &cap).is_err());
    }

    #[test]
    fn test_valid_check() {
        let cap = issue_capability("data", "read", 100, 3600_000, "admin");
        assert!(cap.is_valid());
        assert!(!cap.is_expired());
        assert!(cap.remaining_ttl_ms() > 0);
    }

    #[test]
    fn test_multiple_capabilities() {
        let cap1 = issue_capability("users", "read", 100, 3600_000, "admin");
        let cap2 = issue_capability("finance", "query", 50, 3600_000, "admin");
        let caps = vec![cap1, cap2.clone()];

        let req = make_request("finance", "query", 25);
        let result = check_capabilities(&req, &caps);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), cap2.id);
    }
}
