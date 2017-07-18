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
    endpoint: "http://localhost:8000"
});

describe("Index", function() {
  describe("Calls handler", function(done) {
    this.timeout(0);

    before(function(done) {
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

    after(function(done) {
      nock.cleanAll();
      console.log('Cleaning up...');
      var dynamodb = new aws.DynamoDB();
      dynamodb.describeTable({TableName: "IPBlacklistTest"}, function (e, d) {
        if (e) {
          done(e);
        } else {
          console.log('delete table when active');
          (function checkStatus() {
            var descTablePromise = dynamodb.describeTable({ TableName: "IPBlacklistTest" }).promise();
            descTablePromise.then(function(r) {              
              if (r.Table.TableStatus === 'ACTIVE') {
                dynamodb.deleteTable({TableName: "IPBlacklistTest"}, function(err, results) {
                  if (err) {
                    done(err);
                  } else {
                    done();
                  }
                });
              } else {
                checkStatus();
              }
            }).catch(function(er) {
              done(er);
            });
          })();
        }
      });
    });
  });
});
