/// Public Planet Partnerships (PPP) — 22 Nature Case Studies
///
/// Foundation module for ecosystem service credits, biosensor attestations,
/// and nature-data provenance. Each case study maps to a credit type that
/// can be issued, verified, and anchored on-chain.
///
/// This module provides the data types and validation logic. The actual
/// oracle integrations (satellite, IoT, sensor networks) are implemented
/// in the local-service layer.

use serde::{Deserialize, Serialize};

// ══════════════════════════════════════════════════════════════
// Credit Types — one per nature partnership domain
// ══════════════════════════════════════════════════════════════

/// The 12 ecosystem credit categories covering all 22 PPP case studies.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum CreditType {
    /// Tree-conomics: economic valuation of forest services
    EcosystemService,
    /// Beeodiversity: pollination monitoring via biosensors
    Pollination,
    /// Ocean Clean Up: ocean health via satellite + sensor data
    OceanHealth,
    /// Mangroves: coastal protection value
    CoastalProtection,
    /// Fungi + Dung Beetles: soil health metrics
    SoilHealth,
    /// NY Watershed: forest-water service credits
    WatershedService,
    /// Vultures + LanzaTech: waste-to-value conversion
    WasteManagement,
    /// Eel Energy + Microalgae: biomimicry renewable innovation
    Biomimicry,
    /// Breathe Easy: air purification by urban trees
    AirPurification,
    /// Microalgae Biofacade: building energy efficiency
    BioBuilding,
    /// LanzaTech Bacteria: industrial waste conversion
    IndustrialSymbiosis,
    /// Tree Monks: cultural stewardship and community conservation
    CulturalStewardship,
}

/// An ecosystem service credit issued by a nature partnership.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EcosystemCredit {
    pub id: String,
    pub credit_type: CreditType,
    pub issuer: String,
    pub beneficiary: String,
    pub value_usd: f64,
    pub co2_tonnes: f64,
    pub biodiversity_index: f32,
    pub issued_at_ms: u64,
    pub expires_at_ms: u64,
    pub oracle_source: String,
    pub verification_hash: String,
    pub is_revoked: bool,
}

// ══════════════════════════════════════════════════════════════
// Biosensor Attestations — animal/IoT sourced data proofs
// ══════════════════════════════════════════════════════════════

/// Attestation type for animal/IoT-sourced scientific data.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AttestationType {
    /// Seabird bio-logging: ocean data collection
    AnimalSourcedData,
    /// Pigeon Air Patrol: air quality IoT
    AnimalIoT,
    /// HeroRATs: animal-assisted detection (landmines)
    AnimalAssistedDetection,
    /// ICARUS: bird migration corridor tracking
    MigrationCorridor,
    /// Frog Census: citizen science biodiversity
    CitizenScience,
    /// Honeyguide Birds: human-animal mutualism
    Mutualism,
    /// Aboriginal Fire Hunting: regenerative land use
    RegenerativeUse,
}

/// A biosensor or animal-sourced data attestation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BiosensorAttestation {
    pub id: String,
    pub attestation_type: AttestationType,
    pub species: String,
    pub location_lat: f64,
    pub location_lon: f64,
    pub data_hash: String,
    pub welfare_certified: bool,
    pub timestamp_ms: u64,
    pub sensor_id: String,
    pub confidence: f32,
}

// ══════════════════════════════════════════════════════════════
// Nature Partnership Registry
// ══════════════════════════════════════════════════════════════

/// Tracks all 22 PPP case studies and their implementation status.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NaturePartnership {
    pub id: u8,
    pub name: String,
    pub nature_element: String,
    pub credit_type: CreditType,
    pub attestation_type: Option<AttestationType>,
    pub description: String,
}

