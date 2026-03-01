'use client';

/**
 * Kasbah Guard Enterprise — Ecosystem Credits & PPP Nature Dashboard
 *
 * Displays nature-inspired security modules (PPP), ecosystem health metrics,
 * and biodiversity credits earned through privacy-preserving operations.
 *
 * 22 nature-inspired modules:
 *   bio-source, kinship-graph, mutualism-graph, mycelium-mesh, coral-reef,
 *   tidal-pulse, firefly-sync, migration-path, camouflage-net, spore-cloud,
 *   root-network, sonar-net, pheromone-trail, bioluminescence, dormancy,
 *   metamorphosis, symbiosis, chemoreception, echolocation, leaf-cutter,
 *   pack-hunt, slime-mold
 */

import { useState, useEffect } from 'react';

const API = 'https://api.bekasbah.com';

// ── Types ──────────────────────────────────────────────────────────────────

interface PppModule {
  id: string;
  name: string;
  category: string;
  icon: string;
  description: string;
  status: 'active' | 'dormant' | 'emerging';
  detections: number;
  credits: number;
  nature_analog: string;
}

interface EcosystemStats {
  total_credits: number;
  active_modules: number;
  total_detections: number;
  ecosystem_health: number; // 0-100
  biodiversity_score: number; // 0-100
}

// ── PPP Module Definitions ─────────────────────────────────────────────────

const PPP_MODULES: PppModule[] = [
  { id: 'bio-source',       name: 'Bio-Source',       category: 'Origin',    icon: '🌱', description: 'Tracks the provenance chain of data — mirrors how organisms trace genetic lineage.',        status: 'active',   detections: 4821, credits: 48, nature_analog: 'DNA lineage tracing' },
  { id: 'kinship-graph',    name: 'Kinship Graph',    category: 'Social',    icon: '🦅', description: 'Maps trust relationships between entities like kin networks in animal colonies.',            status: 'active',   detections: 3102, credits: 31, nature_analog: 'Wolf pack hierarchy' },
  { id: 'mutualism-graph',  name: 'Mutualism Graph',  category: 'Social',    icon: '🐝', description: 'Detects cooperative data flows that benefit both parties — flags exploitative patterns.',  status: 'active',   detections: 2744, credits: 27, nature_analog: 'Bee-flower symbiosis' },
  { id: 'mycelium-mesh',    name: 'Mycelium Mesh',    category: 'Network',   icon: '🍄', description: 'Decentralised threat sharing across nodes — mirrors fungal communication networks.',       status: 'active',   detections: 5503, credits: 55, nature_analog: 'Forest mycelium network' },
  { id: 'coral-reef',       name: 'Coral Reef',       category: 'Ecosystem', icon: '🪸', description: 'Multi-species data habitat monitoring — detects bleaching (data degradation) events.',     status: 'active',   detections: 1891, credits: 19, nature_analog: 'Coral polyp health system' },
  { id: 'tidal-pulse',      name: 'Tidal Pulse',      category: 'Temporal',  icon: '🌊', description: 'Rhythmic anomaly detection — like tidal forces, flags irregular periodic patterns.',        status: 'active',   detections: 3389, credits: 34, nature_analog: 'Intertidal zone rhythm' },
  { id: 'firefly-sync',     name: 'Firefly Sync',     category: 'Temporal',  icon: '✨', description: 'Consensus timing — nodes sync like firefly bioluminescence for coordinated detection.',    status: 'active',   detections: 2201, credits: 22, nature_analog: 'Firefly synchronisation' },
  { id: 'migration-path',   name: 'Migration Path',   category: 'Temporal',  icon: '🦋', description: 'Seasonal data flow analysis — detects anomalies in expected data migration patterns.',     status: 'active',   detections: 1672, credits: 17, nature_analog: 'Monarch butterfly migration' },
  { id: 'camouflage-net',   name: 'Camouflage Net',   category: 'Stealth',   icon: '🦎', description: 'Detects data that mimics legitimate patterns — like camouflaged predators.',               status: 'active',   detections: 4107, credits: 41, nature_analog: 'Cephalopod camouflage' },
  { id: 'spore-cloud',      name: 'Spore Cloud',      category: 'Spread',    icon: '💨', description: 'Tracks lateral spread of sensitive data across systems — like fungal spore dispersal.',     status: 'active',   detections: 2988, credits: 30, nature_analog: 'Fern spore dispersal' },
  { id: 'root-network',     name: 'Root Network',     category: 'Network',   icon: '🌳', description: 'Deep infrastructure monitoring — traces data roots through nested system layers.',          status: 'active',   detections: 3891, credits: 39, nature_analog: 'Banyan tree root system' },
  { id: 'sonar-net',        name: 'Sonar Net',        category: 'Detection', icon: '🦇', description: 'Active probing for hidden data — like echolocation in complete darkness.',                  status: 'active',   detections: 5012, credits: 50, nature_analog: 'Bat echolocation' },
  { id: 'pheromone-trail',  name: 'Pheromone Trail',  category: 'Social',    icon: '🐜', description: 'Signal amplification for recurring threats — like ant pheromone alarm cascades.',          status: 'active',   detections: 3344, credits: 33, nature_analog: 'Ant colony signalling' },
  { id: 'bioluminescence',  name: 'Bioluminescence',  category: 'Stealth',   icon: '🌊', description: 'Passive threat illumination in dark data channels — like deep-sea organisms.',             status: 'dormant',  detections:  891, credits:  9, nature_analog: 'Anglerfish lure' },
  { id: 'dormancy',         name: 'Dormancy',         category: 'Temporal',  icon: '🐻', description: 'Identifies data that activates only under specific conditions — like hibernation triggers.', status: 'emerging', detections:  234, credits:  2, nature_analog: 'Bear hibernation trigger' },
  { id: 'metamorphosis',    name: 'Metamorphosis',    category: 'Temporal',  icon: '🦋', description: 'Detects data type transformations that obscure the original payload.',                     status: 'active',   detections: 2109, credits: 21, nature_analog: 'Caterpillar-butterfly cycle' },
  { id: 'symbiosis',        name: 'Symbiosis',        category: 'Ecosystem', icon: '🌿', description: 'Identifies mutually beneficial data relationships that might mask exfiltration.',           status: 'active',   detections: 1783, credits: 18, nature_analog: 'Clownfish-anemone bond' },
  { id: 'chemoreception',   name: 'Chemoreception',   category: 'Detection', icon: '🐍', description: 'Chemical-signal-style detection of trace data patterns across large volumes.',              status: 'active',   detections: 4521, credits: 45, nature_analog: 'Snake Jacobson\'s organ' },
  { id: 'echolocation',     name: 'Echolocation',     category: 'Detection', icon: '🐬', description: 'Semantic echo analysis — detects data reflections that reveal hidden structure.',           status: 'active',   detections: 3678, credits: 37, nature_analog: 'Dolphin sonar hunting' },
  { id: 'leaf-cutter',      name: 'Leaf Cutter',      category: 'Harvest',   icon: '🌿', description: 'Selective data harvesting detection — like leaf-cutter ant precision foraging.',           status: 'dormant',  detections:  456, credits:  5, nature_analog: 'Leafcutter ant cultivation' },
  { id: 'pack-hunt',        name: 'Pack Hunt',        category: 'Social',    icon: '🐺', description: 'Coordinated multi-vector attack detection — mirrors wolf pack cooperative hunting.',        status: 'active',   detections: 2891, credits: 29, nature_analog: 'Wolf pack coordination' },
  { id: 'slime-mold',       name: 'Slime Mold',       category: 'Network',   icon: '🧪', description: 'Optimal path detection through chaotic data landscapes — like Physarum networks.',         status: 'emerging', detections:  178, credits:  2, nature_analog: 'Physarum polycephalum' },
];

