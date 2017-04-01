'use strict'

var cp = require('child_process')
var path = require('path')
var fs = require('fs')
var bb = require('bluebird')
var readFileAsync = bb.promisify(fs.readFile)
var pidFile = null

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
function removePIDFile () {
  try { fs.unlinkSync(pidFile) } catch (_err) {}
}
function setup (config) {
  pidFile = path.join(process.cwd(), `${path.basename(config.cp.bin)}.pid`)
  return new Promise((res, rej) => { // eslint-disable-line
    function fail (err, code) {
      removePIDFile()
      rej(err || new Error(`httpster failed to boot ${code}`))
    }
    try {
      removePIDFile()
      var srv = cp.spawn(config.cp.bin, config.cp.args || [], config.cp.opts || { cwd: __dirname })
      fs.writeFileSync(pidFile, srv.pid)
      console.log(`wrote PID file: ${pidFile}`)
      srv.on('error', code => fail(null, code))
      srv.on('exit', code => fail(null, code))
      setTimeout(() => res(), 5000)
    } catch (err) {
      return fail(err)
    }
  })
}
function teardown () {
  console.log(`removing pid file ${pidFile}`)
  return readFileAsync(pidFile)
  .then(pid => parseInt(pid, 10))
  .then(pid => {
    var p = ensureProcessIsGone(pid)
    process.kill(pid, 'SIGTERM')
    return p
  })
}

module.exports = function registerProcessWrangler () {
  return {
    name: 'webjerk-process-wrangler',
    pre: setup,
    post: teardown
  }
}
// setup()
// .then(() => module.exports.plugin.main())
// .then(() => teardown())
