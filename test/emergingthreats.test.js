'use strict';

var expect = require('chai').expect;
var https = require('https');
var readline = require('readline');
const et = require('../lib/emergingthreats.js');

describe("Emerging Threats", function() {
  describe("Verify endpoint", function() {
    it("returns IP addresses", function() {
      et.getETAddresses(function(err, results) {
        expect(err).to.be.null;
        expect(results).to.be.an('array').that.is.not.empty;
      });
    });
  });

  describe("Verify records", function() {
    it("checks IP address count", function() {
      et.getETAddresses(function(err, results) {
        var regex = new RegExp('^((?:(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])(?:/(?:3[0-2]|[1-2][0-9]|[0-9]))?)');
        var ranges = [];
        https.get("https://rules.emergingthreats.net/fwrules/emerging-Block-IPs.txt", function (response) {
          var reader = readline.createInterface({ terminal: false, input: response });
          reader.on('line', function (line) {
            var result = regex.exec(line);
            if (result) {
              if (ranges.indexOf(result[1]) === -1) {
                ranges.push(result[1]);
              }
            }
          });
          reader.on('close', function () {
            expect(ranges.length.to.be.equal.to(results.length));
          });
        }).on('error', function (err) {

        });
      });
    });
  });
});
