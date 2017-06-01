'use strict';

var expect = require('chai').expect;
var https = require('https');
var readline = require('readline');
const tor = require('../lib/tor.js');

describe("Tor", function() {
  describe("Verify endpoint", function() {
    it("returns IP addresses", function() {
      tor.getTorAddresses(function(err, results) {
        expect(err).to.be.null;
        expect(results).to.be.an('array').that.is.not.empty;
      });
    });
  });

  describe("Verify records", function() {
    it("checks IP address count", function() {
      tor.getTorAddresses(function(err, results) {
        var regex = new RegExp('^ExitAddress ((?:(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])(?:/(?:3[0-2]|[1-2][0-9]|[0-9]))?)');
        var addresses = [];
        https.get("https://check.torproject.org/exit-addresses", function (response) {
          var reader = readline.createInterface({ terminal: false, input: response });
          reader.on('line', function (line) {
            var result = regex.exec(line);
            if (result) {
              if (addresses.indexOf(result[1]) === -1) {
                addresses.push(result[1]);
              }
            }
          });
          reader.on('close', function () {
            expect(addresses.length.to.be.equal.to(results.length));
          });
        }).on('error', function (err) {
          console.log(err, err.stack);
        });
      });
    });
  });
});