/// Returns the complete registry of all 22 nature partnerships.
pub fn all_partnerships() -> Vec<NaturePartnership> {
    vec![
        NaturePartnership { id: 1, name: "Tree-conomics".into(), nature_element: "Trees".into(), credit_type: CreditType::EcosystemService, attestation_type: None, description: "Economic valuation of forest ecosystem services".into() },
        NaturePartnership { id: 2, name: "Beeodiversity".into(), nature_element: "Bees".into(), credit_type: CreditType::Pollination, attestation_type: Some(AttestationType::AnimalIoT), description: "Pollination monitoring via biosensor networks".into() },
        NaturePartnership { id: 3, name: "Nature's Prescriptions".into(), nature_element: "Medicinal plants".into(), credit_type: CreditType::Biomimicry, attestation_type: None, description: "Medicinal plant drug discovery credits".into() },
        NaturePartnership { id: 4, name: "The Ocean Clean Up".into(), nature_element: "Ocean currents".into(), credit_type: CreditType::OceanHealth, attestation_type: None, description: "Ocean health via satellite and sensor data".into() },
        NaturePartnership { id: 5, name: "Tsunami-Proof Mangroves".into(), nature_element: "Mangroves".into(), credit_type: CreditType::CoastalProtection, attestation_type: None, description: "Coastal protection value from mangrove forests".into() },
        NaturePartnership { id: 6, name: "Fungi Fight Hunger".into(), nature_element: "Mycorrhizal fungi".into(), credit_type: CreditType::SoilHealth, attestation_type: None, description: "Soil health via fungal inoculant proofs".into() },
        NaturePartnership { id: 7, name: "NY Watershed Agreement".into(), nature_element: "Forests".into(), credit_type: CreditType::WatershedService, attestation_type: None, description: "Forest-water service credits".into() },
        NaturePartnership { id: 8, name: "Frog Census".into(), nature_element: "Amphibians".into(), credit_type: CreditType::EcosystemService, attestation_type: Some(AttestationType::CitizenScience), description: "Citizen science biodiversity indexing".into() },
        NaturePartnership { id: 9, name: "Dung Beetles".into(), nature_element: "Beetles".into(), credit_type: CreditType::SoilHealth, attestation_type: Some(AttestationType::AnimalSourcedData), description: "Soil health via beetle activity metrics".into() },
        NaturePartnership { id: 10, name: "Bio-Logging Seabirds".into(), nature_element: "Seabirds".into(), credit_type: CreditType::OceanHealth, attestation_type: Some(AttestationType::AnimalSourcedData), description: "Ocean data collection via seabird bio-loggers".into() },
        NaturePartnership { id: 11, name: "IoT Pigeon Air Patrol".into(), nature_element: "Pigeons".into(), credit_type: CreditType::AirPurification, attestation_type: Some(AttestationType::AnimalIoT), description: "Air quality monitoring via pigeon-mounted IoT sensors".into() },
        NaturePartnership { id: 12, name: "Garbage-Fighting Vultures".into(), nature_element: "Vultures".into(), credit_type: CreditType::WasteManagement, attestation_type: Some(AttestationType::AnimalAssistedDetection), description: "Waste management via vulture carcass removal verification".into() },
        NaturePartnership { id: 13, name: "Eel Energy".into(), nature_element: "Eels".into(), credit_type: CreditType::Biomimicry, attestation_type: None, description: "Eel-inspired hydro turbine innovation credits".into() },
        NaturePartnership { id: 14, name: "Microalgae Biofacade".into(), nature_element: "Algae".into(), credit_type: CreditType::BioBuilding, attestation_type: None, description: "Building energy efficiency via algae biofacades".into() },
        NaturePartnership { id: 15, name: "HeroRATs".into(), nature_element: "Giant rats".into(), credit_type: CreditType::EcosystemService, attestation_type: Some(AttestationType::AnimalAssistedDetection), description: "Animal-assisted landmine and disease detection".into() },
        NaturePartnership { id: 16, name: "ICARUS".into(), nature_element: "Bird migration".into(), credit_type: CreditType::EcosystemService, attestation_type: Some(AttestationType::MigrationCorridor), description: "Global bird migration corridor tracking".into() },
        NaturePartnership { id: 17, name: "Breathe Easy".into(), nature_element: "Urban trees".into(), credit_type: CreditType::AirPurification, attestation_type: None, description: "Air purification credits from urban tree planting".into() },
        NaturePartnership { id: 18, name: "Soil Security".into(), nature_element: "Soil health".into(), credit_type: CreditType::SoilHealth, attestation_type: None, description: "Composite soil health index for food security".into() },
        NaturePartnership { id: 19, name: "LanzaTech Bacteria".into(), nature_element: "Bacteria".into(), credit_type: CreditType::IndustrialSymbiosis, attestation_type: None, description: "Industrial waste conversion via bacterial fermentation".into() },
        NaturePartnership { id: 20, name: "Tree Monks".into(), nature_element: "Buddhist monks".into(), credit_type: CreditType::CulturalStewardship, attestation_type: None, description: "Cultural stewardship and community forest conservation".into() },
        NaturePartnership { id: 21, name: "African Honeyguide Birds".into(), nature_element: "Honeyguide birds".into(), credit_type: CreditType::EcosystemService, attestation_type: Some(AttestationType::Mutualism), description: "Human-animal mutualism with GPS behavior verification".into() },
        NaturePartnership { id: 22, name: "Aboriginal Fire Hunting".into(), nature_element: "Fire management".into(), credit_type: CreditType::EcosystemService, attestation_type: Some(AttestationType::RegenerativeUse), description: "Regenerative fire management and land regeneration".into() },
    ]
}

