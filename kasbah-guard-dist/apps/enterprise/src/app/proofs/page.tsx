'use client';

import { useState, useEffect } from 'react';

const API = 'https://api.bekasbah.com';

interface Proof {
  proof_id: string;
  proof_type: string;
  created_at: string;
  model_id: string;
  risk_score: number;
  decision: string;
  verified: boolean;
}

function RiskBadge({ score }: { score: number }) {
  const color = score >= 0.7 ? '#ef4444' : score >= 0.4 ? '#f59e0b' : '#22c55e';
  const label = score >= 0.7 ? 'HIGH' : score >= 0.4 ? 'WARN' : 'LOW';
  return (
    <span style={{
      background: color + '22', color, border: `1px solid ${color}`,
      borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700,
      fontFamily: 'monospace',
    }}>{label} {(score * 100).toFixed(0)}%</span>
  );
}

function VerifiedBadge({ verified }: { verified: boolean }) {
  return (
    <span style={{
      background: verified ? '#22c55e22' : '#ef444422',
      color: verified ? '#22c55e' : '#ef4444',
      border: `1px solid ${verified ? '#22c55e' : '#ef4444'}`,
      borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700,
    }}>
      {verified ? '✓ VERIFIED' : '✗ INVALID'}
    </span>
  );
}

