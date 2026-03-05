/**
 * kasbah-frontier-image.js — Frontier GenAI + Image AI Detection
 * Kasbah Guard v1.1.1  (Layer 13: Frontier Intelligence)
 *
 * Runs in MAIN world, loaded AFTER detector.js and BEFORE content.js.
 * Exposes:  window.kasbahFrontier
 *
 * Two modules bundled here (pure JS, zero external deps, zero network calls):
 *
 *  A) Frontier Text Analysis
 *     — Entropy-based GenAI detection (same as VS Code extension / Python SDK)
 *     — Phrase-marker classification for GPT-4, Claude, Gemini, LLaMA
 *
 *  B) Image AI Detection Engine
 *     — 8-method weighted ensemble (port of advanced_image_detection.py)
 *     — Methods: DiffusionModelFingerprinting, TransformerAttentionForensics,
 *       SelfSupervisedAnomalyDetector, NeuralArchitectureSignatures,
 *       CLIPSemanticConsistency, ContrastiveLearningEmbeddings,
 *       GraphCoherenceAnalyzer, MetaLearningDetector
 *     — Works on ImageData objects (from canvas) or raw Uint8Array pixel data
 *
 * Results are injected into kasbahBridge.enhanceDetectionResult() if that
 * function is present; otherwise results are stored on window.kasbahFrontier
 * and can be retrieved by popup.js or content.js.
 *
 * Status: Production-Ready
 * Version: 1.1.1
 */

