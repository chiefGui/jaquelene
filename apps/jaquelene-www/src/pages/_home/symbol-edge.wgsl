struct Params {
  viewport: vec2f,
  time: f32,
}

struct Palette {
  accent: vec3f,
  foreground: vec3f,
  reasoning: vec3f,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<uniform> palette: Palette;

const PI: f32 = 3.141592653589793;
const MARK_RADIUS: f32 = 0.454545;

fn superellipse(point: vec2f) -> f32 {
  let fourthPower = pow(abs(point), vec2f(4.0));
  return pow(fourthPower.x + fourthPower.y, 0.25);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let aspect = params.viewport.x / max(params.viewport.y, 1.0);
  let point = vec2f((uv.x - 0.5) * 2.0 * aspect, (uv.y - 0.5) * 2.0);
  let shape = superellipse(point);
  let edgeDistance = abs(shape - MARK_RADIUS);
  let antialias = max(fwidth(shape) * 0.7, 0.0015);
  let led = 1.0 - smoothstep(
    0.006 - antialias,
    0.006 + antialias,
    edgeDistance,
  );
  let nearBloom = exp(-pow(edgeDistance / 0.065, 2.0));
  let farBloom = exp(-pow(edgeDistance / 0.22, 2.0));
  let atmosphere = exp(-pow(edgeDistance / 0.3, 2.0));

  let angle = atan2(point.y, point.x);
  let time = params.time;
  let causticA = pow(max(cos(angle - time * 0.28), 0.0), 8.0);
  let causticB = pow(max(cos(angle + time * 0.19 + 2.1), 0.0), 10.0);
  let causticC = 0.5 + 0.5 * sin(angle * 2.0 - time * 0.13);
  let caustics = clamp(
    0.12 + causticA * 0.56 + causticB * 0.5 + causticC * 0.14,
    0.0,
    1.0,
  );

  let lilacAnchor = 0.5 + 0.5 * cos(angle - PI * 0.25);
  let lilacDrift = 0.5 + 0.5 * sin(angle * 2.0 + time * 0.11);
  let lilacField = clamp(lilacAnchor * 0.7 + lilacDrift * 0.3, 0.0, 1.0);
  let frostAngle = -PI * 0.25 + sin(time * 0.14) * 0.22;
  let frostField = pow(max(cos(angle - frostAngle), 0.0), 6.0);

  let ice = mix(palette.accent, palette.foreground, 0.6);
  let spectral = mix(ice, palette.reasoning, lilacField * 0.42);
  let frostAmount = clamp(
    frostField * 0.66 + causticA * causticB * 0.5 + causticB * 0.1,
    0.0,
    1.0,
  );
  let color = mix(spectral, palette.foreground, frostAmount);
  let luminosity = clamp(0.1 + caustics * 0.82 + frostField * 0.24, 0.0, 1.0);
  let core = led * (0.42 + luminosity * 0.72);
  let bloom = nearBloom * (0.07 + caustics * 0.34 + frostField * 0.08)
    + farBloom * (0.012 + caustics * 0.12)
    + atmosphere * (caustics * 0.035 + frostField * 0.015);
  let alpha = clamp(core + bloom, 0.0, 1.0);

  return vec4f(color * alpha, alpha);
}
