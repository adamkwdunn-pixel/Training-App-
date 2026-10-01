// Body fat estimation: US Navy circumference method and Jackson-Pollock skinfolds (+ Siri).

export const METHODS = {
  navy: 'US Navy (tape measure)',
  jp3: 'Calipers — Jackson-Pollock 3-site',
  jp7: 'Calipers — Jackson-Pollock 7-site',
  other: 'Other (DEXA, InBody, Bod Pod…)',
};

// Where to take each measurement.
export const SITES = {
  chest: { label: 'Chest', how: 'Diagonal fold halfway between the armpit crease and the nipple (men) / one third of the way (women).' },
  midaxillary: { label: 'Midaxillary', how: 'Vertical fold on the mid-armpit line, level with the bottom of the sternum.' },
  triceps: { label: 'Triceps', how: 'Vertical fold on the back of the upper arm, halfway between shoulder and elbow, arm relaxed.' },
  subscapular: { label: 'Subscapular', how: 'Diagonal fold just below the lower tip of the shoulder blade.' },
  abdominal: { label: 'Abdominal', how: 'Vertical fold 2 cm to the side of the belly button.' },
  suprailiac: { label: 'Suprailiac', how: 'Diagonal fold just above the front of the hip bone (iliac crest).' },
  thigh: { label: 'Thigh', how: 'Vertical fold on the front of the thigh, halfway between hip crease and kneecap, weight on the other leg.' },
};

export function sitesFor(method, sex) {
  if (method === 'jp7') return ['chest', 'midaxillary', 'triceps', 'subscapular', 'abdominal', 'suprailiac', 'thigh'];
  if (method === 'jp3') return sex === 'female' ? ['triceps', 'suprailiac', 'thigh'] : ['chest', 'abdominal', 'thigh'];
  return [];
}

export const TAPE = {
  neck: { label: 'Neck', how: 'Just below the Adam’s apple, tape sloping slightly down at the front. Don’t flare the neck.' },
  waist: { label: 'Waist', how: 'Men: horizontally at the belly button. Women: at the narrowest point. Relaxed, after breathing out.' },
  hip: { label: 'Hips', how: 'Women only: around the widest part of the buttocks, feet together.' },
};

/** Siri (1961): converts body density (g/cm³) to body fat %. */
export const siri = (density) => 495 / density - 450;

/**
 * Jackson-Pollock body density from the sum of skinfolds (mm).
 * 3-site — men: chest, abdominal, thigh · women: triceps, suprailiac, thigh.
 * 7-site — chest, midaxillary, triceps, subscapular, abdominal, suprailiac, thigh.
 */
export function jacksonPollock({ method, sex, age, sites }) {
  const keys = sitesFor(method, sex);
  const vals = keys.map((k) => Number(sites?.[k]));
  if (!sex || age == null || vals.some((v) => !(v > 0))) return null;
  const S = vals.reduce((a, b) => a + b, 0);
  let d;
  if (method === 'jp3') {
    d = sex === 'female'
      ? 1.0994921 - 0.0009929 * S + 0.0000023 * S * S - 0.0001392 * age
      : 1.10938 - 0.0008267 * S + 0.0000016 * S * S - 0.0002574 * age;
  } else {
    d = sex === 'female'
      ? 1.097 - 0.00046971 * S + 0.00000056 * S * S - 0.00012828 * age
      : 1.112 - 0.00043499 * S + 0.00000055 * S * S - 0.00028826 * age;
  }
  return { sum: Math.round(S * 10) / 10, density: Math.round(d * 100000) / 100000, pct: round1(siri(d)) };
}

/**
 * US Navy method (Hodgdon & Beckett, 1984), all lengths in cm.
 * Men:   %BF = 495 / (1.0324 − 0.19077·log10(waist − neck) + 0.15456·log10(height)) − 450
 * Women: %BF = 495 / (1.29579 − 0.35004·log10(waist + hip − neck) + 0.22100·log10(height)) − 450
 */
export function navyBodyFat({ sex, height, neck, waist, hip }) {
  const h = Number(height);
  const n = Number(neck);
  const w = Number(waist);
  const hp = Number(hip);
  if (!sex || !(h > 0) || !(n > 0) || !(w > 0)) return null;
  if (sex === 'female') {
    if (!(hp > 0) || w + hp - n <= 0) return null;
    return round1(495 / (1.29579 - 0.35004 * Math.log10(w + hp - n) + 0.221 * Math.log10(h)) - 450);
  }
  if (w - n <= 0) return null;
  return round1(495 / (1.0324 - 0.19077 * Math.log10(w - n) + 0.15456 * Math.log10(h)) - 450);
}

/** Fat and lean mass from bodyweight and body fat %. */
export function composition(weight, pct) {
  if (!weight || pct == null) return { fat_mass: null, lean_mass: null };
  const fat = (weight * pct) / 100;
  return { fat_mass: round1(fat), lean_mass: round1(weight - fat) };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}
