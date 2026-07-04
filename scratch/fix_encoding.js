const fs = require('fs');
let content = fs.readFileSync('app/(tabs)/profile.tsx', 'utf8');

const map = {
  'InversiÃ³n': 'Inversión',
  'dÃ­as': 'días',
  'dÃ­a': 'día',
  'DÃ A': 'DÍA',
  'EducaciÃ³n': 'Educación',
  'asÃ­': 'así',
  'cerrarÃ¡s': 'cerrarás',
  'CategorÃ­a': 'Categoría',
  'categorÃ­a': 'categoría',
  'estÃ¡n': 'están',
  'versiÃ³n': 'versión',
  'recibirÃ¡s': 'recibirás',
  'Â¡': '¡',
  'suscripciÃ³n': 'suscripción',
  'interÃ©s': 'interés',
  'Â¿': '¿',
  'SabÃ­as': 'Sabías',
  'notificaciÃ³n': 'notificación',
  'dinÃ¡micas': 'dinámicas',
  'mÃ¡s': 'más',
  'Ãºltimos': 'últimos',
  'EstadÃ­sticas': 'Estadísticas',
  'AnÃ¡lisis': 'Análisis',
  'BotÃ³n': 'Botón',
  'lÃ­mites': 'límites',
  'automÃ¡ticas': 'automáticas',
  'OcÃ©ano': 'Océano',
  'Ã mbar': 'Ámbar',
  'Ã ndigo': 'Índigo',
  'DÃ AS': 'DÍAS',
  'DistribuciÃ³n': 'Distribución',
  'afectÃ³': 'afectó',
  'TÃ TULO': 'TÍTULO',
  'repetirÃ¡': 'repetirá'
};

for (const [bad, good] of Object.entries(map)) {
  content = content.split(bad).join(good);
}

fs.writeFileSync('app/(tabs)/profile.tsx', content, 'utf8');
console.log('Fixed encoding in profile.tsx');
