// ================================================================
// FINISH PASS
// Runs after OutputPass (display space): a soft wide vignette, light
// animated grain, and triangular dither so dark gradients don't band
// when quantised to 8 bits.
// ================================================================

export const FinishShader = {
  name: 'FinishShader',

  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.38 },
    uGrain: { value: 0.018 }
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignette;
    uniform float uGrain;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(443.897, 441.423));
      p += dot(p, p.yx + 19.19);
      return fract((p.x + p.y) * p.x);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);

      // Wide, gentle falloff that only darkens the outer corners
      float r = length((vUv - 0.5) * vec2(1.0, 0.8)) * 1.414;
      color.rgb *= 1.0 - uVignette * smoothstep(0.45, 1.1, r);

      // Fine grain, weaker in the shadows so blacks stay clean
      float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      float grain = hash(gl_FragCoord.xy + fract(uTime * 7.31) * 113.0) - 0.5;
      color.rgb += grain * uGrain * smoothstep(0.02, 0.35, luma);

      // Triangular-distributed dither of +-1 LSB
      float dither = hash(gl_FragCoord.xy * 1.37 + 3.1) + hash(gl_FragCoord.xy * 0.73 + 7.7) - 1.0;
      color.rgb += dither / 255.0;

      gl_FragColor = color;
    }
  `
};
