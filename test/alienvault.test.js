'use strict';

const expect = require('chai').expect;
const request = require('request');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const av = require('../lib/alienvault.js');
const config = JSON.parse(fs.readFileSync(path.join('.', 'test', 'config.json')));

describe("Alienvault", function() {
  describe("Verify endpoint", function() {
    it("returns IP addresses", function() {
      av.getAVAddresses(null, function(err, results) {
        expect(err).to.be.null;
        expect(results).to.be.an('array').that.is.not.empty;
      });
    });
  });

  describe("Verify records", function() {
    it("checks IP address count", function() {
      av.getAVAddresses(null, function(err, results) {
        var options = {
          url: config.av_url,
          method: 'GET',
          secureOptions: constants.SSL_OP_NO_TLSv1_2,
          headers: {'X-OTX-API-KEY': confgi.av_otx_api_key}
        };

        request.get(options, function(err, response, body) {
          var json = JSON.parse(body);
          var count = json.count;
          expect(count).to.equal(results.length);
        });
      });
    });
  });
});