export default function ProofsPage() {
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [newProof, setNewProof] = useState<Proof | null>(null);
  const [error, setError] = useState<string | null>(null);

  const token = typeof window !== 'undefined' ? localStorage.getItem('kasbah_token') : null;

  useEffect(() => { fetchProofs(); }, []);

  async function fetchProofs() {
    try {
      setLoading(true);
      const res = await fetch(`${API}/api/proofs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProofs(data.proofs ?? []);
      }
    } catch {
      // API may not have /proofs list yet — show empty
      setProofs([]);
    } finally {
      setLoading(false);
    }
  }

  async function generateProof() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/proofs/generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          detection_result: {
            model_id: 'detector-js-v1.0.0',
            risk_score: 0.12,
            decision: 'ALLOW',
            timestamp: Date.now(),
            content_hash: Array.from(crypto.getRandomValues(new Uint8Array(16)))
              .map(b => b.toString(16).padStart(2, '0')).join(''),
          },
        }),
      });
      if (res.ok) {
        const proof = await res.json();
        setNewProof(proof);
        await fetchProofs();
      } else {
        setError('Proof generation failed — API may be offline.');
      }
    } catch {
      setError('Cannot reach API. Check connection.');
    } finally {
      setGenerating(false);
    }
  }

  async function verifyProof(proofId: string) {
    setVerifying(proofId);
    try {
      const res = await fetch(`${API}/api/proofs/verify/${proofId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const result = await res.json();
        setProofs(prev => prev.map(p =>
          p.proof_id === proofId ? { ...p, verified: result.verified } : p
        ));
      }
    } catch {
      // silently fail — show last known state
    } finally {
      setVerifying(null);
    }
  }

  const card = {
    background: '#1a1a2e', border: '1px solid #2a2a4a',
    borderRadius: 12, padding: 24, marginBottom: 24,
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0f0f1a', color: '#f8f9fa', padding: 32 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <a href="/" style={{ color: '#C1440E', fontSize: 13, textDecoration: 'none' }}>← Dashboard</a>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: '8px 0 4px', color: '#f8f9fa' }}>
            ZK Proofs
          </h1>
          <p style={{ color: '#8888aa', margin: 0, fontSize: 14 }}>
            Zero-knowledge proofs for detection result integrity
          </p>
        </div>
        <button
          onClick={generateProof}
          disabled={generating}
          style={{
            background: generating ? '#444' : '#C1440E',
            color: '#fff', border: 'none', borderRadius: 8,
            padding: '12px 24px', fontSize: 14, fontWeight: 600,
            cursor: generating ? 'not-allowed' : 'pointer',
          }}
        >
          {generating ? 'Generating…' : '+ Generate Proof'}
        </button>
      </div>

      {error && (
        <div style={{ ...card, background: '#2a1010', borderColor: '#ef4444', color: '#fca5a5', marginBottom: 24 }}>
          ⚠ {error}
        </div>
      )}

      {/* New proof banner */}
      {newProof && (
        <div style={{ ...card, background: '#0a1f0a', borderColor: '#22c55e' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 20 }}>✓</span>
            <span style={{ fontWeight: 600, color: '#22c55e' }}>Proof Generated Successfully</span>
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#888' }}>
            <div><b style={{ color: '#aaa' }}>Proof ID:</b> {newProof.proof_id}</div>
            <div style={{ marginTop: 8, wordBreak: 'break-all' }}>
              <b style={{ color: '#aaa' }}>Bytes (hex):</b>{' '}
              <span style={{ color: '#22c55e' }}>{newProof.proof_bytes_hex?.slice(0, 64)}…</span>
            </div>
            <div style={{ marginTop: 8, wordBreak: 'break-all' }}>
              <b style={{ color: '#aaa' }}>Public Inputs:</b>{' '}
              <span style={{ color: '#22c55e' }}>{newProof.public_inputs_hex?.slice(0, 64)}…</span>
            </div>
            <div style={{ marginTop: 8 }}>
              <b style={{ color: '#aaa' }}>Type:</b> {newProof.proof_type ?? 'merkle-sha256'}
            </div>
          </div>
        </div>
      )}

      {/* Explainer */}
      <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
        {[
          { icon: '🔐', title: 'Privacy-Preserving', desc: 'Prove detection happened without revealing content' },
          { icon: '⛓', title: 'Audit Integrity', desc: 'Merkle proofs ensure audit trail cannot be tampered' },
          { icon: '⚡', title: 'Fast Verification', desc: 'Sub-second proof verification, no blockchain needed' },
        ].map(({ icon, title, desc }) => (
          <div key={title} style={{ textAlign: 'center', padding: 16 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{title}</div>
            <div style={{ color: '#8888aa', fontSize: 13 }}>{desc}</div>
          </div>
        ))}
      </div>

      {/* Proof table */}
      <div style={card}>
        <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 600 }}>
          Proof Registry
          {proofs.length > 0 && (
            <span style={{ marginLeft: 10, fontSize: 13, color: '#8888aa', fontWeight: 400 }}>
              {proofs.length} proof{proofs.length !== 1 ? 's' : ''}
            </span>
          )}
        </h2>

        {loading ? (
          <div style={{ color: '#8888aa', padding: '40px 0', textAlign: 'center' }}>Loading proofs…</div>
        ) : proofs.length === 0 ? (
          <div style={{ color: '#8888aa', padding: '40px 0', textAlign: 'center' }}>
            No proofs yet. Generate your first proof above.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: '#8888aa', textAlign: 'left' }}>
                {['Proof ID', 'Model', 'Decision', 'Risk', 'Status', 'Created', 'Action'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', borderBottom: '1px solid #2a2a4a', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {proofs.map(p => (
                <tr key={p.proof_id} style={{ borderBottom: '1px solid #1f1f3a' }}>
                  <td style={{ padding: '12px', fontFamily: 'monospace', color: '#aaa', fontSize: 11 }}>
                    {p.proof_id.slice(0, 8)}…
                  </td>
                  <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: 11 }}>{p.model_id}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{
                      color: p.decision === 'ALLOW' ? '#22c55e' : p.decision === 'WARN' ? '#f59e0b' : '#ef4444',
                      fontFamily: 'monospace', fontWeight: 600, fontSize: 12,
                    }}>{p.decision}</span>
                  </td>
                  <td style={{ padding: '12px' }}><RiskBadge score={p.risk_score} /></td>
                  <td style={{ padding: '12px' }}><VerifiedBadge verified={p.verified} /></td>
                  <td style={{ padding: '12px', color: '#8888aa', fontSize: 11 }}>
                    {new Date(p.created_at).toLocaleString()}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <button
                      onClick={() => verifyProof(p.proof_id)}
                      disabled={verifying === p.proof_id}
                      style={{
                        background: 'transparent', border: '1px solid #C1440E',
                        color: '#C1440E', borderRadius: 4, padding: '4px 12px',
                        fontSize: 12, cursor: 'pointer',
                      }}
                    >
                      {verifying === p.proof_id ? 'Verifying…' : 'Verify'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* How it works */}
      <div style={card}>
        <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 600 }}>How ZK Proofs Work in Kasbah Guard</h2>
        <ol style={{ color: '#8888aa', lineHeight: 2, paddingLeft: 20, margin: 0, fontSize: 14 }}>
          <li>Detection runs locally (detector.js v1.0.0 or kasbah-kernel)</li>
          <li>Result fields (model_id, risk_score, decision, timestamp, content_hash) are hashed with SHA-256</li>
          <li>A Merkle tree is built over these hashes → root hash = proof commitment</li>
          <li>Proof bytes contain the Merkle path from leaf to root</li>
          <li>Anyone can verify: recompute Merkle root from public inputs, compare to committed root</li>
          <li>The original content is <b style={{ color: '#f8f9fa' }}>never revealed</b> — only its hash</li>
        </ol>
      </div>
    </div>
  );
}
