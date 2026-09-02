struct ComposerBacklightParams {
  resolution: vec2f,
  time: f32,
  border_radius: f32,
  outset: f32,
  pixel_scale: f32,
  palette_start: vec4f,
  palette_first_blend: vec4f,
  palette_second_blend: vec4f,
  palette_end: vec4f,
}

@group(0) @binding(0) var<uniform> params: ComposerBacklightParams;

const TAU: f32 = 6.28318530718;
const PI: f32 = 3.14159265359;

fn rounded_box_distance(point: vec2f, half_extent: vec2f, radius: f32) -> f32 {
  let corner = abs(point) - half_extent + vec2f(radius);
  return min(max(corner.x, corner.y), 0.0) + length(max(corner, vec2f(0.0))) - radius;
}

fn rounded_box_path(point: vec2f, half_extent: vec2f, radius: f32) -> vec2f {
  let straight_x = max(half_extent.x - radius, 0.0);
  let straight_y = max(half_extent.y - radius, 0.0);
  let quarter_arc = radius * PI * 0.5;
  let top_right_end = straight_x + quarter_arc;
  let right_end = top_right_end + 2.0 * straight_y;
  let bottom_right_end = right_end + quarter_arc;
  let bottom_end = bottom_right_end + 2.0 * straight_x;
  let bottom_left_end = bottom_end + quarter_arc;
  let left_end = bottom_left_end + 2.0 * straight_y;
  let top_left_end = left_end + quarter_arc;
  let perimeter = max(top_left_end + straight_x, 1.0);
  var distance: f32;

  if (point.y < -straight_y) {
    if (point.x > straight_x) {
      let angle = atan2(point.y + straight_y, point.x - straight_x);
      distance = straight_x + (angle + PI * 0.5) * radius;
    } else if (point.x < -straight_x) {
      let angle = atan2(point.y + straight_y, point.x + straight_x) + TAU;
      distance = left_end + (angle - PI) * radius;
    } else if (point.x >= 0.0) {
      distance = point.x;
    } else {
      distance = perimeter + point.x;
    }
  } else if (point.y > straight_y) {
    if (point.x > straight_x) {
      let angle = atan2(point.y - straight_y, point.x - straight_x);
      distance = right_end + angle * radius;
    } else if (point.x < -straight_x) {
      let angle = atan2(point.y - straight_y, point.x + straight_x);
      distance = bottom_end + (angle - PI * 0.5) * radius;
    } else {
      distance = bottom_right_end + straight_x - point.x;
    }
  } else if (point.x >= 0.0) {
    distance = top_right_end + point.y + straight_y;
  } else {
    distance = bottom_left_end + straight_y - point.y;
  }

  let top_left_position = (left_end + quarter_arc * 0.5) / perimeter;
  return vec2f(fract(distance / perimeter), top_left_position);
}

fn backlight_color(position: f32) -> vec3f {
  if (position < 0.32) {
    return mix(
      params.palette_start.rgb,
      params.palette_first_blend.rgb,
      smoothstep(0.0, 0.32, position),
    );
  }

  if (position < 0.68) {
    return mix(
      params.palette_first_blend.rgb,
      params.palette_second_blend.rgb,
      smoothstep(0.32, 0.68, position),
    );
  }

  return mix(
    params.palette_second_blend.rgb,
    params.palette_end.rgb,
    smoothstep(0.68, 1.0, position),
  );
}

@fragment
fn fragment(@location(0) uv: vec2f) -> @location(0) vec4f {
  let point = (uv - vec2f(0.5)) * params.resolution;
  let half_extent = max(
    params.resolution * 0.5 - vec2f(params.outset),
    vec2f(params.border_radius + params.pixel_scale),
  );
  let radius = clamp(
    params.border_radius,
    params.pixel_scale,
    min(half_extent.x, half_extent.y),
  );
  let distance = rounded_box_distance(point, half_extent, radius);
  let scale = max(params.pixel_scale, 1.0);
  let signed_edge_distance = distance / scale;
  let exterior_distance = max(signed_edge_distance, 0.0);
  let path = rounded_box_path(point, half_extent, radius);
  let orbit = params.time / 3.6;
  let orbit_phase = fract(orbit);
  let orbit_wave = orbit_phase * TAU;
  let motion_offset = sin(orbit_wave - 0.8) * 0.055
    + sin(orbit_wave * 2.0 + 0.5) * 0.012;
  let initial_motion_offset = sin(-0.8) * 0.055 + sin(0.5) * 0.012;
  let motion = orbit_phase + motion_offset - initial_motion_offset;
  let speed = 1.0
    + cos(orbit_wave - 0.8) * 0.055 * TAU
    + cos(orbit_wave * 2.0 + 0.5) * 0.024 * TAU;
  let speed_mix = smoothstep(0.52, 1.48, speed);
  let light_position = fract(motion + path.y);
  let path_offset = fract(path.x - light_position + 0.5) - 0.5;
  let half_width = mix(0.1, 0.14, speed_mix);
  let palette_position = clamp(path_offset / (half_width * 2.0) + 0.5, 0.0, 1.0);
  let normalized_offset = abs(path_offset) / half_width;
  let core_packet = 1.0 - smoothstep(0.58, 1.0, normalized_offset);
  let near_packet = 1.0 - smoothstep(0.48, 1.0, normalized_offset / 1.08);
  let far_packet = 1.0 - smoothstep(0.35, 1.0, normalized_offset / 1.2);
  let occlusion = smoothstep(-0.25, 0.35, signed_edge_distance);
  let rim = (1.0 - smoothstep(0.0, 1.25, exterior_distance)) * occlusion;
  let near_glow = exp(-exterior_distance / 4.2) * occlusion;
  let far_glow = exp(-exterior_distance / 12.5) * occlusion;
  let breathing = 0.92 + sin(params.time * 1.7 + orbit_wave * 0.35) * 0.08;
  let alpha = clamp(
    rim * core_packet * 0.78
      + near_glow * near_packet * 0.34
      + far_glow * far_packet * 0.15,
    0.0,
    0.95,
  ) * breathing;
  let color = backlight_color(palette_position);

  return vec4f(color * alpha, alpha);
}
