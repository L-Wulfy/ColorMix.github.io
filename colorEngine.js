/**
 * ColorEngine - Matematické jádro pro míchání a analýzu barev
 * Podporuje:
 * 1. Digitální míchání (RGB - vážený energetický průměr světla)
 * 2. Fyzikální míchání (Pigment - subtraktivní RYB / pigmentové modelování)
 * 3. Převody formátů (HEX, RGB, HSL, CMYK)
 * 4. Barevné harmonie (komplementární, analogické, triáda, split-komplementární)
 * 5. Pojmenování barev (nejbližší shoda v bohatém slovníku)
 */

(function () {
  'use strict';

  // ==========================================
  // 1. ZÁKLADNÍ PŘEVODY FORMÁTŮ
  // ==========================================

function hexToRgb(hex) {
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map(c => c + c).join('');
  }
  const num = parseInt(clean, 16);
  if (isNaN(num) || clean.length !== 6) {
    return { r: 128, g: 128, b: 128 };
  }
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function rgbToHex(r, g, b) {
  const clamp = v => Math.min(255, Math.max(0, Math.round(v)));
  const toHex = v => clamp(v).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn: h = (gn - bn) / d + (gn < bn ? 6 : 0); break;
      case gn: h = (bn - rn) / d + 2; break;
      case bn: h = (rn - gn) / d + 4; break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

function hslToRgb(h, s, l) {
  h = (h % 360 + 360) % 360;
  s = Math.min(100, Math.max(0, s)) / 100;
  l = Math.min(100, Math.max(0, l)) / 100;

  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }

  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hn = h / 360;

  return {
    r: Math.round(hue2rgb(p, q, hn + 1/3) * 255),
    g: Math.round(hue2rgb(p, q, hn) * 255),
    b: Math.round(hue2rgb(p, q, hn - 1/3) * 255)
  };
}

function rgbToCmyk(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const k = 1 - Math.max(rn, gn, bn);
  if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };
  const c = Math.round(((1 - rn - k) / (1 - k)) * 100);
  const m = Math.round(((1 - gn - k) / (1 - k)) * 100);
  const y = Math.round(((1 - bn - k) / (1 - k)) * 100);
  return { c, m, y, k: Math.round(k * 100) };
}

// ==========================================
// 2. DIGITÁLNÍ MÍCHÁNÍ (Optické aditivní světlo - RGB)
// ==========================================

function srgbToLinear(c) {
  const v = c / 255.0;
  return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92;
}

function linearToSrgb(v) {
  const clamped = Math.max(0.0, Math.min(1.0, v));
  const c = clamped > 0.0031308 ? (1.055 * Math.pow(clamped, 1.0 / 2.4) - 0.055) : 12.92 * clamped;
  return Math.min(255, Math.max(0, Math.round(c * 255.0)));
}

/**
 * Optické aditivní míchání světla v lineárním gamma prostoru.
 * Červená + Zelená = Zářivá žlutá (#FFFF00)
 * Červená + Modrá = Zářivá magenta (#FF00FF)
 * Zelená + Modrá = Zářivá azurová (#00FFFF)
 * R + G + B = Čistá bílá (#FFFFFF)
 * Zohledňuje váhy svítivosti, bílé ředění i stmívání černou.
 */
function mixDigital(colorEntries) {
  if (!colorEntries || colorEntries.length === 0) {
    return { r: 0, g: 0, b: 0, hex: '#000000' };
  }

  let totalWeight = 0;
  let sumLr = 0.0;
  let sumLg = 0.0;
  let sumLb = 0.0;
  let sumV = 0.0;
  let maxEntryWeight = 0.0;

  colorEntries.forEach(item => {
    const rgb = typeof item.hex === 'string' ? hexToRgb(item.hex) : item;
    const weight = Math.max(0.01, item.weight || 1);
    totalWeight += weight;
    if (weight > maxEntryWeight) maxEntryWeight = weight;

    const lr = srgbToLinear(rgb.r);
    const lg = srgbToLinear(rgb.g);
    const lb = srgbToLinear(rgb.b);

    sumLr += lr * weight;
    sumLg += lg * weight;
    sumLb += lb * weight;
    sumV += Math.max(lr, lg, lb) * weight;
  });

  const maxL = Math.max(sumLr, sumLg, sumLb);
  if (maxL <= 1e-6) {
    return { r: 0, g: 0, b: 0, hex: '#000000' };
  }

  // Optická aditivní balance: skládá paprsky a zachovává energetické poměry
  const targetV = Math.min(1.0, Math.max(sumV / totalWeight, maxL / maxEntryWeight));
  const scale = targetV / maxL;

  const r = linearToSrgb(sumLr * scale);
  const g = linearToSrgb(sumLg * scale);
  const b = linearToSrgb(sumLb * scale);

  return { r, g, b, hex: rgbToHex(r, g, b) };
}

// ==========================================
// 3. FYZIKÁLNÍ MÍCHÁNÍ (Pigmentové / RYB Model)
// ==========================================

/**
 * Převod z barevného kruhu RGB (0-360) do malířského kruhu RYB (0-360).
 * Zajišťuje reálné chování pigmentů:
 * Žlutá + Modrá = Zelená
 * Červená + Žlutá = Oranžová
 * Červená + Modrá = Fialová
 */
function rgbHueToRybHue(hRgb) {
  const h = (hRgb % 360 + 360) % 360;
  const pts = [
    [0, 0],
    [30, 60],
    [60, 120],
    [120, 180],
    [180, 210],
    [240, 240],
    [300, 300],
    [360, 360]
  ];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    if (h >= x0 && h <= x1) {
      const t = (h - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return h;
}

/**
 * Převod z malířského kruhu RYB (0-360) zpět do RGB odstínu (0-360).
 */
function rybHueToRgbHue(hRyb) {
  const h = (hRyb % 360 + 360) % 360;
  const pts = [
    [0, 0],
    [60, 30],
    [120, 60],
    [180, 120],
    [210, 180],
    [240, 240],
    [300, 300],
    [360, 360]
  ];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    if (h >= x0 && h <= x1) {
      const t = (h - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return h;
}

/**
 * Vektorové barycentrické míchání fyzických pigmentů (RYB model).
 * Přesně modeluje absorpci světla v pigmentových směsích, vznik syté zelené
 * ze žluté a modré, vznik zemitých hnědých tónů (pálená umbra) při neutralizaci
 * a správné tónování bílým/černým pigmentem.
 */
function mixPigment(colorEntries) {
  if (!colorEntries || colorEntries.length === 0) {
    return { r: 255, g: 255, b: 255, hex: '#FFFFFF' };
  }

  let totalWeight = 0;
  let sumVx = 0.0;
  let sumVy = 0.0;
  let sumS = 0.0;
  let sumL = 0.0;

  colorEntries.forEach(item => {
    const rgb = typeof item.hex === 'string' ? hexToRgb(item.hex) : item;
    const weight = Math.max(0.01, item.weight || 1);
    totalWeight += weight;

    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const sNorm = hsl.s / 100.0;
    const lNorm = hsl.l / 100.0;
    const rybHue = rgbHueToRybHue(hsl.h);
    const rad = (rybHue * Math.PI) / 180.0;

    sumVx += Math.cos(rad) * sNorm * weight;
    sumVy += Math.sin(rad) * sNorm * weight;
    sumS += sNorm * weight;
    sumL += lNorm * weight;
  });

  const avgVx = sumVx / totalWeight;
  const avgVy = sumVy / totalWeight;
  const vecMag = Math.hypot(avgVx, avgVy);
  const avgS = sumS / totalWeight;

  // cancellation se počítá pouze tehdy, pokud do směsi vstupují syté barvy (avgS > 0.05)
  // U čistě achromatických barev (černá, bílá, šedá) nesmí dojít k falešnému zhnědnutí
  const cancellation = avgS > 0.05
    ? Math.max(0.0, Math.min(1.0, 1.0 - (vecMag / avgS)))
    : 0.0;

  let mixedRybHue = 0.0;
  let finalS = 0.0;
  if (vecMag >= 1e-5) {
    mixedRybHue = ((Math.atan2(avgVy, avgVx) * 180.0) / Math.PI + 360.0) % 360.0;
    finalS = vecMag;
  }

  let finalRgbHue = rybHueToRgbHue(mixedRybHue);

  // Subtraktivní ztmavnutí směsi (fyzikální absorpce) - pouze při interferenci/rušení různých barev
  const baseL = sumL / totalWeight;
  const subDrop = 0.22 * cancellation * (1.0 - Math.abs(baseL - 0.5) * 2.0);
  const finalL = Math.max(0.0, Math.min(1.0, baseL - subDrop));

  // Autentická teplá zemitá hněď při vzájemné neutralizaci sytých komplementárních pigmentů
  // (pouze pokud směs skutečně obsahovala syté barvy avgS > 0.2, ne černou/bílou/šedou!)
  if (avgS > 0.2 && cancellation > 0.45 && finalS < 0.35) {
    finalRgbHue = 30.0;
    finalS = Math.max(finalS, 0.25 * (1.0 - Math.abs(finalL - 0.3) * 2.0));
  }

  // Pokud byla směs složena výhradně z achromatických barev (černá, bílá, šedá), saturace je čistá 0
  if (avgS < 0.02) {
    finalS = 0.0;
  }

  const res = hslToRgb(finalRgbHue, finalS * 100.0, finalL * 100.0);
  return {
    ...res,
    hex: rgbToHex(res.r, res.g, res.b)
  };
}

// ==========================================
// 4. BAREVNÉ HARMONIE
// ==========================================

function getHarmonies(hex) {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

  // Speciální inteligentní režim pro neutrální / achromatické barvy (černá, bílá a odstíny šedé)
  // U nich standardní rotace úhlu Hue (h + 180°, triáda) nedává smysl a dříve vracela jen stejnou šedou.
  if (hsl.s <= 4) {
    const isVeryDark = hsl.l < 25;
    const isVeryLight = hsl.l > 75;

    // Maximální tónový kontrast (světlostní protipól)
    const oppositeL = hsl.l > 50 ? 10 : 92;
    const oppositeColor = hslToRgb(0, 0, oppositeL);

    // Výrazné designérské akcenty, které se k neutrálním barvám dokonale hodí
    const makeAccent = (h, s = 88, l = isVeryLight ? 45 : 62) => {
      const c = hslToRgb(h, s, l);
      return { hex: rgbToHex(c.r, c.g, c.b), hsl: { h, s, l } };
    };

    return {
      isAchromatic: true,
      complementary: [
        { label: 'Základní', hex, hsl },
        { label: 'Kontrastní protipól', hex: rgbToHex(oppositeColor.r, oppositeColor.g, oppositeColor.b), hsl: { h: 0, s: 0, l: oppositeL } }
      ],
      analogous: [
        { label: 'Hluboká čerň', hex: '#0F172A', hsl: { h: 222, s: 47, l: 11 } },
        { label: 'Neutrální šedá', hex: '#64748B', hsl: { h: 215, s: 16, l: 47 } },
        { label: 'Čistá bílá', hex: '#F8FAFC', hsl: { h: 210, s: 40, l: 98 } }
      ],
      triadic: [
        { label: 'Královská modř', ...makeAccent(217, 90, isVeryLight ? 50 : 65) },
        { label: 'Zářivý jantar', ...makeAccent(38, 95, isVeryLight ? 48 : 58) },
        { label: 'Smaragdový akcent', ...makeAccent(158, 80, isVeryLight ? 42 : 55) }
      ],
      monochromatic: [
        { label: 'Tmavý stupeň', hex: rgbToHex(hslToRgb(0, 0, Math.max(5, hsl.l - 30)).r, hslToRgb(0, 0, Math.max(5, hsl.l - 30)).g, hslToRgb(0, 0, Math.max(5, hsl.l - 30)).b), hsl: { h: 0, s: 0, l: Math.max(5, hsl.l - 30) } },
        { label: 'Základní', hex, hsl },
        { label: 'Světlý stupeň', hex: rgbToHex(hslToRgb(0, 0, Math.min(96, hsl.l + 30)).r, hslToRgb(0, 0, Math.min(96, hsl.l + 30)).g, hslToRgb(0, 0, Math.min(96, hsl.l + 30)).b), hsl: { h: 0, s: 0, l: Math.min(96, hsl.l + 30) } }
      ]
    };
  }

  const makeColor = (hOffset, sFactor = 1, lFactor = 1) => {
    const h = (hsl.h + hOffset + 360) % 360;
    const s = Math.min(100, Math.max(10, hsl.s * sFactor));
    const l = Math.min(95, Math.max(10, hsl.l * lFactor));
    const converted = hslToRgb(h, s, l);
    return {
      hex: rgbToHex(converted.r, converted.g, converted.b),
      hsl: { h, s, l }
    };
  };

  return {
    isAchromatic: false,
    complementary: [
      { label: 'Základní', ...makeColor(0) },
      { label: 'Komplementární', ...makeColor(180) }
    ],
    analogous: [
      { label: '-30° Odstín', ...makeColor(-30) },
      { label: 'Základní', ...makeColor(0) },
      { label: '+30° Odstín', ...makeColor(30) }
    ],
    triadic: [
      { label: 'Základní', ...makeColor(0) },
      { label: 'Triáda 1', ...makeColor(120) },
      { label: 'Triáda 2', ...makeColor(240) }
    ],
    monochromatic: [
      { label: 'Tmavý tón', ...makeColor(0, 1.1, 0.5) },
      { label: 'Základní', ...makeColor(0) },
      { label: 'Světlý tón', ...makeColor(0, 0.8, 1.4) }
    ]
  };
}

// ==========================================
// 5. POJMENOVÁNÍ BAREV (Databáze + Algoritmus)
// ==========================================

function rgbToLab(r, g, b) {
  let lr = r / 255.0;
  let lg = g / 255.0;
  let lb = b / 255.0;

  lr = lr > 0.04045 ? Math.pow((lr + 0.055) / 1.055, 2.4) : lr / 12.92;
  lg = lg > 0.04045 ? Math.pow((lg + 0.055) / 1.055, 2.4) : lr / 12.92;
  lb = lb > 0.04045 ? Math.pow((lb + 0.055) / 1.055, 2.4) : lb / 12.92;

  let x = lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375;
  let y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.0721750;
  let z = lr * 0.0193339 + lg * 0.1191920 + lb * 0.9503041;

  x /= 0.95047;
  y /= 1.00000;
  z /= 1.08883;

  const pivot = t => t > 0.008856 ? Math.pow(t, 1.0/3.0) : (7.787 * t) + (16.0 / 116.0);

  const fx = pivot(x);
  const fy = pivot(y);
  const fz = pivot(z);

  const l = (116.0 * fy) - 16.0;
  const a = 500.0 * (fx - fy);
  const bVal = 200.0 * (fy - fz);

  return { l, a, b: bVal };
}

function deltaE(lab1, lab2) {
  return Math.sqrt(
    Math.pow(lab1.l - lab2.l, 2) +
    Math.pow(lab1.a - lab2.a, 2) +
    Math.pow(lab1.b - lab2.b, 2)
  );
}

const COLOR_NAMES = [
  // Neutrální a šedé
  { name: "Sněhově bílá", hex: "#FFFFFF" },
  { name: "Lomenná bílá", hex: "#F8F8F8" },
  { name: "Perlově šedá", hex: "#E5E5E5" },
  { name: "Světle šedá", hex: "#D3D3D3" },
  { name: "Stříbřitě šedá", hex: "#C0C0C0" },
  { name: "Středně šedá", hex: "#808080" },
  { name: "Břidlicově šedá", hex: "#708090" },
  { name: "Antracitová", hex: "#383838" },
  { name: "Skoro černý", hex: "#242424" },
  { name: "Uhlíkově černá", hex: "#111111" },
  { name: "Hluboká čerň", hex: "#000000" },

  // Béžové, zemité a hnědé (kritické pro pigmentové směsi!)
  { name: "Pískově béžová", hex: "#E6D7B8" },
  { name: "Teplá béžová", hex: "#F5F5DC" },
  { name: "Hliněná", hex: "#A18973" },
  { name: "Šedohnědá (Taupe)", hex: "#8B8589" },
  { name: "Velbloudí srst", hex: "#C19A6B" },
  { name: "Skořicová", hex: "#D2691E" },
  { name: "Karamelová", hex: "#AF6E4D" },
  { name: "Oříškově hnědá", hex: "#8D5B4C" },
  { name: "Čokoládová", hex: "#3D2314" },
  { name: "Kávová", hex: "#5A3D28" },
  { name: "Kaštanová", hex: "#6F4E37" },
  { name: "Terakota", hex: "#E2725B" },
  { name: "Cihlová", hex: "#B22222" },
  { name: "Okrová", hex: "#CC7722" },
  { name: "Khaki", hex: "#8F8B66" },

  // Červené a vínové
  { name: "Šarlatově červená", hex: "#FF2400" },
  { name: "Karmínová", hex: "#DC143C" },
  { name: "Rubínová", hex: "#E0115F" },
  { name: "Jahodová", hex: "#D53032" },
  { name: "Vínová bordeaux", hex: "#800020" },
  { name: "Krvavě rudá", hex: "#8B0000" },
  { name: "Korálově červená", hex: "#F88379" },
  { name: "Lososová", hex: "#FA8072" },
  { name: "Růžová", hex: "#FF69B4" },
  { name: "Pudrová růže", hex: "#FFB6C1" },

  // Oranžové
  { name: "Zářivě oranžová", hex: "#FF7F00" },
  { name: "Mandarinková", hex: "#FFA500" },
  { name: "Jantarová", hex: "#FFBF00" },
  { name: "Meruňková", hex: "#FBCEB1" },
  { name: "Broskvová", hex: "#FFE5B4" },
  { name: "Hřejivá oranžová", hex: "#FFA143" },

  // Žluté
  { name: "Slunečná žluť", hex: "#FFD700" },
  { name: "Citrónová", hex: "#FFF44F" },
  { name: "Vyblitá žluť", hex: "#F7EE8A" },
  { name: "Kanárkově žlutá", hex: "#FFEF00" },
  { name: "Zlatožlutá", hex: "#FFC000" },
  { name: "Vanilková", hex: "#F3E5AB" },
  { name: "Hořčicová", hex: "#E1AD01" },

  // Zelené
  { name: "Svěží zelená", hex: "#88BB69" },
  { name: "Trávově zelená", hex: "#4CBB17" },
  { name: "Limetková", hex: "#32CD32" },
  { name: "Jablečně zelená", hex: "#8DB600" },
  { name: "Smaragdová", hex: "#50C878" },
  { name: "Nefritová", hex: "#00A86B" },
  { name: "Lesní zeleň", hex: "#228B22" },
  { name: "Olivová", hex: "#808000" },
  { name: "Mátová", hex: "#98FF98" },
  { name: "Šalvějová", hex: "#9DC183" },
  { name: "Pistáciová", hex: "#93C572" },
  { name: "Mechová", hex: "#6B7D4F" },

  // Azurové a tyrkysové
  { name: "Tyrkysová laguna", hex: "#40E0D0" },
  { name: "Akvamarínová", hex: "#7FFFD4" },
  { name: "Azurová (Cyan)", hex: "#00FFFF" },
  { name: "Petrolejová", hex: "#005F73" },
  { name: "Ledově modrá", hex: "#AFEEEE" },

  // Modré
  { name: "Blankytně modrá", hex: "#007FFF" },
  { name: "Královská modř", hex: "#4169E1" },
  { name: "Kobaltová", hex: "#0047AB" },
  { name: "Námořnická modř", hex: "#000080" },
  { name: "Půlnoční safír", hex: "#191970" },
  { name: "Ocelově modrá", hex: "#4682B4" },
  { name: "Džínová", hex: "#1560BD" },

  // Fialové a purpurové
  { name: "Levandulová", hex: "#E6E6FA" },
  { name: "Šeříková", hex: "#C8A2C8" },
  { name: "Ametystová", hex: "#9966CC" },
  { name: "Slívová", hex: "#8E4585" },
  { name: "Fialka", hex: "#800080" },
  { name: "Tmavě purpurová", hex: "#4B0076" },
  { name: "Fuchsiová / Magenta", hex: "#FF00FF" },
  { name: "Malinová", hex: "#E30B5C" }
];

// Precompute LAB values
COLOR_NAMES.forEach(item => {
  const rgb = hexToRgb(item.hex);
  item.lab = rgbToLab(rgb.r, rgb.g, rgb.b);
});

function getColorName(hex) {
  const target = hexToRgb(hex);
  const targetLab = rgbToLab(target.r, target.g, target.b);

  let bestMatch = COLOR_NAMES[0];
  let minDistance = Infinity;

  COLOR_NAMES.forEach(item => {
    const dist = deltaE(targetLab, item.lab);
    if (dist < minDistance) {
      minDistance = dist;
      bestMatch = item;
    }
  });

  return bestMatch.name;
}

// ==========================================
// 6. SERIALIZACE URL A SDÍLENÍ
// ==========================================

function serializeToUrlParams(mode, slots) {
  // Formát: ?mode=pigment&slots=FF0000:2,00FF00:1,0000FF:3
  const slotStr = slots
    .map(s => `${s.hex.replace('#', '').toUpperCase()}:${s.weight}`)
    .join(',');
  return `?mode=${mode}&slots=${encodeURIComponent(slotStr)}`;
}

function parseFromUrlParams(search) {
  if (!search) return null;
  const params = new URLSearchParams(search);
  const mode = params.get('mode') === 'rgb' ? 'rgb' : 'pigment';
  const slotsParam = params.get('slots');

  if (!slotsParam) return null;

  try {
    const rawSlots = decodeURIComponent(slotsParam).split(',');
    const slots = rawSlots.slice(0, 8).map(entry => {
      const [hexPart, weightPart] = entry.split(':');
      const hex = `#${hexPart.replace('#', '')}`;
      const weight = parseInt(weightPart, 10) || 1;
      return {
        hex: /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : '#3B82F6',
        weight: Math.min(10, Math.max(1, weight))
      };
    });

    if (slots.length < 2) return null;
    return { mode, slots };
  } catch (e) {
    console.warn('Chyba při čtení URL parametrů:', e);
    return null;
  }
}

// Podpora pro běh přímo v prohlížeči (včetně file:// protokolu) i ES modulů
const ColorEngine = {
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  hslToRgb,
  rgbToCmyk,
  mixDigital,
  mixPigment,
  getHarmonies,
  getColorName,
  serializeToUrlParams,
  parseFromUrlParams
};

if (typeof window !== 'undefined') {
  window.ColorEngine = ColorEngine;
}
})();
