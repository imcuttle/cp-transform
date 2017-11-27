/* eslint-disable */
/**
 * @file: cp-flow
 * @author: Cuttle Cong
 * @date: 2017/11/27
 */

var fs = require('fs')
var nps = require('path')
var Transform = require('stream').Transform

var concat = require('concat-stream')

function isFile(file) {
  return fs.existsSync(file) && fs.statSync(file).isFile()
}
function isDirectory(file) {
  return fs.existsSync(file) && fs.statSync(file).isDirectory()
}

function walkDirectory(dir, walk) {
  dir = nps.resolve(dir)
  if (isDirectory(dir)) {
    var files = fs.readdirSync(dir)
    files.forEach(function (filename) {
      filename = nps.join(dir, filename)
      walkDirectory(filename, walk)
    })
    return
  }
  if (isFile(dir)) {
    walk && walk(dir)
  }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    console.log(dir)
    var p = nps.dirname(dir)
    ensureDir(p);
    fs.mkdirSync(dir);
  }
}

function flow(from, to, options, callback) {
  options = options || {}
  if (typeof options === 'function') {
    callback = options
    options = {}
  }

  if (typeof from !== 'string') {
    throw new TypeError('CP-FLOW `from` must be type of `string`');
  }
  if (typeof to !== 'string') {
    throw new TypeError('CP-FLOW `from` must be type of `string`');
  }

  var transform = options.transform
  var type = options.type || 'chunkTransform'
  var filter = options.filter || function () { return true }

  from = nps.resolve(from)
  to = nps.resolve(to)
  var fromBasename = nps.basename(from)

  if (isFile(from) && isDirectory(to)) {
    to = nps.join(to, fromBasename)
    pipeFile(from, to, transform, type, callback)
  } else if (isDirectory(from) && isDirectory(to)) {
    var promList = []
    walkDirectory(from, function (filename) {
      if (filter(filename)) {
        var relative = nps.relative(from, filename)
        if (filename.startsWith(to)) {
          // filename is the file of `to` dir
          return
        }

        var tofilename = nps.join(to, relative);
        ensureDir(nps.dirname(tofilename))
        promList.push(
          pipeFileProm(filename, tofilename, transform, type)
        )
      }
    });

    Promise.all(promList)
      .then(function () {
        callback && callback()
      })
      .catch(callback)
  } else if (isFile(from)) {
    pipeFile(from, to, transform, type, callback)
  } else {
    throw new Error('may not found `' + from + '` \n or not found `' + to + '`')
  }
}

function pipeFileProm(from, to, transform, type) {
  return new Promise(function (resolve, reject) {
    pipeFile(from, to, transform, type, function (err) {
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    })
  })
}

function getTransformData(data) {
  if (data instanceof Promise) {
    return data.catch(console.error)
  }
  return Promise.resolve(data).catch(console.error)
}

function pipeFile(from, to, transform, type, callback) {
  var src = fs.createReadStream(from)
  callback = callback || function () {}

  if (typeof transform === 'function') {
    if (type === 'fileTransform') {
      src.pipe(concat(function (body) {
        getTransformData(transform(body, from))
          .then(function (data) {
            fs.createWriteStream(to)
              .on('error', callback)
              .on('close', function () {
                callback && callback(null)
              })
              .end(data)
          })
      }))
      return;
    } else if (type === 'chunkTransform') {
      var wrapTransform = function (chunk, enciding, callback) {
        getTransformData(transform(chunk, from))
          .then(function (data) {
            callback && callback(null, data)
          })
      }
      src = src.pipe(new Transform({transform: wrapTransform}))
    }
  }
  src.pipe(fs.createWriteStream(to))
    .on('error', callback)
    .on('close', function () {
      callback && callback(null)
    })
}

module.exports = flow