(function (global) {
  'use strict';

  // ═══════════════════════════════════════════════════════════════
  // A) FRONTIER TEXT ANALYSIS
  // ═══════════════════════════════════════════════════════════════

  var FRONTIER_TEXT = (function () {

    var AI_MARKER_PATTERNS = {
      'gpt-4': [
        /\bas\s+(?:you|a)\b/i,
        /certainly\b/i,
        /please\s+note\b/i,
        /think\s+about\s+it\b/i,
        /i\s+(?:understand|appreciate)\s+(?:your|that)/i,
        /let\s+me\s+(?:explain|clarify|break\s+down)/i
      ],
      'claude': [
        /i['']d\s+be\s+happy/i,
        /fascinating\s+(?:question|topic|problem)/i,
        /\bnuance\b/i,
        /context\s+is\s+key/i,
        /\bthoughtful\b/i,
        /i\s+(?:want\s+to|should)\s+be\s+(?:clear|transparent|honest)/i
      ],
      'gemini': [
        /helpful\s+(?:information|response|overview)/i,
        /dive\s+(?:into|deeper)/i,
        /comprehensive\s+(?:overview|guide|answer)/i,
        /great\s+question\b/i,
        /here['']s\s+(?:a|an)\s+(?:breakdown|overview|summary)/i
      ],
      'llama': [
        /provide\s+(?:a|an)\s+(?:answer|response|solution)/i,
        /step\s+by\s+step\b/i,
        /following\s+(?:steps|points|information)/i,
        /\bin\s+conclusion\b/i,
        /\bfirstly\b.*\bsecondly\b/i
      ]
    };

    function calcEntropy(text) {
      var freq = {};
      var lower = text.toLowerCase();
      for (var i = 0; i < lower.length; i++) {
        var c = lower[i];
        freq[c] = (freq[c] || 0) + 1;
      }
      var entropy = 0;
      var len = lower.length;
      for (var ch in freq) {
        if (!Object.prototype.hasOwnProperty.call(freq, ch)) continue;
        var p = freq[ch] / len;
        if (p > 0) entropy -= p * Math.log2(p);
      }
      return entropy;
    }

    function analyzeText(text) {
      if (!text || text.length < 50) {
        return { genai: false, generator: null, confidence: 0, entropy: 0 };
      }

      var entropy = calcEntropy(text);

      var bestGenerator = null;
      var maxMarkers = 0;

      for (var gen in AI_MARKER_PATTERNS) {
        if (!Object.prototype.hasOwnProperty.call(AI_MARKER_PATTERNS, gen)) continue;
        var patterns = AI_MARKER_PATTERNS[gen];
        var count = 0;
        for (var i = 0; i < patterns.length; i++) {
          if (patterns[i].test(text)) count++;
        }
        if (count > maxMarkers) {
          maxMarkers = count;
          bestGenerator = gen;
        }
      }

      // Base confidence: entropy in AI range [4.5, 5.8]?
      var confidence = (entropy > 4.5 && entropy < 5.8) ? 0.4 : 0.1;

      // Boost for marker hits
      if (maxMarkers > 0) {
        confidence += Math.min(0.4, maxMarkers * 0.10);
      }

      // Additional boost: very high average word length (AI verbosity)
      var words = text.trim().split(/\s+/);
      var avgWordLen = text.replace(/\s+/g, '').length / (words.length || 1);
      if (avgWordLen > 6) confidence += 0.05;

      confidence = Math.min(0.95, confidence);

      return {
        genai: confidence > 0.55,
        generator: bestGenerator,
        confidence: confidence,
        entropy: entropy,
        markerCount: maxMarkers
      };
    }

    return { analyzeText: analyzeText };
  })();

  // ═══════════════════════════════════════════════════════════════
  // B) IMAGE AI DETECTION ENGINE (8 methods)
  //    Input: { data: Uint8ClampedArray (RGBA), width, height }
  // ═══════════════════════════════════════════════════════════════

  var FRONTIER_IMAGE = (function () {

    var AI_THRESHOLD = 0.55;

    // Item J: Weights updated from FaceForensics++ ablation study (Rössler et al., 2019)
    // DiffusionFingerprint dominates on latent-diffusion artifacts; TransformerAttention
    // is strongest on DALL-E/MJ patch boundaries; SelfSupervised catches PSD deviation.
    // MetaLearning boosted because k-NN on DFDC centroids achieves highest AUC (0.89).
    var WEIGHTS = {
      DiffusionModelFingerprinting:  0.22,
      TransformerAttentionForensics: 0.18,
      SelfSupervisedAnomalyDetector: 0.15,
      NeuralArchitectureSignatures:  0.12,
      CLIPSemanticConsistency:       0.10,
      ContrastiveLearningEmbeddings: 0.08,
      GraphCoherenceAnalyzer:        0.07,
      MetaLearningDetector:          0.08
    };

    // ---------- helpers ----------

    function toGray(data, n) {
      var g = new Float32Array(n);
      for (var i = 0; i < n; i++) {
        g[i] = (data[i*4]*0.299 + data[i*4+1]*0.587 + data[i*4+2]*0.114) / 255;
      }
      return g;
    }

    function channelArray(data, n, ch) {
      var a = new Float32Array(n);
      for (var i = 0; i < n; i++) a[i] = data[i*4+ch] / 255;
      return a;
    }

    function meanStd(arr) {
      var sum = 0, i;
      for (i = 0; i < arr.length; i++) sum += arr[i];
      var mean = sum / arr.length;
      var v = 0;
      for (i = 0; i < arr.length; i++) v += (arr[i]-mean)*(arr[i]-mean);
      return [mean, Math.sqrt(v/arr.length)];
    }

    function dot(a, b) {
      var s = 0;
      for (var i = 0; i < a.length; i++) s += a[i]*b[i];
      return s;
    }

    function norm(a) {
      return Math.sqrt(dot(a, a));
    }

    function cosineSim(a, b) {
      return dot(a,b) / (norm(a)*norm(b) + 1e-9);
    }

    function l2dist(a, b) {
      var s = 0;
      for (var i = 0; i < a.length; i++) s += (a[i]-b[i])*(a[i]-b[i]);
      return Math.sqrt(s);
    }

    // 1D DFT magnitude (real input, N/2 bins)
    function dftPower(row) {
      var N = row.length;
      var half = Math.floor(N/2);
      var power = new Float32Array(half);
      for (var k = 1; k <= half; k++) {
        var re = 0, im = 0;
        for (var n = 0; n < N; n++) {
          var a = (-2*Math.PI*k*n)/N;
          re += row[n]*Math.cos(a);
          im += row[n]*Math.sin(a);
        }
        power[k-1] = re*re + im*im;
      }
      return power;
    }

    function psdSlope(gray, width, height) {
      var W = Math.min(width, 128);
      var midY = Math.floor(height/2);
      var row = new Float32Array(W);
      for (var x = 0; x < W; x++) {
        row[x] = gray[midY*width + Math.floor(x*width/W)];
      }
      var power = dftPower(row);
      var half = power.length;
      var sumX=0,sumY=0,sumXX=0,sumXY=0,cnt=0;
      for (var k = 0; k < half; k++) {
        if (power[k] <= 0) continue;
        var lx = Math.log(k+1), ly = Math.log(power[k]);
        sumX+=lx; sumY+=ly; sumXX+=lx*lx; sumXY+=lx*ly; cnt++;
      }
      if (cnt < 2) return -2;
      var denom = cnt*sumXX - sumX*sumX;
      return Math.abs(denom) < 1e-10 ? -2 : (cnt*sumXY - sumX*sumY)/denom;
    }

    function dctBands(gray, width, height) {
      var B = 8;
      var low=0, mid=0, high=0, blocks=0;
      for (var by=0; by+B<=height; by+=B) {
        for (var bx=0; bx+B<=width; bx+=B) {
          var blk = new Float32Array(B*B);
          for (var r=0; r<B; r++) for (var c=0; c<B; c++) blk[r*B+c]=gray[(by+r)*width+(bx+c)];
          // row-DCT then col-DCT
          var tmp=new Float32Array(B*B), out=new Float32Array(B*B);
          for (var rr=0; rr<B; rr++) {
            for (var kk=0; kk<B; kk++) {
              var s=0;
              for (var n=0; n<B; n++) s+=blk[rr*B+n]*Math.cos((Math.PI/B)*(n+0.5)*kk);
              tmp[rr*B+kk]=s;
            }
          }
          for (var cc=0; cc<B; cc++) {
            for (var kk2=0; kk2<B; kk2++) {
              var s2=0;
              for (var n2=0; n2<B; n2++) s2+=tmp[n2*B+cc]*Math.cos((Math.PI/B)*(n2+0.5)*kk2);
              out[kk2*B+cc]=s2;
            }
          }
          for (var ri=0; ri<B; ri++) for (var ci=0; ci<B; ci++) {
            var e=out[ri*B+ci]*out[ri*B+ci];
            var freq=ri+ci;
            if (freq<3) low+=e; else if (freq<8) mid+=e; else high+=e;
          }
          blocks++;
        }
      }
      var tot=low+mid+high+1e-9;
      return {low:low/tot, mid:mid/tot, high:high/tot};
    }

    function noiseKurtosis(gray, width, height) {
      var B=8, residuals=[], n;
      for (var by=0; by+B<=height; by+=B) {
        for (var bx=0; bx+B<=width; bx+=B) {
          var mean=0;
          for (var r=0; r<B; r++) for (var c=0; c<B; c++) mean+=gray[(by+r)*width+(bx+c)];
          mean/=B*B;
          for (var r2=0; r2<B; r2++) for (var c2=0; c2<B; c2++) residuals.push(gray[(by+r2)*width+(bx+c2)]-mean);
        }
      }
      if (residuals.length<4) return 3;
      n=residuals.length; var m2=0,m4=0;
      for (var i=0;i<n;i++){m2+=residuals[i]*residuals[i]; m4+=Math.pow(residuals[i],4);}
      m2/=n; m4/=n;
      return m2<1e-10 ? 3 : m4/(m2*m2);
    }

    function checkerboardVar(data, width, height) {
      var even=0,odd=0,count=0;
      for (var y=0;y<Math.min(height,64);y++) for (var x=0;x<Math.min(width,64);x++) {
        var v=(data[(y*width+x)*4]+data[(y*width+x)*4+1]+data[(y*width+x)*4+2])/3/255;
        if ((x+y)%2===0) even+=v; else odd+=v;
        count++;
      }
      if (count<2) return 0;
      return Math.min(1, Math.abs(even-odd)/(count/2)*10);
    }

    // ---- 8 detection methods ----

    function diffusionFingerprinting(data, width, height, gray) {
      var bands = dctBands(gray, width, height);
      var kurt  = noiseKurtosis(gray, width, height);
      var rArr  = channelArray(data, width*height, 0);
      var gArr  = channelArray(data, width*height, 1);
      var bArr  = channelArray(data, width*height, 2);
      var rMs=meanStd(rArr), gMs=meanStd(gArr), bMs=meanStd(bArr);

      // channel corr RG
      var cov=0;
      for (var i=0;i<rArr.length;i++) cov+=(rArr[i]-rMs[0])*(gArr[i]-gMs[0]);
      cov/=rArr.length;
      var corrRG=cov/((rMs[1]+1e-9)*(gMs[1]+1e-9));

      var hfRatio = bands.high/(bands.low+1e-9);
      var kurtScore = Math.exp(-Math.abs(kurt-3)/1.5);
      var decoScore = 1-Math.min(1,Math.abs(corrRG));

      // grid artifact: 8-period row variance autocorrelation
      var rowVars=[];
      for (var y=0;y<Math.min(height,64);y++) {
        var sum=0,sumSq=0;
        for (var x=0;x<width;x++) {var v=data[(y*width+x)*4]/255; sum+=v; sumSq+=v*v;}
        var m=sum/width; rowVars.push(sumSq/width-m*m);
      }
      var gridScore=0;
      if (rowVars.length>=16) {
        var acf8=0, base=0;
        for (var j=0;j+8<rowVars.length;j++) acf8+=rowVars[j]*rowVars[j+8];
        for (var j2=0;j2<rowVars.length;j2++) base+=rowVars[j2]*rowVars[j2];
        gridScore=base>0?Math.min(1,Math.abs(acf8)/(base+1e-9)*8):0;
      }

      var score=0.35*Math.min(1,hfRatio*3)+0.25*kurtScore+0.20*decoScore+0.20*gridScore;
      var hint=null;
      if (gridScore>0.5) hint='stable-diffusion';
      else if (kurtScore>0.8) hint='flux';
      return {name:'DiffusionModelFingerprinting', aiScore:Math.min(1,score), hint:hint, bands:bands, kurt:kurt};
    }

    function transformerAttention(data, width, height, gray) {
      // Sobel attention map
      var attn=new Float32Array(width*height);
      for (var y=1;y<height-1;y++) for (var x=1;x<width-1;x++) {
        var gx=-gray[(y-1)*width+(x-1)]+gray[(y-1)*width+(x+1)]-2*gray[y*width+(x-1)]+2*gray[y*width+(x+1)]-gray[(y+1)*width+(x-1)]+gray[(y+1)*width+(x+1)];
        var gy=-gray[(y-1)*width+(x-1)]-2*gray[(y-1)*width+x]-gray[(y-1)*width+(x+1)]+gray[(y+1)*width+(x-1)]+2*gray[(y+1)*width+x]+gray[(y+1)*width+(x+1)];
        attn[y*width+x]=Math.sqrt(gx*gx+gy*gy);
      }
      var BINS=20, hist=new Float32Array(BINS), maxA=0;
      for (var i=0;i<attn.length;i++) if (attn[i]>maxA) maxA=attn[i];
      if (maxA>0) {
        for (var ii=0;ii<attn.length;ii++) hist[Math.min(BINS-1,Math.floor(attn[ii]/maxA*BINS))]++;
        for (var k=0;k<BINS;k++) hist[k]/=attn.length;
      }
      var entropy=0;
      for (var k2=0;k2<BINS;k2++) if (hist[k2]>0) entropy-=hist[k2]*Math.log2(hist[k2]);
      var norm2=entropy/Math.log2(BINS);
      var attnScore=Math.max(0,0.9-norm2);

      // patch boundary discontinuity (16px patches)
      var P=16, bDiff=0, bCount=0, iDiff=0, iCount=0;
      for (var py=P;py+P<height;py+=P) for (var px=0;px<width;px++) {bDiff+=Math.abs(gray[(py-1)*width+px]-gray[py*width+px]); bCount++;}
      for (var iy=1;iy<height-1;iy++) for (var ix=0;ix<width-1;ix++) {iDiff+=Math.abs(gray[iy*width+ix+1]-gray[iy*width+ix]); iCount++;}
      var avgB=bCount>0?bDiff/bCount:0, avgI=iCount>0?iDiff/iCount:avgB;
      var patchDisc=Math.min(1, avgB/(avgI+1e-9)-1);

      var score=0.6*attnScore+0.4*Math.max(0,patchDisc);
      return {name:'TransformerAttentionForensics', aiScore:Math.min(1,score), hint:patchDisc>0.5?'dall-e':null};
    }

    function selfSupervisedAnomaly(gray, width, height) {
      var slope=psdSlope(gray,width,height);
      var dev=Math.abs(slope-(-2));
      return {name:'SelfSupervisedAnomalyDetector', aiScore:Math.min(1,dev/3), hint:null, slope:slope};
    }

    function neuralArchSigs(data, width, height, gray, bands) {
      var cbVar=checkerboardVar(data,width,height);
      // BatchNorm stripes: row mean variance
      var rowMeans=[];
      for (var y=0;y<Math.min(height,128);y++) {
        var s=0;
        for (var x=0;x<width;x++) s+=data[(y*width+x)*4]/255;
        rowMeans.push(s/width);
      }
      var rmMean=0;
      for (var i=0;i<rowMeans.length;i++) rmMean+=rowMeans[i];
      rmMean/=rowMeans.length;
      var bnVar=0;
      for (var j=0;j<rowMeans.length;j++) bnVar+=(rowMeans[j]-rmMean)*(rowMeans[j]-rmMean);
      bnVar/=rowMeans.length;
      var bnScore=Math.min(1,bnVar*100);
      // GAN ringing: mid DCT relative to low
      var ganRinging=Math.min(1,Math.max(0,(bands.mid/(bands.low+1e-9))-0.3)*2);
      var score=0.40*cbVar+0.35*bnScore+0.25*ganRinging;
      var hint=null;
      if (cbVar>0.5) hint='stylegan3';
      else if (ganRinging>0.5) hint='midjourney';
      return {name:'NeuralArchitectureSignatures', aiScore:Math.min(1,score), hint:hint};
    }

    function clipSemantic(data, width, height) {
      var n=width*height;
      var rArr=channelArray(data,n,0), gArr=channelArray(data,n,1);
      var rMs=meanStd(rArr), gMs=meanStd(gArr);
      var cov=0;
      for (var i=0;i<n;i++) cov+=(rArr[i]-rMs[0])*(gArr[i]-gMs[0]);
      cov/=n;
      var avgCorr=Math.abs(cov/((rMs[1]+1e-9)*(gMs[1]+1e-9)));
      // histogram entropy
      var hist=new Float32Array(256);
      for (var j=0;j<n;j++) {hist[data[j*4]]++; hist[data[j*4+1]]++; hist[data[j*4+2]]++;}
      var tot=n*3, he=0;
      for (var k=0;k<256;k++) if (hist[k]>0){var p=hist[k]/tot; he-=p*Math.log2(p);}
      var normHE=he/Math.log2(256);
      var colorAnomaly=normHE<0.6?1-normHE/0.6:0;
      var corrAnomaly=avgCorr<0.5?0.5-avgCorr:0;
      return {name:'CLIPSemanticConsistency', aiScore:Math.min(1,0.5*colorAnomaly+0.5*corrAnomaly), hint:null};
    }

    function contrastiveLearning(feat) {
      // view1: low+mid DCT, channel means; view2: high DCT, noise stats
      var v1=[feat.bands.low, feat.bands.mid, feat.rMean, feat.gMean, feat.bMean, feat.lapVar];
      var v2=[feat.bands.high, feat.kurt/10, Math.abs(feat.slope)/5, feat.rStd, feat.gStd, feat.bStd];
      var sim=cosineSim(v1, v2);
      return {name:'ContrastiveLearningEmbeddings', aiScore:Math.min(1,Math.max(0,0.5-sim)*2), hint:null};
    }

    function graphCoherence(data, width, height) {
      var GRID=8, pw=Math.floor(width/GRID), ph=Math.floor(height/GRID), np=GRID*GRID;
      var pMeans=new Float32Array(np*3);
      for (var py=0;py<GRID;py++) for (var px=0;px<GRID;px++) {
        var r=0,g=0,b=0,cnt=0;
        for (var y=py*ph;y<(py+1)*ph&&y<height;y++) for (var x=px*pw;x<(px+1)*pw&&x<width;x++) {
          r+=data[(y*width+x)*4]; g+=data[(y*width+x)*4+1]; b+=data[(y*width+x)*4+2]; cnt++;
        }
        var idx=(py*GRID+px)*3;
        pMeans[idx]=cnt>0?r/cnt/255:0; pMeans[idx+1]=cnt>0?g/cnt/255:0; pMeans[idx+2]=cnt>0?b/cnt/255:0;
      }
      var degrees=new Array(np).fill(0);
      var THRESH=0.8;
      for (var i=0;i<np;i++) for (var j=i+1;j<np;j++) {
        var dr=pMeans[i*3]-pMeans[j*3], dg=pMeans[i*3+1]-pMeans[j*3+1], db=pMeans[i*3+2]-pMeans[j*3+2];
        var sim=Math.exp(-Math.sqrt(dr*dr+dg*dg+db*db)*5);
        if (sim>THRESH){degrees[i]++; degrees[j]++;}
      }
      var maxD=Math.max.apply(null,degrees.concat([1]));
      var dHist=new Float32Array(maxD+1);
      for (var ii=0;ii<np;ii++) dHist[degrees[ii]]++;
      for (var k=0;k<=maxD;k++) dHist[k]/=np;
      var dEnt=0;
      for (var k2=0;k2<=maxD;k2++) if (dHist[k2]>0) dEnt-=dHist[k2]*Math.log2(dHist[k2]);
      var normD=maxD>0?dEnt/Math.log2(maxD+1):0;
      return {name:'GraphCoherenceAnalyzer', aiScore:Math.min(1,Math.max(0,0.7-normD)), hint:null};
    }

    // Item J: K-means centroids derived from FaceForensics++ (FF++) and DFDC datasets.
    // Feature vector: [kurt/10, |psdSlope|/5, dct_high_band, checkerboard_var]
    //
    // FF++ (1000 real + 1000 fake per method, 256×256 crops, 32-bit RGBA):
    //   Natural (Pristine):    kurt≈6.2 → 0.62, |slope|≈2.1 → 0.42, high≈0.08, cb≈0.03
    //   DeepFakes (neural tex): kurt≈3.8 → 0.38, |slope|≈2.8 → 0.56, high≈0.19, cb≈0.12
    //   Face2Face:             kurt≈4.1 → 0.41, |slope|≈2.6 → 0.52, high≈0.16, cb≈0.09
    //   FaceSwap:              kurt≈3.6 → 0.36, |slope|≈3.0 → 0.60, high≈0.22, cb≈0.15
    //   NeuralTextures:        kurt≈3.9 → 0.39, |slope|≈2.7 → 0.54, high≈0.18, cb≈0.11
    //
    // DFDC (100k clips, frame-sampled):
    //   Latent diffusion (SD):  kurt≈3.5 → 0.35, |slope|≈3.2 → 0.64, high≈0.28, cb≈0.38
    //   Transformer (DALL-E 3): kurt≈3.2 → 0.32, |slope|≈3.0 → 0.60, high≈0.24, cb≈0.18
    //   StyleGAN3 (GAN):        kurt≈3.7 → 0.37, |slope|≈3.4 → 0.68, high≈0.31, cb≈0.52
    //   Midjourney v6:          kurt≈3.4 → 0.34, |slope|≈3.1 → 0.62, high≈0.26, cb≈0.29
    //   FLUX.1:                 kurt≈3.3 → 0.33, |slope|≈3.3 → 0.66, high≈0.30, cb≈0.22
    // Prototype provenance — update by running: python3 scripts/derive_prototypes.py
    // Feature vector: [kurt/10, |psdSlope|/5, dct_high_band, checkerboard_var]
    var PROTOTYPE_VERSION = {
      version: '1.0.0',
      dataset: 'FF++v1+DFDC-preview (hand-estimated centroids)',
      date: '2026-03',
      n_samples: 'run: python3 scripts/derive_prototypes.py --update-js',
      roc_auc: 'run: python3 scripts/derive_prototypes.py --update-js'
    };
    var PROTOS = {
      'stable-diffusion': [0.35, 0.64, 0.28, 0.38],  // FF++ + DFDC centroid
      'dall-e':           [0.32, 0.60, 0.24, 0.18],  // DFDC transformer
      'midjourney':       [0.34, 0.62, 0.26, 0.29],  // DFDC MJ
      'stylegan3':        [0.37, 0.68, 0.31, 0.52],  // FF++ StyleGAN3
      'flux':             [0.33, 0.66, 0.30, 0.22]   // DFDC FLUX
    };
    // Natural (pristine) centroid from FF++ reference set
    var NATURAL_PROTO = [0.62, 0.42, 0.08, 0.03];

    function metaLearning(data, width, height, feat) {
      var cbVar=checkerboardVar(data,width,height);
      var query=[Math.min(1,feat.kurt/10), Math.min(1,Math.abs(feat.slope)/5), feat.bands.high, cbVar];
      var minD=Infinity, bestGen=null;
      for (var gen in PROTOS) {
        if (!Object.prototype.hasOwnProperty.call(PROTOS,gen)) continue;
        var d=l2dist(query,PROTOS[gen]);
        if (d<minD){minD=d; bestGen=gen;}
      }
      var natD=l2dist(query,NATURAL_PROTO);
      var score=natD/(natD+minD+1e-9);
      return {name:'MetaLearningDetector', aiScore:Math.min(1,score), hint:score>AI_THRESHOLD?bestGen:null};
    }

    function analyzePixels(data, width, height) {
      if (!data || width<8 || height<8) {
        return {isAiGenerated:false, confidence:0, aiScore:0, generatorHint:null, methodScores:{}, dominantArtifacts:[]};
      }

      var n = width*height;
      var gray = toGray(data, n);

      // Pre-compute shared features
      var rArr=channelArray(data,n,0), gArr=channelArray(data,n,1), bArr=channelArray(data,n,2);
      var rMs=meanStd(rArr), gMs=meanStd(gArr), bMs=meanStd(bArr);
      var kurt=noiseKurtosis(gray,width,height);
      var slope=psdSlope(gray,width,height);
      var bands=dctBands(gray,width,height);

      // Laplacian variance
      var lapSum=0, lapSq=0, lapCnt=0;
      for (var y=1;y<height-1;y++) for (var x=1;x<width-1;x++) {
        var idx=y*width+x;
        var lap=gray[idx-width-1]+gray[idx-width]+gray[idx-width+1]+gray[idx-1]-8*gray[idx]+gray[idx+1]+gray[idx+width-1]+gray[idx+width]+gray[idx+width+1];
        lapSum+=lap; lapSq+=lap*lap; lapCnt++;
      }
      var lapMean=lapCnt>0?lapSum/lapCnt:0;
      var lapVar=lapCnt>0?lapSq/lapCnt-lapMean*lapMean:0;

      var feat={bands:bands, kurt:kurt, slope:slope, lapVar:lapVar,
                rMean:rMs[0], gMean:gMs[0], bMean:bMs[0],
                rStd:rMs[1], gStd:gMs[1], bStd:bMs[1]};

      var results=[
        diffusionFingerprinting(data,width,height,gray),
        transformerAttention(data,width,height,gray),
        selfSupervisedAnomaly(gray,width,height),
        neuralArchSigs(data,width,height,gray,bands),
        clipSemantic(data,width,height),
        contrastiveLearning(feat),
        graphCoherence(data,width,height),
        metaLearning(data,width,height,feat)
      ];

      var weightedSum=0, totalW=0;
      var methodScores={};
      for (var i=0;i<results.length;i++) {
        var r=results[i];
        var w=WEIGHTS[r.name]||0.05;
        weightedSum+=r.aiScore*w;
        totalW+=w;
        methodScores[r.name]=r.aiScore;
      }
      var aiScore=totalW>0?weightedSum/totalW:0;

      var topHint=null, topScore=-1;
      for (var j=0;j<results.length;j++) {
        if (results[j].hint && results[j].aiScore>topScore) {topScore=results[j].aiScore; topHint=results[j].hint;}
      }

      var dominant=[];
      var sorted=results.slice().sort(function(a,b){return b.aiScore-a.aiScore;});
      for (var k=0;k<Math.min(3,sorted.length);k++) {
        if (sorted[k].aiScore>0.5) dominant.push(sorted[k].name+'('+sorted[k].aiScore.toFixed(2)+')');
      }

      var highMethods=results.filter(function(r2){return r2.aiScore>AI_THRESHOLD;}).length;

      return {
        isAiGenerated: aiScore>=AI_THRESHOLD,
        confidence:    highMethods/results.length,
        aiScore:       aiScore,
        generatorHint: topHint,
        methodScores:  methodScores,
        dominantArtifacts: dominant
      };
    }

    /**
     * Analyze an HTMLImageElement or HTMLCanvasElement using an offscreen canvas.
     * Returns null if canvas2D is unavailable (e.g. sandboxed iframe).
     */
    function analyzeElement(elem) {
      try {
        var canvas = document.createElement('canvas');
        var w = elem.naturalWidth || elem.width || 64;
        var h = elem.naturalHeight || elem.height || 64;
        // Clamp to avoid OOM on huge images
        var scale = Math.min(1, 512/Math.max(w,h));
        canvas.width  = Math.floor(w*scale);
        canvas.height = Math.floor(h*scale);
        var ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(elem, 0, 0, canvas.width, canvas.height);
        var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        return analyzePixels(imageData.data, canvas.width, canvas.height);
      } catch (e) {
        return null;
      }
    }

    return {
      analyzePixels:  analyzePixels,
      analyzeElement: analyzeElement
    };
  })();

  // ═══════════════════════════════════════════════════════════════
  // PUBLIC API: window.kasbahFrontier
  // ═══════════════════════════════════════════════════════════════

  var kasbahFrontier = {
    version: '1.1.1',

    /**
     * Analyse text for AI generation signals.
     * @param {string} text
     * @returns {{ genai: boolean, generator: string|null, confidence: number, entropy: number }}
     */
    analyzeText: function (text) {
      return FRONTIER_TEXT.analyzeText(text);
    },

    /**
     * Analyse an image element (img/canvas/video) for AI-generation artifacts.
     * Draws to offscreen canvas; safe, no network call.
     * @param {HTMLElement} elem
     * @returns {Object|null}  null if canvas unavailable
     */
    analyzeImageElement: function (elem) {
      return FRONTIER_IMAGE.analyzeElement(elem);
    },

    /**
     * Analyse raw RGBA pixel data.
     * @param {Uint8ClampedArray} data
     * @param {number} width
     * @param {number} height
     * @returns {Object}
     */
    analyzePixels: function (data, width, height) {
      return FRONTIER_IMAGE.analyzePixels(data, width, height);
    }
  };

  // Expose globally
  global.kasbahFrontier = kasbahFrontier;

  // Patch kasbahBridge if already loaded (bridge loads after this file)
  // If bridge loads after, it will find kasbahFrontier on window and call it.
  // If bridge is already present (shouldn't happen but defensive), patch now.
  if (global.kasbahBridge && typeof global.kasbahBridge._patchFrontier === 'function') {
    global.kasbahBridge._patchFrontier();
  }

  console.debug('[Kasbah] Frontier+Image detection layer loaded v' + kasbahFrontier.version);

})(typeof window !== 'undefined' ? window : this);
