const { spawn } = require('child_process')
const electron = require('electron')
const path = require('path')

const isWin = process.platform === 'win32'
const tsc = path.join(__dirname, 'node_modules', '.bin', isWin ? 'tsc.cmd' : 'tsc')
const vite = path.join(__dirname, 'node_modules', '.bin', isWin ? 'vite.cmd' : 'vite')

function spawnProcess(command, args, options = {}) {
  if (isWin && command.endsWith('.cmd')) {
    return spawn('cmd.exe', ['/c', command, ...args], {
      stdio: 'inherit',
      cwd: __dirname,
      ...options,
    })
  }

  return spawn(command, args, {
    stdio: 'inherit',
    cwd: __dirname,
    ...options,
  })
}

console.log('Building Electron main process...')
const build = spawnProcess(tsc, ['-p', 'tsconfig.electron.json'])

build.on('close', (code) => {
  if (code !== 0) process.exit(code)

  console.log('Starting Vite dev server...')
  const viteProc = spawnProcess(vite, ['--port', '5173'])

  console.log('Starting Electron...')
  const electronProc = spawnProcess(electron, ['.'])

  electronProc.on('close', (exitCode) => {
    viteProc.kill()
    process.exit(exitCode)
  })
})
