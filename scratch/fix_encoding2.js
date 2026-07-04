const fs = require('fs');
let content = fs.readFileSync('app/(tabs)/profile.tsx', 'utf8');

const map = {
  'RecibirÃ¡s': 'Recibirás',
  'NotificaciÃ³n': 'Notificación',
  'Ã mbar': 'Ámbar',
  'Ã ndigo': 'Índigo',
  'DÃ AS': 'DÍAS',
  'DÃ A': 'DÍA',
  'TÃ TULO': 'TÍTULO'
};

for (const [bad, good] of Object.entries(map)) {
  content = content.split(bad).join(good);
}

fs.writeFileSync('app/(tabs)/profile.tsx', content, 'utf8');
console.log('Fixed encoding part 2');
