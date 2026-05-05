/**
 * fix-web-fonts.js
 * 
 * Este script se ejecuta DESPUÉS de `expo export -p web`.
 * 1. Copia los archivos .ttf de iconos a dist/fonts/
 * 2. Inyecta @font-face en todos los HTML para que funcionen en GitHub Pages.
 * 3. Corrige las rutas relativas en los archivos JS generados por Expo.
 */

const fs = require('fs');
const path = require('path');

const DIST_DIR = path.join(__dirname, '..', 'dist');
const FONTS_DIR = path.join(DIST_DIR, 'fonts');
const NODE_MODULES_FONTS = path.join(__dirname, '..', 'node_modules', '@expo/vector-icons', 'build', 'vendor', 'react-native-vector-icons', 'Fonts');

// Las familias de fuentes que necesitamos
const FONT_FAMILIES = [
  'Ionicons',
  'MaterialIcons',
  'MaterialCommunityIcons',
  'Feather',
  'FontAwesome',
  'FontAwesome5_Regular',
  'FontAwesome5_Solid',
  'FontAwesome5_Brands',
  'FontAwesome6_Regular',
  'FontAwesome6_Solid',
  'FontAwesome6_Brands',
];

console.log('🔧 Fixing web fonts for GitHub Pages...');

// 1. Crear directorio fonts/
if (!fs.existsSync(FONTS_DIR)) {
  fs.mkdirSync(FONTS_DIR, { recursive: true });
}

// 2. Copiar fuentes directamente desde node_modules
console.log('📦 Copying fonts from node_modules...');
const fontMappings = {};

for (const family of FONT_FAMILIES) {
  const srcPath = path.join(NODE_MODULES_FONTS, `${family}.ttf`);
  if (fs.existsSync(srcPath)) {
    const destName = `${family}.ttf`;
    const destPath = path.join(FONTS_DIR, destName);
    fs.copyFileSync(srcPath, destPath);
    fontMappings[family] = destName;
    console.log(`  ✅ Copied ${destName}`);
  } else {
    console.warn(`  ⚠️ Could not find ${family}.ttf in node_modules`);
  }
}

// 3. Inyectar @font-face en archivos HTML
function findFiles(dir, ext) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      results = results.concat(findFiles(fullPath, ext));
    } else if (item.name.endsWith(ext)) {
      results.push(fullPath);
    }
  }
  return results;
}

const htmlFiles = findFiles(DIST_DIR, '.html');
console.log(`\n📄 Patching ${htmlFiles.length} HTML files...`);

// Obtener baseUrl de app.json
let baseUrl = '/FinanzasApp';
try {
  const appJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf-8'));
  if (appJson.expo && appJson.expo.experiments && appJson.expo.experiments.baseUrl) {
    baseUrl = appJson.expo.experiments.baseUrl;
  }
} catch (e) {
  console.warn('Could not read baseUrl from app.json, using default /FinanzasApp');
}

const fontFaceCSS = Object.keys(fontMappings).map((family) => {
  const dest = `${family}.ttf`;
  const aliases = [family];
  
  if (family === 'Ionicons') aliases.push('ionicons');
  if (family === 'MaterialIcons') aliases.push('Material Icons', 'material', 'materialicons');
  if (family === 'MaterialCommunityIcons') aliases.push('Material Community Icons', 'materialcommunityicons', 'Material Design Icons', 'material-community');
  if (family === 'Feather') aliases.push('feather');
  if (family === 'FontAwesome') aliases.push('FontAwesome', 'fontawesome');
  
  return aliases.map(alias => 
    `@font-face { font-family: "${alias}"; src: url('${baseUrl}/fonts/${dest}') format('truetype'); font-display: swap; }`
  ).join('\n    ');
}).join('\n    ');

const styleTag = `\n  <style id="expo-vector-icons-fix">\n    ${fontFaceCSS}\n  </style>`;

for (const htmlPath of htmlFiles) {
  let html = fs.readFileSync(htmlPath, 'utf-8');
  if (html.includes('</head>') && !html.includes('expo-vector-icons-fix')) {
    html = html.replace('</head>', `${styleTag}\n</head>`);
  }
  // Viewport fix
  if (html.includes('name="viewport"')) {
    html = html.replace(/(<meta\s+name="viewport"\s+content=")([^"]*)(">)/, '$1width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no$3');
  }
  fs.writeFileSync(htmlPath, html, 'utf-8');
}

console.log('\n🎉 Web fonts fix complete!\n');

