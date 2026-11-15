import * as THREE from "three";

const canvas = document.getElementById("scene");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
} catch (e) {
  // No WebGL: fall back to a static glow so the page still looks intentional.
  canvas.style.background = "radial-gradient(circle at 70% 40%, rgba(255,90,31,.35), transparent 45%)";
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
camera.position.set(0, 0, 9);

/* ---------- GLSL: 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT) ---------- */
const noise = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

/* ---------- The "matter" blob ---------- */
const uniforms = {
  uTime: { value: 0 },
  uAmp: { value: 0.32 },
  uFreq: { value: 1.1 },
  uMouse: { value: new THREE.Vector2() },
  uScroll: { value: 0 },
  uColA: { value: new THREE.Color("#ff5a1f") },
  uColB: { value: new THREE.Color("#ffb36b") },
  uColC: { value: new THREE.Color("#1a0c06") },
};

const blobMat = new THREE.ShaderMaterial({
  uniforms,
  vertexShader: /* glsl */ `
    uniform float uTime, uAmp, uFreq, uScroll; uniform vec2 uMouse;
    varying vec3 vN; varying vec3 vView; varying float vD;
    ${noise}
    float field(vec3 p){
      float t = uTime * .25;
      float n = snoise(p * uFreq + vec3(t, t * .7, uScroll * 1.5));
      n += .35 * snoise(p * uFreq * 2.3 - vec3(t * 1.3));
      // cursor pulls a bulge toward it
      vec3 m = normalize(vec3(uMouse * 1.4, 1.));
      n += .55 * pow(max(dot(normalize(p), m), 0.), 6.);
      return n;
    }
    vec3 displace(vec3 p){ return p + normalize(p) * field(p) * uAmp; }
    void main(){
      vec3 p = displace(position);
      // finite-difference normal from displaced neighbours
      vec3 tng = normalize(cross(normal, abs(normal.y) < .99 ? vec3(0,1,0) : vec3(1,0,0)));
      vec3 btn = normalize(cross(normal, tng));
      float e = .01;
      vec3 pa = displace(normalize(position + tng * e) * length(position));
      vec3 pb = displace(normalize(position + btn * e) * length(position));
      vec3 n = normalize(cross(pa - p, pb - p));
      if (dot(n, normal) < 0.) n = -n;
      vD = field(position);
      vec4 mv = modelViewMatrix * vec4(p, 1.);
      vN = normalize(normalMatrix * n);
      vView = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uColA, uColB, uColC; uniform float uTime;
    varying vec3 vN; varying vec3 vView; varying float vD;
    void main(){
      vec3 L = normalize(vec3(-.6, .8, .7));
      float diff = max(dot(vN, L), 0.);
      float rim = pow(1. - max(dot(vN, vView), 0.), 2.6);
      vec3 H = normalize(L + vView);
      float spec = pow(max(dot(vN, H), 0.), 48.);
      float bands = smoothstep(.35, .5, fract(vD * 3. + uTime * .05));
      vec3 base = mix(uColC, uColA, diff * .85 + .1);
      base = mix(base, uColB, bands * .18 * diff);
      vec3 col = base + rim * uColB * 1.1 + spec * vec3(1., .92, .82) * .8;
      gl_FragColor = vec4(col, 1.);
    }`,
});

const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 64), blobMat);
scene.add(blob);

