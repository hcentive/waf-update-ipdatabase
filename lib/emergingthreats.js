var fs = require('fs');
var path = require('path');
var readline = require('readline');
var constants = require('constants');
var https = require('https');

var et = JSON.parse(fs.readFileSync(path.join('.', 'conf', 'et.json')));

var regex = new RegExp('^((?:(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])(?:/(?:3[0-2]|[1-2][0-9]|[0-9]))?)');

// Retrieves IP addresses to block from emergingthreats.net
exports.getAddresses = function() {
  return new Promise(function(resolve, reject) {
    var options = {
      hostname: et.et_host,
      path: et.et_path,
      method: 'GET',
      secureOptions: constants.SSL_OP_NO_TLSv1_2
    };

    var ranges = [];
    https.get(options, function (response) {
      // create a reader object to read the list one line at a time
      var reader = readline.createInterface({ terminal: false, input: response });
      reader.on('line', function (line) {
        var result = regex.exec(line);
        // if there is a result, a range has been found and a new range is created
        if (result) {
          if (ranges.indexOf(result[1]) === -1) {
            // if (result[1].indexOf('/') === -1) {
            //   result[1] += '/32';
            // }
            ranges.push(result[1]);
          }
        }
      });
      reader.on('close', function () {
        // console.log(ranges.length + ' address ranges read from ' + et.et_url);
        resolve(ranges);
      });
    }).on('error', function (err) {
      // console.log('Error downloading ' + threaturl, err);
      reject(err);
    });
  });
};
