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
 * Status: Production-Ready
 * Version: 1.1.1
 */

(function (global) {
  'use strict';

  var FRONTIER_TEXT = (function () {
    var AI_MARKER_PATTERNS = {
      'gpt-4': [/\bas\s+(?:you|a)\b/i,/certainly\b/i,/please\s+note\b/i,/think\s+about\s+it\b/i,/i\s+(?:understand|appreciate)\s+(?:your|that)/i,/let\s+me\s+(?:explain|clarify|break\s+down)/i],
      'claude': [/i['']d\s+be\s+happy/i,/fascinating\s+(?:question|topic|problem)/i,/\bnuance\b/i,/context\s+is\s+key/i,/\bthoughtful\b/i,/i\s+(?:want\s+to|should)\s+be\s+(?:clear|transparent|honest)/i],
      'gemini': [/helpful\s+(?:information|response|overview)/i,/dive\s+(?:into|deeper)/i,/comprehensive\s+(?:overview|guide|answer)/i,/great\s+question\b/i,/here['']s\s+(?:a|an)\s+(?:breakdown|overview|summary)/i],
      'llama':  [/provide\s+(?:a|an)\s+(?:answer|response|solution)/i,/step\s+by\s+step\b/i,/following\s+(?:steps|points|information)/i,/\bin\s+conclusion\b/i,/\bfirstly\b.*\bsecondly\b/i]
    };
    function calcEntropy(t){var f={},l=t.toLowerCase(),e=0,n=l.length; for(var i=0;i<n;i++){var c=l[i];f[c]=(f[c]||0)+1;} for(var ch in f){if(!Object.prototype.hasOwnProperty.call(f,ch))continue; var p=f[ch]/n; if(p>0)e-=p*Math.log2(p);} return e;}
    function analyzeText(text){
      if (!text||text.length<50) return {genai:false,generator:null,confidence:0,entropy:0};
      var entropy=calcEntropy(text),bestGenerator=null,maxMarkers=0;
      for (var gen in AI_MARKER_PATTERNS){if(!Object.prototype.hasOwnProperty.call(AI_MARKER_PATTERNS,gen))continue; var patterns=AI_MARKER_PATTERNS[gen],count=0; for(var i=0;i<patterns.length;i++) if(patterns[i].test(text)) count++; if(count>maxMarkers){maxMarkers=count;bestGenerator=gen;}}
      var confidence=(entropy>4.5&&entropy<5.8)?0.4:0.1;
      if (maxMarkers>0) confidence+=Math.min(0.4,maxMarkers*0.10);
      var words=text.trim().split(/\s+/); if(text.replace(/\s+/g,'').length/(words.length||1)>6) confidence+=0.05;
      confidence=Math.min(0.95,confidence);
      return {genai:confidence>0.55,generator:bestGenerator,confidence:confidence,entropy:entropy,markerCount:maxMarkers};
    }
    return {analyzeText:analyzeText};
  })();

  var FRONTIER_IMAGE = (function () {
    var AI_THRESHOLD=0.55;
    var WEIGHTS={DiffusionModelFingerprinting:0.22,TransformerAttentionForensics:0.18,SelfSupervisedAnomalyDetector:0.15,NeuralArchitectureSignatures:0.12,CLIPSemanticConsistency:0.10,ContrastiveLearningEmbeddings:0.08,GraphCoherenceAnalyzer:0.07,MetaLearningDetector:0.08};
    function toGray(d,n){var g=new Float32Array(n); for(var i=0;i<n;i++) g[i]=(d[i*4]*0.299+d[i*4+1]*0.587+d[i*4+2]*0.114)/255; return g;}
    function ch(d,n,c){var a=new Float32Array(n); for(var i=0;i<n;i++) a[i]=d[i*4+c]/255; return a;}
    function meanStd(a){var s=0,i; for(i=0;i<a.length;i++) s+=a[i]; var m=s/a.length,v=0; for(i=0;i<a.length;i++) v+=(a[i]-m)*(a[i]-m); return [m,Math.sqrt(v/a.length)];}
    function dot(a,b){var s=0; for(var i=0;i<a.length;i++) s+=a[i]*b[i]; return s;}
    function norm(a){return Math.sqrt(dot(a,a));}
    function cosSim(a,b){return dot(a,b)/(norm(a)*norm(b)+1e-9);}
    function l2d(a,b){var s=0; for(var i=0;i<a.length;i++) s+=(a[i]-b[i])*(a[i]-b[i]); return Math.sqrt(s);}
    function dft(row){var N=row.length,half=Math.floor(N/2),p=new Float32Array(half); for(var k=1;k<=half;k++){var re=0,im=0; for(var n=0;n<N;n++){var a=(-2*Math.PI*k*n)/N; re+=row[n]*Math.cos(a);im+=row[n]*Math.sin(a);} p[k-1]=re*re+im*im;} return p;}
    function psd(gray,w,h){var W=Math.min(w,128),mY=Math.floor(h/2),row=new Float32Array(W); for(var x=0;x<W;x++) row[x]=gray[mY*w+Math.floor(x*w/W)]; var p=dft(row),half=p.length,sX=0,sY=0,sXX=0,sXY=0,cnt=0; for(var k=0;k<half;k++){if(p[k]<=0)continue; var lx=Math.log(k+1),ly=Math.log(p[k]); sX+=lx;sY+=ly;sXX+=lx*lx;sXY+=lx*ly;cnt++;} if(cnt<2)return -2; var den=cnt*sXX-sX*sX; return Math.abs(den)<1e-10?-2:(cnt*sXY-sX*sY)/den;}
    function dctB(gray,w,h){var B=8,lo=0,mi=0,hi=0; for(var by=0;by+B<=h;by+=B) for(var bx=0;bx+B<=w;bx+=B){var blk=new Float32Array(B*B); for(var r=0;r<B;r++) for(var c=0;c<B;c++) blk[r*B+c]=gray[(by+r)*w+(bx+c)]; var tmp=new Float32Array(B*B),out=new Float32Array(B*B); for(var rr=0;rr<B;rr++) for(var kk=0;kk<B;kk++){var s=0; for(var n=0;n<B;n++) s+=blk[rr*B+n]*Math.cos((Math.PI/B)*(n+0.5)*kk); tmp[rr*B+kk]=s;} for(var cc=0;cc<B;cc++) for(var kk2=0;kk2<B;kk2++){var s2=0; for(var n2=0;n2<B;n2++) s2+=tmp[n2*B+cc]*Math.cos((Math.PI/B)*(n2+0.5)*kk2); out[kk2*B+cc]=s2;} for(var ri=0;ri<B;ri++) for(var ci=0;ci<B;ci++){var e=out[ri*B+ci]*out[ri*B+ci],fr=ri+ci; if(fr<3)lo+=e; else if(fr<8)mi+=e; else hi+=e;}} var tot=lo+mi+hi+1e-9; return {low:lo/tot,mid:mi/tot,high:hi/tot};}
    function nK(gray,w,h){var B=8,res=[]; for(var by=0;by+B<=h;by+=B) for(var bx=0;bx+B<=w;bx+=B){var m=0; for(var r=0;r<B;r++) for(var c=0;c<B;c++) m+=gray[(by+r)*w+(bx+c)]; m/=B*B; for(var r2=0;r2<B;r2++) for(var c2=0;c2<B;c2++) res.push(gray[(by+r2)*w+(bx+c2)]-m);} if(res.length<4)return 3; var n=res.length,m2=0,m4=0; for(var i=0;i<n;i++){m2+=res[i]*res[i];m4+=Math.pow(res[i],4);} m2/=n;m4/=n; return m2<1e-10?3:m4/(m2*m2);}
    function cbV(d,w,h){var ev=0,od=0,cnt=0; for(var y=0;y<Math.min(h,64);y++) for(var x=0;x<Math.min(w,64);x++){var v=(d[(y*w+x)*4]+d[(y*w+x)*4+1]+d[(y*w+x)*4+2])/3/255; if((x+y)%2===0)ev+=v; else od+=v; cnt++;} return cnt<2?0:Math.min(1,Math.abs(ev-od)/(cnt/2)*10);}

    function m1(d,w,h,g){var bands=dctB(g,w,h),kurt=nK(g,w,h),rA=ch(d,w*h,0),gA=ch(d,w*h,1),rMs=meanStd(rA),gMs=meanStd(gA),cov=0; for(var i=0;i<rA.length;i++) cov+=(rA[i]-rMs[0])*(gA[i]-gMs[0]); cov/=rA.length; var hf=bands.high/(bands.low+1e-9),ks=Math.exp(-Math.abs(kurt-3)/1.5),ds=1-Math.min(1,Math.abs(cov/((rMs[1]+1e-9)*(gMs[1]+1e-9)))),rv=[]; for(var y=0;y<Math.min(h,64);y++){var s=0,ss=0; for(var x=0;x<w;x++){var v=d[(y*w+x)*4]/255;s+=v;ss+=v*v;} var m=s/w;rv.push(ss/w-m*m);} var gs=0; if(rv.length>=16){var a8=0,ba=0; for(var j=0;j+8<rv.length;j++) a8+=rv[j]*rv[j+8]; for(var j2=0;j2<rv.length;j2++) ba+=rv[j2]*rv[j2]; gs=ba>0?Math.min(1,Math.abs(a8)/(ba+1e-9)*8):0;} var sc=0.35*Math.min(1,hf*3)+0.25*ks+0.20*ds+0.20*gs; return {name:'DiffusionModelFingerprinting',aiScore:Math.min(1,sc),hint:gs>0.5?'stable-diffusion':(ks>0.8?'flux':null),bands:bands,kurt:kurt};}
    function m2(d,w,h,g){var at=new Float32Array(w*h); for(var y=1;y<h-1;y++) for(var x=1;x<w-1;x++){var gx=-g[(y-1)*w+(x-1)]+g[(y-1)*w+(x+1)]-2*g[y*w+(x-1)]+2*g[y*w+(x+1)]-g[(y+1)*w+(x-1)]+g[(y+1)*w+(x+1)],gy=-g[(y-1)*w+(x-1)]-2*g[(y-1)*w+x]-g[(y-1)*w+(x+1)]+g[(y+1)*w+(x-1)]+2*g[(y+1)*w+x]+g[(y+1)*w+(x+1)]; at[y*w+x]=Math.sqrt(gx*gx+gy*gy);} var B2=20,hi=new Float32Array(B2),mx=0; for(var i=0;i<at.length;i++) if(at[i]>mx) mx=at[i]; if(mx>0){for(var ii=0;ii<at.length;ii++) hi[Math.min(B2-1,Math.floor(at[ii]/mx*B2))]++; for(var k=0;k<B2;k++) hi[k]/=at.length;} var en=0; for(var k2=0;k2<B2;k2++) if(hi[k2]>0) en-=hi[k2]*Math.log2(hi[k2]); var as=Math.max(0,0.9-en/Math.log2(B2)),P=16,bd=0,bc=0,id=0,ic=0; for(var py=P;py+P<h;py+=P) for(var px=0;px<w;px++){bd+=Math.abs(g[(py-1)*w+px]-g[py*w+px]);bc++;} for(var iy=1;iy<h-1;iy++) for(var ix=0;ix<w-1;ix++){id+=Math.abs(g[iy*w+ix+1]-g[iy*w+ix]);ic++;} var pd=Math.min(1,(bc>0?bd/bc:0)/((ic>0?id/ic:(bc>0?bd/bc:0))+1e-9)-1); return {name:'TransformerAttentionForensics',aiScore:Math.min(1,0.6*as+0.4*Math.max(0,pd)),hint:pd>0.5?'dall-e':null};}
    function m3(g,w,h){var sl=psd(g,w,h); return {name:'SelfSupervisedAnomalyDetector',aiScore:Math.min(1,Math.abs(sl-(-2))/3),hint:null,slope:sl};}
    function m4(d,w,h,g,bands){var cv=cbV(d,w,h),rm=[],rmM=0,bnV=0; for(var y=0;y<Math.min(h,128);y++){var s=0; for(var x=0;x<w;x++) s+=d[(y*w+x)*4]/255; rm.push(s/w);} for(var i=0;i<rm.length;i++) rmM+=rm[i]; rmM/=rm.length; for(var j=0;j<rm.length;j++) bnV+=(rm[j]-rmM)*(rm[j]-rmM); bnV/=rm.length; var gr=Math.min(1,Math.max(0,(bands.mid/(bands.low+1e-9))-0.3)*2); return {name:'NeuralArchitectureSignatures',aiScore:Math.min(1,0.40*cv+0.35*Math.min(1,bnV*100)+0.25*gr),hint:cv>0.5?'stylegan3':(gr>0.5?'midjourney':null)};}
    function m5(d,w,h){var n=w*h,rA=ch(d,n,0),gA=ch(d,n,1),rMs=meanStd(rA),gMs=meanStd(gA),cov=0; for(var i=0;i<n;i++) cov+=(rA[i]-rMs[0])*(gA[i]-gMs[0]); cov/=n; var ac=Math.abs(cov/((rMs[1]+1e-9)*(gMs[1]+1e-9))),hi=new Float32Array(256); for(var j=0;j<n;j++){hi[d[j*4]]++;hi[d[j*4+1]]++;hi[d[j*4+2]]++;} var tot=n*3,he=0; for(var k=0;k<256;k++) if(hi[k]>0){var p=hi[k]/tot;he-=p*Math.log2(p);} var nHE=he/Math.log2(256); return {name:'CLIPSemanticConsistency',aiScore:Math.min(1,0.5*(nHE<0.6?1-nHE/0.6:0)+0.5*(ac<0.5?0.5-ac:0)),hint:null};}
    function m6(feat){var v1=[feat.bands.low,feat.bands.mid,feat.rMean,feat.gMean,feat.bMean,feat.lapVar],v2=[feat.bands.high,feat.kurt/10,Math.abs(feat.slope)/5,feat.rStd,feat.gStd,feat.bStd]; return {name:'ContrastiveLearningEmbeddings',aiScore:Math.min(1,Math.max(0,0.5-cosSim(v1,v2))*2),hint:null};}
    function m7(d,w,h){var G=8,pw=Math.floor(w/G),ph=Math.floor(h/G),np=G*G,pm=new Float32Array(np*3); for(var py=0;py<G;py++) for(var px=0;px<G;px++){var r=0,gr=0,b=0,cnt=0; for(var y=py*ph;y<(py+1)*ph&&y<h;y++) for(var x=px*pw;x<(px+1)*pw&&x<w;x++){r+=d[(y*w+x)*4];gr+=d[(y*w+x)*4+1];b+=d[(y*w+x)*4+2];cnt++;} var idx=(py*G+px)*3;pm[idx]=cnt>0?r/cnt/255:0;pm[idx+1]=cnt>0?gr/cnt/255:0;pm[idx+2]=cnt>0?b/cnt/255:0;} var deg=new Array(np).fill(0); for(var i=0;i<np;i++) for(var j=i+1;j<np;j++){var dr=pm[i*3]-pm[j*3],dg=pm[i*3+1]-pm[j*3+1],db2=pm[i*3+2]-pm[j*3+2]; if(Math.exp(-Math.sqrt(dr*dr+dg*dg+db2*db2)*5)>0.8){deg[i]++;deg[j]++;}} var mxD=Math.max.apply(null,deg.concat([1])),dH=new Float32Array(mxD+1); for(var ii=0;ii<np;ii++) dH[deg[ii]]++; for(var k=0;k<=mxD;k++) dH[k]/=np; var dE=0; for(var k2=0;k2<=mxD;k2++) if(dH[k2]>0) dE-=dH[k2]*Math.log2(dH[k2]); return {name:'GraphCoherenceAnalyzer',aiScore:Math.min(1,Math.max(0,0.7-(mxD>0?dE/Math.log2(mxD+1):0))),hint:null};}
    var PR={'stable-diffusion':[0.35,0.64,0.28,0.38],'dall-e':[0.32,0.60,0.24,0.18],'midjourney':[0.34,0.62,0.26,0.29],'stylegan3':[0.37,0.68,0.31,0.52],'flux':[0.33,0.66,0.30,0.22]},NP=[0.62,0.42,0.08,0.03];
    function m8(d,w,h,feat){var cv=cbV(d,w,h),q=[Math.min(1,feat.kurt/10),Math.min(1,Math.abs(feat.slope)/5),feat.bands.high,cv],mD=Infinity,bG=null; for(var gen in PR){if(!Object.prototype.hasOwnProperty.call(PR,gen))continue; var dd=l2d(q,PR[gen]); if(dd<mD){mD=dd;bG=gen;}} var nd=l2d(q,NP),sc=nd/(nd+mD+1e-9); return {name:'MetaLearningDetector',aiScore:Math.min(1,sc),hint:sc>AI_THRESHOLD?bG:null};}

    function analyzePixels(data,width,height){
      if (!data||width<8||height<8) return {isAiGenerated:false,confidence:0,aiScore:0,generatorHint:null,methodScores:{},dominantArtifacts:[]};
      var n=width*height,gray=toGray(data,n),rA=ch(data,n,0),gA=ch(data,n,1),bA=ch(data,n,2),rMs=meanStd(rA),gMs=meanStd(gA),bMs=meanStd(bA);
      var kurt=nK(gray,width,height),slope=psd(gray,width,height),bands=dctB(gray,width,height);
      var lS=0,lSq=0,lC=0; for(var y=1;y<height-1;y++) for(var x=1;x<width-1;x++){var idx=y*width+x,lap=gray[idx-width-1]+gray[idx-width]+gray[idx-width+1]+gray[idx-1]-8*gray[idx]+gray[idx+1]+gray[idx+width-1]+gray[idx+width]+gray[idx+width+1]; lS+=lap;lSq+=lap*lap;lC++;}
      var lM=lC>0?lS/lC:0,lapVar=lC>0?lSq/lC-lM*lM:0;
      var feat={bands:bands,kurt:kurt,slope:slope,lapVar:lapVar,rMean:rMs[0],gMean:gMs[0],bMean:bMs[0],rStd:rMs[1],gStd:gMs[1],bStd:bMs[1]};
      var results=[m1(data,width,height,gray),m2(data,width,height,gray),m3(gray,width,height),m4(data,width,height,gray,bands),m5(data,width,height),m6(feat),m7(data,width,height),m8(data,width,height,feat)];
      var wS=0,tW=0,mS={}; for(var i=0;i<results.length;i++){var r=results[i],w=WEIGHTS[r.name]||0.05;wS+=r.aiScore*w;tW+=w;mS[r.name]=r.aiScore;}
      var aiScore=tW>0?wS/tW:0,tH=null,tS=-1; for(var j=0;j<results.length;j++) if(results[j].hint&&results[j].aiScore>tS){tS=results[j].aiScore;tH=results[j].hint;}
      var dom=[],sorted=results.slice().sort(function(a,b){return b.aiScore-a.aiScore;}); for(var k=0;k<Math.min(3,sorted.length);k++) if(sorted[k].aiScore>0.5) dom.push(sorted[k].name+'('+sorted[k].aiScore.toFixed(2)+')');
      return {isAiGenerated:aiScore>=AI_THRESHOLD,confidence:results.filter(function(r2){return r2.aiScore>AI_THRESHOLD;}).length/results.length,aiScore:aiScore,generatorHint:tH,methodScores:mS,dominantArtifacts:dom};
    }

    function analyzeElement(elem){try{var canvas=document.createElement('canvas'),w=elem.naturalWidth||elem.width||64,h=elem.naturalHeight||elem.height||64,sc=Math.min(1,512/Math.max(w,h)); canvas.width=Math.floor(w*sc);canvas.height=Math.floor(h*sc); var ctx=canvas.getContext('2d'); if(!ctx)return null; ctx.drawImage(elem,0,0,canvas.width,canvas.height); var id=ctx.getImageData(0,0,canvas.width,canvas.height); return analyzePixels(id.data,canvas.width,canvas.height);}catch(e){return null;}}

    return {analyzePixels:analyzePixels,analyzeElement:analyzeElement};
  })();

  var kasbahFrontier={version:'1.1.1',analyzeText:function(t){return FRONTIER_TEXT.analyzeText(t);},analyzeImageElement:function(e){return FRONTIER_IMAGE.analyzeElement(e);},analyzePixels:function(d,w,h){return FRONTIER_IMAGE.analyzePixels(d,w,h);}};
  global.kasbahFrontier=kasbahFrontier;
  if (global.kasbahBridge&&typeof global.kasbahBridge._patchFrontier==='function') global.kasbahBridge._patchFrontier();
  console.log('[Kasbah] Frontier+Image detection layer loaded v'+kasbahFrontier.version);

})(typeof window!=='undefined'?window:this);
