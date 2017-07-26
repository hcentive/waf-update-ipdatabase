'use strict';

const expect = require('chai').expect;
const https = require('https');
const readline = require('readline');
const nock = require('nock');
const tor = require('../lib/tor.js');

describe("Tor", function() {
  beforeEach(function(done) {
    const scope = nock('https://check.torproject.org')
    .get('/exit-addresses')
    .replyWithFile(200, __dirname + '/data/tor.mock.txt');
    done();
  });

  it("returns IP addresses", function(done) {
    tor.getAddresses().then(function(results) {
      expect(results).to.be.an('array').that.is.not.empty;
      done();
    }).catch(function(error) {
      done(err);
    });
  });

  it("checks IP address count", function(done) {
    tor.getAddresses().then(function(results) {
      var regex = new RegExp('^ExitAddress ((?:(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])(?:/(?:3[0-2]|[1-2][0-9]|[0-9]))?)');
      var addresses = [];
      nock.restore();
      https.get('https://check.torproject.org/exit-addresses', function (response) {
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
          expect(addresses.length).to.equal(results.length);
          done();
        });
      }).on('error', function (err) {
        done(err);
      });
    }).catch(function(error) {
      done(err);
    });
  });

  afterEach(function() {
    nock.cleanAll();
  });
});