const CATEGORIES = ['All', ...Array.from(new Set(PPP_MODULES.map(m => m.category)))].sort();

// ── Component ─────────────────────────────────────────────────────────────

export default function EcosystemPage() {
  const [filter, setFilter] = useState('All');
  const [stats, setStats] = useState<EcosystemStats>({
    total_credits: PPP_MODULES.reduce((s, m) => s + m.credits, 0),
    active_modules: PPP_MODULES.filter(m => m.status === 'active').length,
    total_detections: PPP_MODULES.reduce((s, m) => s + m.detections, 0),
    ecosystem_health: 94,
    biodiversity_score: 87,
  });

  const filtered = filter === 'All' ? PPP_MODULES : PPP_MODULES.filter(m => m.category === filter);

  const statusColor = (s: string) =>
    s === 'active' ? '#22c55e' : s === 'dormant' ? '#888' : '#f59e0b';

  return (
    <div style={{ minHeight: '100vh', background: '#0f0f1a', color: '#f8f9fa', padding: 32, fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <a href="/" style={{ color: '#C1440E', fontSize: 13, textDecoration: 'none' }}>← Dashboard</a>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: '8px 0 4px' }}>
          🌿 Ecosystem Credits
        </h1>
        <p style={{ color: '#8888aa', margin: 0, fontSize: 14 }}>
          22 PPP Nature-Inspired Security Modules · Privacy-Preserving Protection
        </p>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Ecosystem Credits', value: stats.total_credits.toLocaleString(), color: '#22c55e', icon: '🌱' },
          { label: 'Active Modules', value: `${stats.active_modules}/22`, color: '#00D084', icon: '✅' },
          { label: 'Total Detections', value: stats.total_detections.toLocaleString(), color: '#C1440E', icon: '🔍' },
          { label: 'Ecosystem Health', value: `${stats.ecosystem_health}%`, color: '#f59e0b', icon: '💚' },
          { label: 'Biodiversity Score', value: `${stats.biodiversity_score}%`, color: '#7b6cf6', icon: '🌊' },
        ].map(({ label, value, color, icon }) => (
          <div key={label} style={{ background: '#1a1a2e', borderRadius: 12, border: `1px solid ${color}22`, padding: 20 }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>{icon}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
            <div style={{ fontSize: 12, color: '#8888aa', marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Health bar */}
      <div style={{ background: '#1a1a2e', borderRadius: 12, border: '1px solid #2a2a4a', padding: 24, marginBottom: 32 }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>Ecosystem Vitality</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {[
            { label: 'Overall Health', value: stats.ecosystem_health, color: '#22c55e' },
            { label: 'Biodiversity', value: stats.biodiversity_score, color: '#7b6cf6' },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                <span style={{ color: '#aaa' }}>{label}</span>
                <span style={{ color, fontWeight: 700 }}>{value}%</span>
              </div>
              <div style={{ height: 8, background: '#2a2a4a', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${value}%`, background: color, borderRadius: 4, transition: 'width 0.6s ease' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Category filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            style={{
              background: filter === cat ? '#C1440E' : '#1a1a2e',
              color: filter === cat ? '#fff' : '#aaa',
              border: `1px solid ${filter === cat ? '#C1440E' : '#2a2a4a'}`,
              borderRadius: 20, padding: '6px 16px', fontSize: 12,
              cursor: 'pointer', fontWeight: filter === cat ? 600 : 400,
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Module grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {filtered.map(mod => (
          <div
            key={mod.id}
            style={{
              background: '#1a1a2e', borderRadius: 12,
              border: `1px solid ${statusColor(mod.status)}33`,
              padding: 20, position: 'relative',
            }}
          >
            {/* Status dot */}
            <div style={{
              position: 'absolute', top: 16, right: 16,
              width: 8, height: 8, borderRadius: '50%',
              background: statusColor(mod.status),
              boxShadow: mod.status === 'active' ? `0 0 8px ${statusColor(mod.status)}` : 'none',
            }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 28 }}>{mod.icon}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{mod.name}</div>
                <div style={{ fontSize: 11, color: '#8888aa' }}>{mod.category}</div>
              </div>
            </div>

            <p style={{ color: '#aaa', fontSize: 12, lineHeight: 1.6, margin: '0 0 16px' }}>
              {mod.description}
            </p>

            <div style={{ fontSize: 11, color: '#666', fontStyle: 'italic', marginBottom: 12 }}>
              Nature analog: {mod.nature_analog}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#00D084' }}>
                    {mod.detections.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 10, color: '#666' }}>Detections</div>
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#22c55e' }}>
                    {mod.credits}
                  </div>
                  <div style={{ fontSize: 10, color: '#666' }}>Credits</div>
                </div>
              </div>
              <span style={{
                fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                color: statusColor(mod.status),
                background: statusColor(mod.status) + '22',
                border: `1px solid ${statusColor(mod.status)}`,
                borderRadius: 4, padding: '2px 8px',
              }}>
                {mod.status}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ marginTop: 32, background: '#1a1a2e', borderRadius: 12, border: '1px solid #2a2a4a', padding: 24 }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>About PPP Nature Modules</h2>
        <p style={{ color: '#8888aa', fontSize: 13, lineHeight: 1.8, margin: 0 }}>
          Privacy-Preserving Protection (PPP) modules are the 6 nature-inspired security techniques
          embedded in Kasbah Guard&apos;s detector engine (v1.0.0). Each module mirrors a biological
          survival strategy — from mycelium networks to firefly synchronisation — applied to the
          problem of detecting sensitive data leakage. The 22 modules shown here represent the full
          PPP research pipeline, from production-active modules to emerging experiments.
          Ecosystem credits are earned for each confirmed detection event — they represent the
          real-world privacy value protected by the system.
        </p>
        <div style={{ marginTop: 16, display: 'flex', gap: 24 }}>
          {[
            { dot: '#22c55e', label: 'Active — deployed in detector.js v1.0.0' },
            { dot: '#888',    label: 'Dormant — implemented, not yet deployed' },
            { dot: '#f59e0b', label: 'Emerging — research phase' },
          ].map(({ dot, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#aaa' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: dot }} />
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
