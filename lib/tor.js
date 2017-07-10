const fs = require('fs');
const constants = require('constants');
const https = require('https');
const _ = require('underscore');
const path = require('path');
const readline = require('readline');

const tor = JSON.parse(fs.readFileSync(path.join('.', 'conf', 'tor.json')));

//get IP addresses of Tor exit nodes
exports.getTorAddresses = function(callback) {

  var options = {
    hostname: tor.tor_host,
    path: tor.tor_path,
    method: 'GET',
    secureOptions: constants.SSL_OP_NO_TLSv1_2
  };

  var addresses = [];

  // https.get(options, function (response) {
  https.get(tor.tor_exitnode_url, function (response) {
    // create a reader object to read the list one line at a time
    var reader = readline.createInterface({ terminal: false, input: response });
    var regex = new RegExp('^ExitAddress ((?:(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])(?:/(?:3[0-2]|[1-2][0-9]|[0-9]))?)');
    reader.on('line', function (line) {
        var result = regex.exec(line);
        // if there is a result, an address has been found
        if (result) {
            var address = result[1];
            // add the address if it is not a duplicate
            if (addresses.indexOf(address) === -1) {
              // if (address.includes('/') == false) {
              //   address += '/32';
              // }
              addresses.push(address);
            }
        }
    });
    reader.on('close', function () {
        // console.log(addresses.length + ' addresses read from the TOR exit list at ' + tor.tor_exitnode_url);
        callback(null, addresses);
    });
  }).on('error', function (err) {
    // console.error('Error downloading TOR exit list at ' + tor.tor_exitnode_url, err);
    callback(err);
  });
};