// ══════════════════════════════════════════════════════════════
// Validation & Verification
// ══════════════════════════════════════════════════════════════

/// Verify an ecosystem credit is valid (not expired, not revoked).
pub fn verify_credit(credit: &EcosystemCredit) -> Result<(), String> {
    if credit.is_revoked {
        return Err("Credit has been revoked".into());
    }
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    if now > credit.expires_at_ms {
        return Err("Credit has expired".into());
    }
    if credit.value_usd <= 0.0 {
        return Err("Credit has no value".into());
    }
    Ok(())
}

/// Verify a biosensor attestation meets minimum confidence.
pub fn verify_attestation(attestation: &BiosensorAttestation, min_confidence: f32) -> Result<(), String> {
    if attestation.confidence < min_confidence {
        return Err(format!(
            "Confidence {:.2} below minimum {:.2}",
            attestation.confidence, min_confidence
        ));
    }
    if attestation.data_hash.is_empty() {
        return Err("Missing data hash".into());
    }
    Ok(())
}

// ══════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_all_22_partnerships() {
        let partnerships = all_partnerships();
        assert_eq!(partnerships.len(), 22);
        assert_eq!(partnerships[0].name, "Tree-conomics");
        assert_eq!(partnerships[21].name, "Aboriginal Fire Hunting");
    }

    #[test]
    fn test_credit_types_cover_all_domains() {
        let partnerships = all_partnerships();
        let types: std::collections::HashSet<String> = partnerships
            .iter()
            .map(|p| format!("{:?}", p.credit_type))
            .collect();
        assert!(types.len() >= 10, "Should have at least 10 unique credit types");
    }

    #[test]
    fn test_attestation_types_present() {
        let partnerships = all_partnerships();
        let with_attestation: Vec<_> = partnerships.iter().filter(|p| p.attestation_type.is_some()).collect();
        assert!(with_attestation.len() >= 8, "At least 8 case studies have attestation types");
    }

    #[test]
    fn test_verify_valid_credit() {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;
        let credit = EcosystemCredit {
            id: "test-001".into(),
            credit_type: CreditType::EcosystemService,
            issuer: "kasbah".into(),
            beneficiary: "forest-trust".into(),
            value_usd: 50.0,
            co2_tonnes: 1.5,
            biodiversity_index: 0.85,
            issued_at_ms: now,
            expires_at_ms: now + 86_400_000,
            oracle_source: "satellite".into(),
            verification_hash: "abc123".into(),
            is_revoked: false,
        };
        assert!(verify_credit(&credit).is_ok());
    }

    #[test]
    fn test_verify_revoked_credit() {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;
        let credit = EcosystemCredit {
            id: "test-002".into(),
            credit_type: CreditType::OceanHealth,
            issuer: "kasbah".into(),
            beneficiary: "ocean-org".into(),
            value_usd: 100.0,
            co2_tonnes: 0.0,
            biodiversity_index: 0.0,
            issued_at_ms: now,
            expires_at_ms: now + 86_400_000,
            oracle_source: "sensor".into(),
            verification_hash: "def456".into(),
            is_revoked: true,
        };
        assert!(verify_credit(&credit).is_err());
    }

    #[test]
    fn test_verify_attestation() {
        let att = BiosensorAttestation {
            id: "att-001".into(),
            attestation_type: AttestationType::AnimalSourcedData,
            species: "Procellariiformes".into(),
            location_lat: -33.8688,
            location_lon: 151.2093,
            data_hash: "sha256:abc".into(),
            welfare_certified: true,
            timestamp_ms: 1709000000000,
            sensor_id: "bio-logger-42".into(),
            confidence: 0.92,
        };
        assert!(verify_attestation(&att, 0.8).is_ok());
        assert!(verify_attestation(&att, 0.95).is_err());
    }

    #[test]
    fn test_serialize_roundtrip() {
        let credit = EcosystemCredit {
            id: "rt-001".into(),
            credit_type: CreditType::Biomimicry,
            issuer: "test".into(),
            beneficiary: "test".into(),
            value_usd: 25.0,
            co2_tonnes: 0.5,
            biodiversity_index: 0.7,
            issued_at_ms: 1000,
            expires_at_ms: 2000,
            oracle_source: "test".into(),
            verification_hash: "hash".into(),
            is_revoked: false,
        };
        let json = serde_json::to_string(&credit).unwrap();
        let back: EcosystemCredit = serde_json::from_str(&json).unwrap();
        assert_eq!(back.id, "rt-001");
        assert_eq!(back.credit_type, CreditType::Biomimicry);
    }
}
