export const MAX_MARKS = 16;

export const holoVertex = /* glsl */ `
varying vec3 vN; varying vec3 vV; varying float vY; varying vec3 vL;
void main() {
  vL = position;
  vec4 wp = modelMatrix * vec4(position, 1.);
  vY = wp.y;
  vN = normalize(normalMatrix * normal);
  vec4 mv = viewMatrix * wp;
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

// 全息外壳 + 疼痛标注。每种疼痛类型一段图案，动画模拟那种痛的感觉。
export const holoFragment = /* glsl */ `
uniform float uTime; uniform vec3 uColor; uniform int uN;
uniform vec4 uMP[${MAX_MARKS}]; uniform vec4 uMT[${MAX_MARKS}];
varying vec3 vN; varying vec3 vV; varying float vY; varying vec3 vL;

float hash(vec3 p) { p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float beat(float t) { float p = fract(t * 1.15); return exp(-pow((p - .06) * 20., 2.)) + .6 * exp(-pow((p - .24) * 20., 2.)); }

vec4 pain(vec4 mp, vec4 mt, float t) {
  vec3 d = vL - mp.xyz; float r = mp.w, x = length(d) / r, type = mt.w;
  vec3 N = normalize(mt.xyz);
  vec3 T = normalize(abs(N.y) < .9 ? cross(N, vec3(0,1,0)) : cross(N, vec3(1,0,0))); vec3 B = cross(N, T);
  vec2 uv = vec2(dot(d, T), dot(d, B)) / r;
  vec3 c = vec3(1., .2, .1); float k = 0.;
  if (type < .5) {            // 搏动性
    k = exp(-x * x * 3.5) * (.55 + 1.2 * beat(t));
  } else if (type < 1.5) {    // 紧箍样
    float dy = abs(vL.y - mp.y) / r;
    k = smoothstep(1., .5, dy) * (.45 + .35 * sin(dy * 14. + t * 5.)); c = vec3(1., .32, .15);
  } else if (type < 2.5) {    // 钝痛
    k = smoothstep(1., 0., x) * (.45 + .1 * sin(t * 1.1)) * (.75 + .5 * noise(vL * 3. + t * .15)); c = vec3(.85, .12, .08);
  } else if (type < 3.5) {    // 胀痛
    k = smoothstep(1., .25, x) * (.2 + .9 * pow(.5 + .5 * sin(x * 13. - t * 4.5), 6.));
  } else if (type < 4.5) {    // 针刺样
    vec3 cell = floor(vL * 45.); vec3 f = fract(vL * 45.) - .5;
    float on = step(.93, hash(cell + floor(t * 5.)));
    k = smoothstep(1., .4, x) * on * smoothstep(.3, 0., length(f)) * 3. + exp(-x * x * 40.) * 1.5 * step(.55, fract(t * 1.6));
    c = vec3(1., .75, .65);
  } else if (type < 5.5) {    // 电击样
    float n = abs(noise(vL * 8. + vec3(0., t * 2.5, t)) - .5);
    k = smoothstep(1., .3, x) * smoothstep(.035, 0., n) * 2.5 * step(.3, hash(vec3(floor(t * 12.))));
    c = vec3(1., .85, .3);
  } else if (type < 6.5) {    // 烧灼样
    float n = noise(vL * 6. - vec3(0., t * 1.4, 0.)) * .6 + noise(vL * 14. - vec3(0., t * 3., 0.)) * .4;
    k = smoothstep(1., .15, x) * (.25 + n * .9); c = mix(vec3(1., .2, .03), vec3(1., .65, .1), n);
  } else if (type < 7.5) {    // 钻痛
    float a = atan(uv.y, uv.x);
    k = smoothstep(1., .15, x) * (.15 + .85 * smoothstep(.2, 1., sin(a * 3. + x * 14. + t * 7.))) + exp(-x * x * 25.);
    c = vec3(.95, .15, .25);
  } else if (type < 8.5) {    // 头皮触痛
    float g = step(.7, hash(floor(vL * 110.) + floor(t * 4.)));
    k = smoothstep(1., .3, x) * (.15 + g * .9); c = vec3(1., .5, .42);
  } else {                    // 霹雳样
    float p = fract(t * .6);
    k = smoothstep(1., 0., x) * (.35 + 2.2 * exp(-p * 7.)); c = mix(vec3(1., .2, .1), vec3(1.), exp(-p * 5.));
  }
  return vec4(c, max(k, 0.));
}

void main() {
  float f = pow(1. - abs(dot(vN, vV)), 2.2);
  float scan = smoothstep(.0, .02, abs(fract(vY * 1.2 - uTime * .25) - .5) - .47);
  float lines = .12 * step(.5, fract(vY * 60.));
  float a = f * 1.1 + .06 + lines * .4 + scan * .5;
  vec3 col = uColor * a * a;
  vec3 pc = vec3(0.); float pa = 0.;
  for (int i = 0; i < ${MAX_MARKS}; i++) {
    if (i >= uN) break;
    vec4 p = pain(uMP[i], uMT[i], uTime + float(i) * .37);
    pc += p.rgb * p.a; pa += p.a;
  }
  col = col * (1. - min(pa, 1.) * .85) + pc * 1.3;
  gl_FragColor = vec4(col, 1.);
}`;

export const skullVertex = /* glsl */ `
varying vec3 vN; varying vec3 vV;
void main() {
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

export const skullFragment = /* glsl */ `
uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
void main() {
  float f = pow(1. - abs(dot(vN, vV)), 2.2);
  float a = f * 1.1 + .06;
  gl_FragColor = vec4(uColor * a, a);
}`;

// 统计页：所有历史标注叠成发光的点
export const dotVertex = /* glsl */ `
attribute vec3 color; varying vec3 vC; uniform float uSize;
void main() {
  vC = color;
  vec4 mv = modelViewMatrix * vec4(position, 1.);
  gl_PointSize = uSize / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

export const dotFragment = /* glsl */ `
varying vec3 vC;
void main() {
  float d = length(gl_PointCoord - .5);
  float a = smoothstep(.5, 0., d);
  gl_FragColor = vec4(vC * a * 1.4, a);
}`;
