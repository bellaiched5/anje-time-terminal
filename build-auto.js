const { spawn } = require('child_process');

const child = spawn('npx', ['eas', 'build', '-p', 'android', '--profile', 'preview'], {
  cwd: 'c:\\terminal-app',
  stdio: ['pipe', 'pipe', 'pipe'],
  shell: true
});

let output = '';

child.stdout.on('data', (data) => {
  const text = data.toString();
  output += text;
  process.stdout.write(text);
  
  // Auto-answer Y to keystore generation
  if (text.includes('Generate a new Android Keystore') || text.includes('generate a new')) {
    console.log('\n>>> AUTO-ANSWERING: Y');
    child.stdin.write('Y\n');
  }
  // Auto-answer Y to any other yes/no prompt
  if (text.includes('(Y/n)') || text.includes('? (y/N)') || text.includes('? Yes')) {
    console.log('\n>>> AUTO-ANSWERING: Y');
    child.stdin.write('Y\n');
  }
});

child.stderr.on('data', (data) => {
  const text = data.toString();
  output += text;
  process.stderr.write(text);
  
  if (text.includes('Generate a new Android Keystore') || text.includes('(Y/n)') || text.includes('? (y/N)')) {
    console.log('\n>>> AUTO-ANSWERING (stderr): Y');
    child.stdin.write('Y\n');
  }
});

child.on('close', (code) => {
  console.log(`\n\nProcess exited with code ${code}`);
  
  // Extract build URL if present
  const urlMatch = output.match(/https:\/\/expo\.dev\/accounts\/.*\/builds\/[a-f0-9-]+/);
  if (urlMatch) {
    console.log('BUILD URL:', urlMatch[0]);
  }
  const apkMatch = output.match(/https:\/\/expo\.dev\/artifacts\/eas\/[^\s]+\.apk/);
  if (apkMatch) {
    console.log('APK URL:', apkMatch[0]);
  }
});

// Safety timeout - 20 minutes
setTimeout(() => {
  console.log('Timeout reached');
  child.kill();
}, 20 * 60 * 1000);
