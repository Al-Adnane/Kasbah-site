# ⚠️ Legacy Crate — DO NOT USE

This crate (`kasbah-kernel` v0.1.0) is **superseded** by the production crate at:
```
crates/kasbah-kernel/ (v1.0.0)
```

This legacy crate is explicitly **excluded from the workspace** in the root `Cargo.toml`:
```toml
exclude = ["crates/kernel"]
```

## Why it still exists

Kept for historical reference. The newer `crates/kasbah-kernel` (v1.0.0) is a complete rewrite with:
- 50+ secret detection patterns (vs ~5 here)
- System Integrity Index (SII) formula
- Three-gate execution authorization
- HMAC-SHA256 audit tickets
- Shannon entropy scoring
- 59 unit tests (vs 9 here)

## Status

- ❌ Not compiled (excluded from workspace)
- ❌ Not deployed
- ✅ Kept as reference only

Last updated: March 4, 2026
