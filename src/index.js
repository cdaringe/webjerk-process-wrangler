'use strict'

var cp = require('child_process')
var path = require('path')
var fs = require('fs')

function ensureProcessIsGone (pid) {
  return new Promise(function (resolve, reject) {
    var probeInterval = setInterval(function () {
      try {
        process.kill(pid, 0)
      } catch (err) {
        clearTimeout(probeInterval)
        if (err.code === 'ESRCH') resolve()
        else reject(err)
      }
    }, 250)
  })
}
function removePIDFile (pidFile) {
  var pid = null
  try {
    pid = parseInt(fs.readFileSync(pidFile).toString(), 10)
  } catch (_err) {}
  try { fs.unlinkSync(pidFile) } catch (_err) {}
  return pid
}

function createProcessLifecycleHooks () {
  return {
    _pidFile: null,
    setup (config) {
      this._pidFile = path.join(process.cwd(), `${path.basename(config.cp.bin)}.pid`)
      return new Promise((res, rej) => { // eslint-disable-line
        var exit = (err, code, stderr) => {
          removePIDFile(this._pidFile)
          if (err || code) return rej(err || new Error(stderr || `${config.cp.bin} exited to boot ${code}`))
          return res()
        }
        try {
          removePIDFile(this._pidFile)
          var stderr = ''
          var srv = cp.spawn(config.cp.bin, config.cp.args || [], config.cp.opts || { cwd: __dirname })
          if (srv.stderr) srv.stderr.on('data', chunk => { stderr += chunk })
          fs.writeFileSync(this._pidFile, srv.pid)
          console.log(`wrote PID file: ${this._pidFile}`)
          srv.on('error', code => exit(null, code, stderr))
          srv.on('exit', code => {
            return exit(null, code, stderr)
          })
          setTimeout(() => res(), 5000)
        } catch (err) {
          return exit(err)
        }
      })
    },
    teardown () {
      console.log(`removing pid file ${this._pidFile}`)
      return Promise.resolve()
      .then(() => removePIDFile(this._pidFile))
      .then(pid => {
        var p = ensureProcessIsGone(pid)
        process.kill(pid, 'SIGTERM')
        return p
      })
    }
  }
}

module.exports = function registerProcessWrangler () {
  var hooks = createProcessLifecycleHooks()
  return {
    name: 'webjerk-process-wrangler',
    pre: hooks.setup,
    post: hooks.teardown
  }
}