/* ---------- Orbiting dust ring ---------- */
const COUNT = 1800;
const pos = new Float32Array(COUNT * 3);
const seed = new Float32Array(COUNT);
for (let i = 0; i < COUNT; i++) {
  const a = Math.random() * Math.PI * 2;
  const r = 2.6 + Math.pow(Math.random(), 2) * 2.4;
  pos[i * 3] = Math.cos(a) * r;
  pos[i * 3 + 1] = (Math.random() - 0.5) * 0.35 * r * 0.4;
  pos[i * 3 + 2] = Math.sin(a) * r;
  seed[i] = Math.random();
}
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
dustGeo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
const dustMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: { uTime: uniforms.uTime, uPR: { value: renderer.getPixelRatio() } },
  vertexShader: /* glsl */ `
    uniform float uTime, uPR; attribute float aSeed; varying float vA;
    void main(){
      vec3 p = position;
      float ang = uTime * (.05 + aSeed * .08);
      float c = cos(ang), s = sin(ang);
      p.xz = mat2(c, -s, s, c) * p.xz;
      p.y += sin(uTime * .6 + aSeed * 30.) * .06;
      vec4 mv = modelViewMatrix * vec4(p, 1.);
      gl_PointSize = (1.2 + aSeed * 2.6) * uPR * (6. / -mv.z);
      vA = .35 + .65 * fract(aSeed * 7.31);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    varying float vA;
    void main(){
      float d = length(gl_PointCoord - .5);
      if (d > .5) discard;
      gl_FragColor = vec4(1., .72, .45, (1. - d * 2.) * vA * .8);
    }`,
});
const dust = new THREE.Points(dustGeo, dustMat);
dust.rotation.x = 0.35;
dust.rotation.z = -0.18;
scene.add(dust);

/* ---------- Interaction state ---------- */
const mouse = new THREE.Vector2();
const mouseTarget = new THREE.Vector2();
window.addEventListener("pointermove", (e) => {
  mouseTarget.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
}, { passive: true });

let scrollP = 0;
const onScroll = () => {
  const max = document.documentElement.scrollHeight - innerHeight;
  scrollP = max > 0 ? scrollY / max : 0;
};
window.addEventListener("scroll", onScroll, { passive: true });

// The blob drifts between sides as you scroll through sections.
const path = [
  { x: 2.2, y: 0.1, s: 1.0 },   // hero
  { x: 3.1, y: -0.4, s: 0.7 },  // services
  { x: -3.0, y: 0.3, s: 0.8 },  // work
  { x: 2.8, y: 0.6, s: 0.65 },  // process
  { x: -2.4, y: -0.2, s: 0.95 },// contact
];
const samplePath = (t) => {
  const f = Math.min(Math.max(t, 0), 1) * (path.length - 1);
  const i = Math.min(Math.floor(f), path.length - 2);
  const k = f - i;
  const e = k * k * (3 - 2 * k);
  const a = path[i], b = path[i + 1];
  return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, s: a.s + (b.s - a.s) * e };
};

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  // narrow screens: keep the form centred behind the copy
  isNarrow = w < 860;
}
let isNarrow = false;
window.addEventListener("resize", resize);
resize();
onScroll();

/* ---------- Loop ---------- */
const clock = new THREE.Clock();
let smoothScroll = scrollP;
let visible = true;
document.addEventListener("visibilitychange", () => { visible = !document.hidden; if (visible) clock.getDelta(); });

function frame() {
  requestAnimationFrame(frame);
  if (!visible) return;
  const dt = Math.min(clock.getDelta(), 0.05);
  const speed = reduceMotion ? 0.15 : 1;
  uniforms.uTime.value += dt * speed;

  mouse.lerp(mouseTarget, 1 - Math.pow(0.001, dt));
  smoothScroll += (scrollP - smoothScroll) * (1 - Math.pow(0.002, dt));
  uniforms.uMouse.value.copy(mouse);
  uniforms.uScroll.value = smoothScroll;

  const p = samplePath(smoothScroll);
  const x = isNarrow ? 0 : p.x;
  const y = isNarrow ? 0.6 : p.y;
  const s = isNarrow ? p.s * 0.75 : p.s;
  blob.position.set(x + mouse.x * 0.25, y + mouse.y * 0.2, 0);
  blob.scale.setScalar(s);
  blob.rotation.y += dt * 0.12 * speed;
  blob.rotation.x = mouse.y * 0.3 + smoothScroll * Math.PI;
  uniforms.uAmp.value = 0.26 + Math.abs(Math.sin(smoothScroll * Math.PI * 4)) * 0.18;

  dust.position.copy(blob.position);
  dust.scale.setScalar(s);
  dust.rotation.y = smoothScroll * 2.0;

  camera.position.x = mouse.x * 0.35;
  camera.position.y = mouse.y * 0.25;
  camera.lookAt(0, 0, 0);

  renderer.render(scene, camera);
}
frame();
