const { execSync } = require('child_process');
const fs = require('fs');

console.log('📦 Starting build process...');

// Check if we are in cPanel or a restricted environment
const isCpanel = process.env.HOME && (process.env.HOME.includes('lazemees') || process.env.HOME.includes('passenger') || process.env.HOME.includes('cpanel'));

// Also check if Vite is missing (which happens on production cPanel npm installs)
let hasVite = true;
try {
  require.resolve('vite');
} catch (e) {
  hasVite = false;
}

if (isCpanel || !hasVite) {
  console.log('\n=============================================================');
  console.log('⚠️  DETECTED CPANEL / RESTRICTED SHARED HOSTING ENVIRONMENT');
  console.log('=============================================================');
  console.log('🌟 Skipping resource-intensive compilation on your hosting!');
  console.log('💡 Your React client & Node server are already fully pre-compiled');
  console.log('   into the "dist/" directory by AI Studio.');
  console.log('🚀 All you need to do is upload the files and RESTART the app.');
  console.log('=============================================================\n');
  process.exit(0);
}

try {
  console.log('⚡ Building Client with Vite...');
  execSync('vite build', { stdio: 'inherit' });

  console.log('⚡ Bundling Server with esbuild...');
  execSync('esbuild server.ts --bundle --platform=node --format=cjs --external:vite --sourcemap --outfile=dist/server.cjs', { stdio: 'inherit' });

  console.log('✅ Build completed successfully inside AI Studio! Ready for Export.');
} catch (error) {
  console.error('❌ Build error:', error.message);
  process.exit(1);
}
