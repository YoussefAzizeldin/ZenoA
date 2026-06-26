const { spawnSync, spawn } = require('child_process')
const electron = require('electron')
const path = require('path')
const isWin = process.platform === 'win32'
const tsc = path.join(__dirname, 'node_modules', '.bin', isWin ? 'tsc.cmd' : 'tsc')

function spawnSyncCmd(command, args, options = {}) {
  if (isWin && command.endsWith('.cmd')) {
    return spawnSync('cmd.exe', ['/c', command, ...args], {
      stdio: 'inherit',
      cwd: __dirname,
      ...options,
    })
  }

  return spawnSync(command, args, {
    stdio: 'inherit',
    cwd: __dirname,
    ...options,
  })
}

function buildElectron() {
  const result = spawnSyncCmd(tsc, ['-p', 'tsconfig.electron.json'])

  if (result.status !== 0) {
    process.exit(result.status)
  }
}

buildElectron()

const electronProc = spawn(electron, ['.'], {
  stdio: 'inherit',
  cwd: __dirname,
})

electronProc.on('close', (code) => process.exit(code))
