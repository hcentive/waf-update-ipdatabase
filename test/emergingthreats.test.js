'use strict';

const expect = require('chai').expect;
const https = require('https');
const readline = require('readline');
const nock = require('nock');
const et = require('../lib/emergingthreats.js');

describe("Emerging Threats", function() {
  beforeEach(function(done) {
    const scope = nock('https://rules.emergingthreats.net')
    .get('/fwrules/emerging-Block-IPs.txt')
    .replyWithFile(200, __dirname + '/data/et.mock.txt');
    done();
  });

  it("returns IP addresses", function(done) {
    et.getETAddresses(function(err, results) {
      if (err) {
        done(err);
      } else {
        expect(results).to.be.an('array').that.is.not.empty;
        done();
      }
    });
  });

  it("checks IP address count", function(done) {
    et.getETAddresses(function(err, results) {
      var regex = new RegExp('^((?:(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])(?:/(?:3[0-2]|[1-2][0-9]|[0-9]))?)');
      var ranges = [];
      nock.restore();
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
          expect(ranges.length).to.equal(results.length);
          done();
        });
      }).on('error', function (err) {
        done(err);
      });
    });
  });

  afterEach(function() {
    nock.cleanAll();
  });
});
