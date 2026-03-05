/**
 * Kasbah Guard — ML Anomaly Detection Engine
 * 
 * Isolation Forest implementation
 * Multi-feature clustering
 * Real-time model updating
 */

class MLAnomalyDetector {
  constructor(options = {}) {
    this.contamination = options.contamination || 0.1;
    this.n_estimators = options.n_estimators || 100;
    this.max_samples = options.max_samples || 256;
    this.models = new Map();
    this.trainingData = new Map();
  }

  /**
   * Train isolation forest for a specific entity
   */
  train(entityId, data) {
    if (data.length < 10) {
      throw new Error('Need at least 10 samples for training');
    }

    const model = {
      entityId,
      trainedAt: Date.now(),
      data: data.slice(-1000), // Keep last 1000 samples
      trees: this.buildIsolationForest(data),
      thresholds: this.calculateThresholds(data)
    };

    this.models.set(entityId, model);
    this.trainingData.set(entityId, data);

    return {
      entityId,
      samplesUsed: data.length,
      treesBuilt: model.trees.length,
      thresholds: model.thresholds
    };
  }

  /**
   * Build isolation forest
   */
  buildIsolationForest(data) {
    const trees = [];
    const sampleSize = Math.min(this.max_samples, data.length);

    for (let i = 0; i < this.n_estimators; i++) {
      const sample = this.randomSample(data, sampleSize);
      const tree = this.buildIsolationTree(sample);
      trees.push(tree);
    }

    return trees;
  }

  /**
   * Build single isolation tree
   */
  buildIsolationTree(data, height = 0, maxDepth = Math.ceil(Math.log2(Math.max(data.length, 2)))) {
    if (height >= maxDepth || data.length <= 1) {
      return { type: 'leaf', size: data.length, height };
    }

    // Random feature selection
    const featureIndex = Math.floor(Math.random() * data[0].length);
    const featureValues = data.map(d => d[featureIndex]);
    const minVal = Math.min(...featureValues);
    const maxVal = Math.max(...featureValues);

    if (minVal === maxVal) {
      return { type: 'leaf', size: data.length, height };
    }

    // Random split value
    const splitValue = minVal + Math.random() * (maxVal - minVal);

    const leftData = data.filter(d => d[featureIndex] < splitValue);
    const rightData = data.filter(d => d[featureIndex] >= splitValue);

    return {
      type: 'node',
      feature: featureIndex,
      splitValue,
      left: this.buildIsolationTree(leftData, height + 1, maxDepth),
      right: this.buildIsolationTree(rightData, height + 1, maxDepth)
    };
  }

  /**
   * Predict anomaly score for new data point
   */
  predict(entityId, dataPoint) {
    const model = this.models.get(entityId);
    if (!model) {
      throw new Error(`No model found for entity: ${entityId}`);
    }

    // Calculate average path length across all trees
    const pathLengths = model.trees.map(tree => this.pathLength(dataPoint, tree, 0));
    const avgPathLength = this.mean(pathLengths);

    // Calculate anomaly score
    const n = model.data.length;
    const c = this.c(n);
    const score = Math.pow(2, -avgPathLength / c);

    return {
      score: Math.round(score * 100) / 100,
      isAnomaly: score > model.thresholds.high,
      riskLevel: score > model.thresholds.critical ? 'CRITICAL' : 
                 score > model.thresholds.high ? 'HIGH' : 
                 score > model.thresholds.medium ? 'MEDIUM' : 'LOW',
      avgPathLength: Math.round(avgPathLength * 100) / 100
    };
  }

  /**
   * Calculate path length in tree
   */
  pathLength(dataPoint, tree, currentLength) {
    if (tree.type === 'leaf') {
      return currentLength + this.c(tree.size);
    }

    if (dataPoint[tree.feature] < tree.splitValue) {
      return this.pathLength(dataPoint, tree.left, currentLength + 1);
    } else {
      return this.pathLength(dataPoint, tree.right, currentLength + 1);
    }
  }

