const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

function cleanCachesRecursive(dir, isNodeModules = false) {
  if (!fs.existsSync(dir)) return;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const parentDir = path.basename(dir);
        // Only remove .cxx folders, or build folders located under android/
        if (entry.name === '.cxx' || (entry.name === 'build' && parentDir === 'android')) {
          try {
            fs.rmSync(fullPath, { recursive: true, force: true });
            console.log('✅ Removed stale cache:', fullPath);
          } catch (e) {
            console.warn('⚠️ Could not remove at:', fullPath, e.message);
          }
        } else if (entry.name !== '.git') {
          cleanCachesRecursive(fullPath, isNodeModules || entry.name === 'node_modules');
        }
      }
    }
  } catch (_) {}
}

function patchCMakeLists(dir) {
  if (!fs.existsSync(dir)) return;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== '.git') {
        patchCMakeLists(fullPath);
      } else if (entry.name === 'CMakeLists.txt') {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.includes('CONFIGURE_DEPENDS')) {
          const patched = content.replace(/CONFIGURE_DEPENDS/g, '');
          fs.writeFileSync(fullPath, patched, 'utf8');
          console.log('🔧 Patched CMakeLists.txt (removed CONFIGURE_DEPENDS):', fullPath);
        }
      }
    }
  } catch (_) {}
}

console.log('🧹 Purging all .cxx and stale native build directories in workspace...');
cleanCachesRecursive(ROOT_DIR);
patchCMakeLists(path.join(ROOT_DIR, 'node_modules'));
console.log('✨ All caches cleaned and CMake scripts patched.');

