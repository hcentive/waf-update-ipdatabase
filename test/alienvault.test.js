'use strict';

const expect = require('chai').expect;
const request = require('request');
const constants = require('constants');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
var _ = require('underscore');
const nock = require('nock');
const av = require('../lib/alienvault.js');
const config = JSON.parse(fs.readFileSync(path.join('.', 'test', 'config.json')));

describe("Alienvault", function() {
  describe("Get AV addresses", function(done) {
    beforeEach(function(done) {
      const scope = nock('https://otx.alienvault.com', {
        reqheaders: {
          'X-OTX-API-KEY': config.av_otx_api_key
        }
      })
      .get('/api/v1/pulses/subscribed')
      .replyWithFile(200, __dirname + '/data/av.mock.json');
      done();
    });

    it("returns IP addresses", function(done) {
      av.getAVAddresses(null, function(err, results) {
        if (err) {
          done(err);
        } else {
          expect(results).to.be.an('array').that.is.not.empty;
          done();
        }
      });
    });

    it("checks IP addresses", function(done) {
      av.getAVAddresses(null, function(err, results) {
        if (err) {
          done(err);
        } else {
          expect(results).to.be.an('array').that.includes('198.154.224.48');
          done();
        }
      });
    });

    it("checks IP address count", function(done) {
      av.getAVAddresses(null, function(err, results) {
        // console.log(results);
        if (err) {
          done(err);
        } else {
          const mockdata = JSON.parse(fs.readFileSync(path.join('.', 'test', 'data', 'av.mock.json')));
          const indicators = _.map(mockdata.results, function(result) {
            var ipindicators = _.pluck(_.where(result.indicators, {type: "IPv4"}), "indicator");
            return _.union(ipindicators);
          });
          // console.log(_.flatten(indicators));
          expect(results.length).to.equal(_.flatten(indicators).length);
          done();
        }
      });
    });

    afterEach(function() {
      nock.cleanAll();
    });
  });
});
