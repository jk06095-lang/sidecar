const fs = require('fs');
const path = 'src/services/firestoreService.ts';
let content = fs.readFileSync(path, 'utf8');

// Fix: replace the garbled import line
// The broken line looks like: ...from '../types'; \r\nimport { passesLocalFilter...
content = content.replace(
    /from '\.\.\/types';[ ]*\\r\\nimport/,
    "from '../types';\nimport"
);

fs.writeFileSync(path, content);
console.log('Fixed import line');
