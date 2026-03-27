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
const ASSETS_DIR = path.join(DIST_DIR, 'assets');

// Las familias de fuentes que necesitamos
const FONT_FAMILIES = [
  'Ionicons',
  'MaterialIcons',
  'MaterialCommunityIcons',
  'Feather',
  'FontAwesome',
];

// Buscar archivos recursivamente
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

console.log('🔧 Fixing web fonts for GitHub Pages...');

// 1. Crear directorio fonts/
if (!fs.existsSync(FONTS_DIR)) {
  fs.mkdirSync(FONTS_DIR, { recursive: true });
}

// 2. Encontrar todos los archivos .ttf en dist/assets/
const ttfFiles = findFiles(ASSETS_DIR, '.ttf');
console.log(`Found ${ttfFiles.length} .ttf files in dist/assets/`);

// 3. Copiar los que coincidan con nuestras familias y mapear nombres reales de archivos de Expo
const fontMappings = {}; // mapping from original filename to family.ttf

for (const ttfPath of ttfFiles) {
  const fileName = path.basename(ttfPath);
  
  for (const family of FONT_FAMILIES) {
    if (fileName.startsWith(family + '.')) {
      const destName = `${family}.ttf`;
      const destPath = path.join(FONTS_DIR, destName);
      fs.copyFileSync(ttfPath, destPath);
      fontMappings[fileName] = destName;
      console.log(`  ✅ Copied ${fileName} → fonts/${destName}`);
      break;
    }
  }
}

// 4. Inyectar @font-face en archivos HTML
const htmlFiles = findFiles(DIST_DIR, '.html');
console.log(`\n📄 Patching ${htmlFiles.length} HTML files...`);

const fontFaceCSS = Object.entries(fontMappings).map(([orig, dest]) => {
  const family = dest.replace('.ttf', '');
  const aliases = [family];
  if (family === 'Ionicons') aliases.push('ionicons');
  if (family === 'MaterialIcons') aliases.push('Material Icons', 'material', 'materialicons');
  if (family === 'MaterialCommunityIcons') aliases.push('Material Community Icons', 'materialcommunityicons');
  if (family === 'Feather') aliases.push('feather');
  if (family === 'FontAwesome') aliases.push('fontawesome');
  
  return aliases.map(alias => 
    `@font-face { font-family: "${alias}"; src: url('/FinanzasApp/fonts/${dest}') format('truetype'); font-display: swap; }`
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

// 5. PARTE CRÍTICA: Reemplazar rutas en archivos JS generados
console.log('\n📦 Patching JS bundles to fix relative font paths...');
const jsFiles = findFiles(DIST_DIR, '.js');

for (const jsPath of jsFiles) {
  let content = fs.readFileSync(jsPath, 'utf-8');
  let replacedAny = false;

  Object.entries(fontMappings).forEach(([orig, dest]) => {
    // Buscar la ruta de assets que Expo usa: "assets/node_modules/..." o "/assets/..."
    const regex = new RegExp(`[\\/]assets[\\/]node_modules[\\/].*?${orig.replace('.', '\\.')}`, 'g');
    if (regex.test(content)) {
      content = content.replace(regex, `/FinanzasApp/fonts/${dest}`);
      replacedAny = true;
    }
  });

  if (replacedAny) {
    fs.writeFileSync(jsPath, content, 'utf-8');
    console.log(`  ✅ Patched ${path.relative(DIST_DIR, jsPath)}`);
  }
}

console.log('\n🎉 Web fonts fix complete!\n');
