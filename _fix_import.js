const fs = require('fs');
const path = 'src/services/firestoreService.ts';
let content = fs.readFileSync(path, 'utf8');

// Fix the broken import line - replace the literal \r\n characters
content = content.replace(
    /from '\.\.\/types'; \\r\\nimport \{ passesLocalFilter, THREE_WEEKS_MS \} from '\.\/newsService';/,
    "from '../types';\nimport { passesLocalFilter, THREE_WEEKS_MS } from './newsService';"
);

fs.writeFileSync(path, content);
console.log('Fixed import line');
