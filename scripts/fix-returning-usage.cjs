const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, '../server');

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;
  
  // Replace .insertId with .id for PostgreSQL
  if (content.includes('.insertId')) {
    content = content.replace(/\.insertId/g, '.id');
    modified = true;
  }
  
  // Replace affectedRows check with length check for PostgreSQL
  if (content.includes('.affectedRows')) {
    content = content.replace(/(\w+)\[0\]\.affectedRows/g, '$1.length');
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
console.log('Done fixing insertId and affectedRows');
