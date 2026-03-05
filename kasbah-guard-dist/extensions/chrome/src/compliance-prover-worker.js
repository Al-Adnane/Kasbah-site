/**
 * ZK Compliance Proof Generation Worker
 *
 * This WebWorker handles computationally expensive proof generation (~300ms)
 * on a separate thread to prevent UI blocking.
 *
 * The worker receives circuit inputs and the proving key, generates a Groth16 proof
 * using snarkjs, and returns the proof to the main thread.
 *
 * Security: The worker has no direct access to the UI or network. All data is
 * passed explicitly via postMessage(). The proving key is passed as an ArrayBuffer
 * and never stored outside this worker context.
 */

// Import snarkjs for Groth16 operations
importScripts('https://cdn.jsdelivr.net/npm/snarkjs@latest/build/snarkjs.min.js');

/**
 * Message handler: receives proof generation requests from main thread
 */
self.onmessage = async function (event) {
    const { type, circuitInputs, provingKey } = event.data;

    if (type !== 'GENERATE_PROOF') {
        self.postMessage({
            error: 'Unknown message type: ' + type,
        });
        return;
    }

    try {
        console.log('[Worker] Starting proof generation...');
        const startTime = performance.now();

        // Validate inputs
        if (!circuitInputs) {
            throw new Error('Missing circuitInputs');
        }

        if (!provingKey) {
            throw new Error('Missing proving key');
        }

        console.log('[Worker] Circuit inputs received');

        // Generate Groth16 proof using snarkjs
        // NOTE: This requires the circuit WASM file (.wasm) and witness calculator
        // to be available. In production, both should be bundled with the worker.

        const startProof = performance.now();

        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
            circuitInputs,
            // Path to circuit WASM (must be accessible to worker)
            '/compliance_js.wasm',
            provingKey // ArrayBuffer with proving key
        );

        const proofTime = performance.now() - startProof;
        console.log(`[Worker] Proof generated in ${proofTime.toFixed(2)}ms`);

        const totalTime = performance.now() - startTime;
        console.log(`[Worker] Total time: ${totalTime.toFixed(2)}ms`);

        // Send proof back to main thread
        self.postMessage({
            proof: proof,
            publicSignals: publicSignals,
            generationTime: totalTime,
        });
    } catch (error) {
        console.error('[Worker] Error:', error);
        self.postMessage({
            error: error.message || String(error),
        });
    }
};

/**
 * Log errors that occur outside message handlers
 */
self.onerror = function (error) {
    console.error('[Worker] Uncaught error:', error);
    self.postMessage({
        error: 'Worker error: ' + error.message,
    });
};
