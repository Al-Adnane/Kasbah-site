/// Utility functions for ZK operations

use sha2::{Sha256, Digest};

pub fn hash_data(data: &[u8]) -> Vec<u8> {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hasher.finalize().to_vec()
}

pub fn merkle_hash(left: &[u8], right: &[u8]) -> Vec<u8> {
    let mut data = Vec::new();
    data.extend_from_slice(left);
    data.extend_from_slice(right);
    hash_data(&data)
}
