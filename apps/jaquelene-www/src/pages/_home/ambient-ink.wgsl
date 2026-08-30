struct Params {
  viewport: vec2f,
  pointer: vec2f,
  time: f32,
  influence: f32,
}

@group(0) @binding(0) var<uniform> params: Params;

fn hash12(point: vec2f) -> f32 {
  var point3 = fract(vec3f(point.xyx) * 0.1031);
  point3 += dot(point3, point3.yzx + 33.33);
  return fract((point3.x + point3.y) * point3.z);
}

fn valueNoise(point: vec2f) -> f32 {
  let cell = floor(point);
  let local = fract(point);
  let blend = local * local * (3.0 - 2.0 * local);

  let a = hash12(cell);
  let b = hash12(cell + vec2f(1.0, 0.0));
  let c = hash12(cell + vec2f(0.0, 1.0));
  let d = hash12(cell + vec2f(1.0, 1.0));

  return mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y);
}

fn layeredNoise(point: vec2f) -> f32 {
  var value = 0.0;
  value += valueNoise(point) * 0.57;
  value += valueNoise(point * 2.03 + vec2f(11.7)) * 0.28;
  value += valueNoise(point * 4.01 - vec2f(8.2)) * 0.15;
  return value;
}

fn lineMask(distance: f32, width: f32) -> f32 {
  let antialias = max(fwidth(distance), 0.00065);
  return 1.0 - smoothstep(width, width + antialias, abs(distance));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let aspect = params.viewport.x / max(params.viewport.y, 1.0);
  var point = vec2f((uv.x - 0.5) * aspect, 0.5 - uv.y);
  let pointerPoint = vec2f((params.pointer.x - 0.5) * aspect, 0.5 - params.pointer.y);
  let pointerDelta = point - pointerPoint;
  let pointerField = exp(-dot(pointerDelta, pointerDelta) * 5.5) * params.influence;

  point += vec2f(pointerDelta.y, -pointerDelta.x) * pointerField * 0.034;

  let slowTime = params.time * 0.055;
  let warp = layeredNoise(point * 1.32 + vec2f(slowTime * 0.07, -slowTime * 0.035));
  let counterWarp = layeredNoise(
    point * 1.07 + vec2f(19.4, -7.8) - vec2f(slowTime * 0.025)
  );
  let inkPoint = point + vec2f(warp - 0.5, counterWarp - 0.5) * 0.046;

  var manuscript = 0.0;
  var prediction = 0.0;

  for (var index = 0; index < 9; index += 1) {
    let row = f32(index);
    let phase = row * 1.731;
    let horizontal = uv.x - 0.5;
    let baseline = -0.58 + row * 0.145
      + horizontal * (row - 4.0) * 0.014
      + horizontal * horizontal * (hash12(vec2f(row, 17.9)) - 0.5) * 0.19
      + sin(inkPoint.x * (2.05 + row * 0.025) + phase + slowTime * 0.11) * 0.021
      + sin(inkPoint.x * 5.2 - phase * 0.37 - slowTime * 0.065) * 0.007;
    let width = 0.00075 + 0.00045 * (0.5 + 0.5 * sin(inkPoint.x * 3.7 + phase));
    let stroke = lineMask(inkPoint.y - baseline, width);

    let start = -0.04 + hash12(vec2f(row, 2.4)) * 0.2;
    let end = 0.68 + hash12(vec2f(row, 8.1)) * 0.38;
    let span = smoothstep(start, start + 0.055, uv.x)
      * (1.0 - smoothstep(end - 0.08, end, uv.x));
    let gapCenter = 0.27 + hash12(vec2f(row, 4.7)) * 0.43;
    let gap = smoothstep(0.012, 0.027 + hash12(vec2f(row, 6.8)) * 0.024, abs(uv.x - gapCenter));
    let weight = 0.52 + hash12(vec2f(row, 13.2)) * 0.48;
    let writtenStroke = stroke * span * gap * weight;

    manuscript += writtenStroke;

    let predictionHead = fract(params.time * 0.009 + row * 0.137);
    let headDistance = abs(uv.x - predictionHead);
    let wrappedHeadDistance = min(headDistance, 1.0 - headDistance);
    prediction += writtenStroke * exp(-wrappedHeadDistance * wrappedHeadDistance * 150.0);
  }

  let sweep = lineMask(
    inkPoint.y - (-0.48 + uv.x * 0.82 - sin(uv.x * 3.14159) * 0.135),
    0.0009
  );
  let sweepReveal = smoothstep(0.015, 0.12, uv.x) * (1.0 - smoothstep(0.62, 0.79, uv.x));
  manuscript += sweep * sweepReveal * 0.72;

  let petalOrigin = inkPoint - vec2f(0.0, 0.105);
  let petalDistance = length(petalOrigin * vec2f(0.92, 1.06));
  let petalAngle = atan2(petalOrigin.y, petalOrigin.x);
  let petalBreath = sin(slowTime * 0.085) * 0.012;
  let outerPetalRadius = 0.365
    + sin(petalAngle * 3.0 + 0.45 + petalBreath) * 0.052
    + sin(petalAngle * 5.0 - 0.8) * 0.021;
  let middlePetalRadius = 0.255
    + sin(petalAngle * 4.0 - 0.2 - petalBreath) * 0.045
    + sin(petalAngle * 7.0 + 0.65) * 0.015;
  let innerPetalRadius = 0.142
    + sin(petalAngle * 3.0 + 1.35 + petalBreath) * 0.028
    + sin(petalAngle * 6.0 - 0.3) * 0.011;
  let contourVariation = 0.74 + 0.26 * sin(petalAngle * 2.0 + slowTime * 0.035);
  var petals = (
    lineMask(petalDistance - outerPetalRadius, 0.0011)
      + lineMask(petalDistance - middlePetalRadius, 0.00095) * 0.78
      + lineMask(petalDistance - innerPetalRadius, 0.0008) * 0.56
  ) * contourVariation;

  let centerDistance = length((uv - vec2f(0.5)) * vec2f(1.18, 2.18));
  let contentQuiet = 0.12 + 0.88 * smoothstep(0.24, 0.69, centerDistance);
  manuscript *= contentQuiet;
  prediction *= contentQuiet;
  petals *= 0.34 + contentQuiet * 0.38;

  let base = vec3f(0.019, 0.021, 0.03);
  let violetInk = vec3f(0.27, 0.255, 0.41);
  let pearlInk = vec3f(0.69, 0.68, 0.76);
  let ambientLift = exp(-dot(point * vec2f(0.7, 1.05), point * vec2f(0.7, 1.05)) * 1.8);
  var color = base + violetInk * ambientLift * 0.012;
  color += violetInk * min(manuscript, 1.0) * 0.17;
  color += violetInk * min(petals, 1.0) * 0.145;
  color += pearlInk * min(prediction, 1.0) * 0.09;

  let edge = length((uv - 0.5) * vec2f(1.0, 0.82));
  color *= 1.0 - smoothstep(0.38, 0.72, edge) * 0.14;

  let grain = hash12(floor(uv * params.viewport)) - 0.5;
  color += grain * 0.0028;

  return vec4f(color, 1.0);
}
