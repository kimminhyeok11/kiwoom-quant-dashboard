const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, '../server');

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;
  
  // Replace $returningId() with .returning()
  if (content.includes('$returningId()')) {
    content = content.replace(/\.\$returningId\(\)/g, '.returning()');
    modified = true;
  }
  
  if (modified) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Fixed: ${filePath}`);
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walkDir(filePath);
    } else if (file.endsWith('.ts')) {
      fixFile(filePath);
    }
  }
}

walkDir(serverPath);
console.log('Done fixing $returningId()');
