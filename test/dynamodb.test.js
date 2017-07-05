'use strict';

const expect = require('chai').expect;
const request = require('request');
const aws = require('aws-sdk');
const IPDatabase = require("../lib/dynamodb.js");
// import IPDatabase from '../lib/dynamodb.js';

// test locally
aws.config.update({
    region: "us-east-1",
    endpoint: "http://localhost:8000"
});

describe("DynamoDB", function() {
  describe("Creates IPDatabase table", function(done) {
    var dynamodb = new aws.DynamoDB();

    it("returns table name", function(done) {
      var testdb = new IPDatabase("IPBlacklistTest", 1000, 10);
      testdb.createIPBlacklistTable(function(err, results) {
        if (err) {
          done(err);
        } else {
          // console.log(data);
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
      dynamodb.describeTable({TableName: "IPBlacklistTest"}, function (e, d) {
        if (e) {
          done(e);
        } else {
          dynamodb.deleteTable({TableName: "IPBlacklistTest"}, function(err, results) {
            done(err);
          });
        }
      });
    });
  });

  describe("Updates blacklist table", function(done) {
    var dynamodb = new aws.DynamoDB();
    var docClient = new aws.DynamoDB.DocumentClient();
    var tableParams = {
      TableName: "IPBlacklistTest",
      KeySchema: [{
        AttributeName: "IPAddress",
        KeyType: "HASH"
      }],
      AttributeDefinitions: [{
        AttributeName: "IPAddress",
        AttributeType: "S"
      }],
      ProvisionedThroughput: {
        ReadCapacityUnits: 1,
        WriteCapacityUnits: 1000
      },
      StreamSpecification: {
        StreamEnabled: true,
        StreamViewType: "NEW_AND_OLD_IMAGES"
      }
    };

    before(function(done) {
      dynamodb.describeTable({TableName: "IPBlacklistTest"}, function (e, d) {
        if (e) {
          if (e.code === 'ResourceNotFoundException') {
            // table does not exist. create it
            dynamodb.createTable(tableParams, function(e, d) {
              if (e) {
                done(e);
              } else {
                dynamodb.waitFor('tableExists', {
                  TableName: "IPBlacklistTest"
                }, (err, dat) => {
                  done(e);
                });
              }
            });
          } else {
            done(e);
          }
        } else {
          done();
        }
      });
    });

    it("creates records with Alienvault as source", function(done) {
      var addresses = ["127.0.0.1", "192.168.0.1"];
      var source = "alienvault";
      var testdb = new IPDatabase("IPBlacklistTest", 1000, 10);

      testdb.createIPRecords(addresses, source, function(e, r) {
        if (e) {
          done(e);
        } else {
          var params = {
            TableName: "IPBlacklistTest",
            KeyConditionExpression: "IPAddress = :ipaddress",
            FilterExpression: "SourceRBL = :source",
            ExpressionAttributeValues: {
              ":ipaddress": "127.0.0.1",
              ":source": source
            }
          };

          docClient.query(params, function(err, data) {
            if (err) {
              done(e);
            } else {
              expect(data.Count).to.be.above(0);
              done();
            }
          });
        }
      });
    });

    after(function(done) {
      dynamodb.describeTable({TableName: "IPBlacklistTest"}, function (e, d) {
        if (e) {
          done(e);
        } else {
          dynamodb.deleteTable({TableName: "IPBlacklistTest"}, function(err, results) {
            done(err);
          });
        }
      });
    });
  });
});