  /**
   * Calculate thresholds from training data
   */
  calculateThresholds(data) {
    const scores = data.map(point => {
      const model = { trees: this.buildIsolationForest(data.slice(0, 100)), data };
      const pathLengths = model.trees.map(tree => this.pathLength(point, tree, 0));
      const avgPathLength = this.mean(pathLengths);
      const c = this.c(data.length);
      return Math.pow(2, -avgPathLength / c);
    });

    scores.sort((a, b) => a - b);

    return {
      medium: scores[Math.floor(scores.length * 0.5)],
      high: scores[Math.floor(scores.length * 0.9)],
      critical: scores[Math.floor(scores.length * 0.99)]
    };
  }

  /**
   * Update model with new data (online learning)
   */
  async update(entityId, newData) {
    const model = this.models.get(entityId);
    if (!model) return false;

    // Add new data
    model.data.push(...newData);
    if (model.data.length > 1000) {
      model.data = model.data.slice(-1000);
    }

    // Rebuild forest with new data
    model.trees = this.buildIsolationForest(model.data);
    model.thresholds = this.calculateThresholds(model.data);
    model.trainedAt = Date.now();

    this.models.set(entityId, model);
    this.trainingData.set(entityId, model.data);

    return true;
  }

  /**
   * Continuous learning pipeline
   */
  async continuousLearning(entityId, newData, autoUpdateThreshold = 50) {
    if (!this.trainingData.has(entityId)) return;

    const currentData = this.trainingData.get(entityId);
    const combined = [...currentData, ...newData];

    // Check if enough new data for retraining
    if (newData.length >= autoUpdateThreshold) {
      await this.update(entityId, newData);
      return {
        retrained: true,
        totalSamples: combined.length,
        newSamples: newData.length
      };
    }

    return {
      retrained: false,
      totalSamples: combined.length,
      newSamples: newData.length,
      samplesNeededForRetrain: autoUpdateThreshold - newData.length
    };
  }

  /**
   * Multi-feature clustering (simplified K-means)
   */
  cluster(data, k = 3, maxIterations = 100) {
    if (data.length < k) {
      throw new Error('Not enough data points for clustering');
    }

    // Initialize centroids randomly
    let centroids = this.randomSample(data, k);
    let assignments = new Array(data.length).fill(0);

    for (let iter = 0; iter < maxIterations; iter++) {
      // Assign points to nearest centroid
      for (let i = 0; i < data.length; i++) {
        const distances = centroids.map(c => this.distance(data[i], c));
        assignments[i] = distances.indexOf(Math.min(...distances));
      }

      // Update centroids
      const newCentroids = [];
      for (let cluster = 0; cluster < k; cluster++) {
        const clusterPoints = data.filter((_, i) => assignments[i] === cluster);
        if (clusterPoints.length > 0) {
          newCentroids.push(this.calculateCentroid(clusterPoints));
        } else {
          newCentroids.push(centroids[cluster]);
        }
      }

      // Check convergence
      if (this.centroidsEqual(centroids, newCentroids)) {
        break;
      }
      centroids = newCentroids;
    }

    return {
      centroids,
      assignments,
      clusters: Array.from({ length: k }, (_, i) => 
        data.filter((_, j) => assignments[j] === i)
      )
    };
  }

  // Utility functions
  c(n) {
    if (n <= 1) return 0;
    return 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1) / n);
  }

  mean(arr) {
    if (arr.length === 0) return 0;
    return arr.reduce((sum, v) => sum + v, 0) / arr.length;
  }

  randomSample(arr, size) {
    const shuffled = [...arr].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, size);
  }

  distance(a, b) {
    return Math.sqrt(a.reduce((sum, v, i) => sum + Math.pow(v - b[i], 2), 0));
  }

  calculateCentroid(points) {
    const dimensions = points[0].length;
    return Array.from({ length: dimensions }, (_, i) => 
      this.mean(points.map(p => p[i]))
    );
  }

  centroidsEqual(c1, c2) {
    if (c1.length !== c2.length) return false;
    return c1.every((c, i) => Math.abs(c - c2[i]) < 0.0001);
  }
}

module.exports = { MLAnomalyDetector };
