/**
 * fix-web-fonts.js
 * 
 * Este script se ejecuta DESPUÉS de `expo export -p web`.
 * Copia los archivos .ttf de iconos a dist/fonts/ y los inyecta
 * en todos los HTML generados para que funcionen en GitHub Pages.
 */

const fs = require('fs');
const path = require('path');

const DIST_DIR = path.join(__dirname, '..', 'dist');
const FONTS_DIR = path.join(DIST_DIR, 'fonts');
const ASSETS_DIR = path.join(DIST_DIR, 'assets');

// Las familias de fuentes que necesitamos
const FONT_FAMILIES = [
  'Ionicons',
  'MaterialIcons',
  'MaterialCommunityIcons',
  'Feather',
  'FontAwesome',
];

// Buscar archivos .ttf recursivamente
function findTTFFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      results = results.concat(findTTFFiles(fullPath));
    } else if (item.name.endsWith('.ttf')) {
      results.push(fullPath);
    }
  }
  return results;
}

// Buscar archivos HTML recursivamente
function findHTMLFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      results = results.concat(findHTMLFiles(fullPath));
    } else if (item.name.endsWith('.html')) {
      results.push(fullPath);
    }
  }
  return results;
}

console.log('🔧 Fixing web fonts for GitHub Pages...\n');

// 1. Crear directorio fonts/
if (!fs.existsSync(FONTS_DIR)) {
  fs.mkdirSync(FONTS_DIR, { recursive: true });
}

// 2. Encontrar todos los archivos .ttf en dist/assets/
const ttfFiles = findTTFFiles(ASSETS_DIR);
console.log(`Found ${ttfFiles.length} .ttf files in dist/assets/`);

// 3. Copiar los que coincidan con nuestras familias de fuentes
const copiedFonts = [];
for (const ttfPath of ttfFiles) {
  const fileName = path.basename(ttfPath);
  
  for (const family of FONT_FAMILIES) {
    if (fileName.startsWith(family + '.')) {
      const destName = `${family}.ttf`;
      const destPath = path.join(FONTS_DIR, destName);
      fs.copyFileSync(ttfPath, destPath);
      copiedFonts.push({ family, destName });
      console.log(`  ✅ Copied ${fileName} → fonts/${destName}`);
      break;
    }
  }
}

// 4. Generar el bloque CSS con @font-face
// Expo genera internamente estos nombres: "ionicons", "material", "feather" (minúsculas)
// @expo/vector-icons usa: "Ionicons", "MaterialIcons", "Feather" (capitalizadas)
const fontFaceCSS = copiedFonts.map(({ family, destName }) => {
  const aliases = [family];
  
  // Agregar TODOS los aliases posibles
  if (family === 'Ionicons') {
    aliases.push('ionicons');
  }
  if (family === 'MaterialIcons') {
    aliases.push('Material Icons', 'material', 'materialicons');
  }
  if (family === 'MaterialCommunityIcons') {
    aliases.push('Material Community Icons', 'materialcommunityicons');
  }
  if (family === 'Feather') {
    aliases.push('feather');
  }
  if (family === 'FontAwesome') {
    aliases.push('fontawesome');
  }
  
  return aliases.map(alias => 
    `@font-face { font-family: "${alias}"; src: url('/FinanzasApp/fonts/${destName}') format('truetype'); font-display: swap; }`
  ).join('\n    ');
}).join('\n    ');

const styleTag = `
  <style id="expo-vector-icons-fix">
    ${fontFaceCSS}
  </style>`;

console.log(`\n📝 Generated @font-face rules for ${copiedFonts.length} font families`);

// 5. Inyectar en todos los archivos HTML
const htmlFiles = findHTMLFiles(DIST_DIR);
console.log(`\n📄 Found ${htmlFiles.length} HTML files to patch`);

for (const htmlPath of htmlFiles) {
  let html = fs.readFileSync(htmlPath, 'utf-8');
  
  // Insertar fuentes antes de </head>
  if (html.includes('</head>') && !html.includes('expo-vector-icons-fix')) {
    html = html.replace('</head>', `${styleTag}\n</head>`);
  }
  
  // Fix iOS Safari zoom: forzar maximum-scale=1
  if (html.includes('name="viewport"')) {
    // Reemplazar el viewport existente para incluir maximum-scale=1
    html = html.replace(
      /(<meta\s+name="viewport"\s+content=")([^"]*)(">)/,
      '$1width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no$3'
    );
  } else if (html.includes('</head>')) {
    // Si no hay viewport, añadir uno
    html = html.replace('</head>', '  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">\n</head>');
  }
  
  fs.writeFileSync(htmlPath, html, 'utf-8');
  console.log(`  ✅ Patched ${path.relative(DIST_DIR, htmlPath)}`);
}

console.log('\n🎉 Web fonts fix complete!\n');
