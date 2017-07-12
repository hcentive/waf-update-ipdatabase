'use strict';

const expect = require('chai').expect;
const request = require('request');
const aws = require('aws-sdk');
const nock = require('nock');
const fs = require('fs');
const path = require('path');
const index = require("../index.js");
const config = JSON.parse(fs.readFileSync(path.join('.', 'test', 'config.json')));

aws.config.setPromisesDependency(null);

// test locally
aws.config.update({
    region: "us-east-1",
    endpoint: "http://localhost:4569"
});

describe("Index", function(done) {
  beforeEach(function(done) {
    const avScope = nock('https://otx.alienvault.com', {
        reqheaders: {
          'X-OTX-API-KEY': config.av_otx_api_key
        }
      })
      .get('/api/v1/pulses/subscribed')
      .replyWithFile(200, __dirname + '/data/av.mock.json');

    const etScope = nock('https://rules.emergingthreats.net')
      .get('/fwrules/emerging-Block-IPs.txt')
      .replyWithFile(200, __dirname + '/data/et.mock.txt');

    const torScope = nock('https://check.torproject.org')
      .get('/exit-addresses')
      .replyWithFile(200, __dirname + '/data/tor.mock.txt');

    done();
  });

  it("calls exports.handler", function(done) {
    this.timeout(600000);
    index.handler({tableName: 'IPBlacklistTest'}, {}, function(err, results) {
      if (err) {
        done(err);
      } else {
        //check if table is created
        var dynamodb = new aws.DynamoDB();
        dynamodb.describeTable({TableName: "IPBlacklistTest"}, function (e, d) {
          if (e) {
            done(e);
          } else {
            expect(d.Table.TableName).to.equal("IPBlacklistTest");
            done();
          }
        });
      }
    });
  });

  afterEach(function(done) {
    nock.cleanAll();
    var dynamodb = new aws.DynamoDB();
    dynamodb.describeTable({TableName: "IPBlacklistTest"}, function (e, d) {
      if (e) {
        done(e);
      } else {
        dynamodb.deleteTable({TableName: "IPBlacklistTest"}, function(err, results) {
          if (err) {
            done(err);
          } else {
            done();
          }
        });
      }
    });
  });
});