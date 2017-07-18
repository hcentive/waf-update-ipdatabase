'use strict';

const expect = require('chai').expect;
const request = require('request');
const aws = require('aws-sdk');
const IPDatabase = require("../lib/ipdatabase.js");

aws.config.setPromisesDependency(null);

// test locally
// aws.config.update({
//     region: "us-east-1",
//     endpoint: "http://localhost:8000"
// });

describe("DynamoDB", function() {
  const tableName = "IPBlacklistTest";
  describe("Creates IPDatabase table", function(done) {
    this.timeout(0);
    var dynamodb = new aws.DynamoDB();

    it("returns table name", function(done) {
      var testdb = new IPDatabase(tableName, 1000, 10);
      testdb.createBlacklistTable(function(err, results) {
        if (err) {
          done(err);
        } else {
          // console.log(results);
          dynamodb.describeTable({TableName: tableName}, function (e, d) {
            if (e) {
              done(e);
            } else {
              expect(d.Table.TableName).to.equal(tableName);
              expect(d.Table.StreamSpecification.StreamEnabled).to.be.true;
              done();
            }
          });
        }
      });
    });

    after(function(done) {
      dynamodb.describeTable({TableName: tableName}, function (e, d) {
        if (e) {
          done(e);
        } else {
          dynamodb.deleteTable({TableName: tableName}, function(err, results) {
            done(err);
          });
        }
      });
    });
  });

  describe("Updates blacklist table", function(done) {
    this.timeout(0);
    var dynamodb = new aws.DynamoDB();
    var docClient = new aws.DynamoDB.DocumentClient();
    var tableParams = {
      TableName: tableName,
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
      dynamodb.describeTable({TableName: tableName}, function (e, d) {
        if (e) {
          if (e.code === 'ResourceNotFoundException') {
            // table does not exist. create it
            dynamodb.createTable(tableParams, function(e, d) {
              if (e) {
                done(e);
              } else {
                dynamodb.waitFor('tableExists', {
                  TableName: tableName
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
      const addresses = ["127.0.0.1"];
      const source = "alienvault";
      const testdb = new IPDatabase(tableName, 1000, 10);

      testdb.updateAddresses(addresses, source, function(e, r) {
        if (e) {
          done(e);
        } else {
          var params = {
            TableName: tableName,
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

    it("creates records with Emerging Threats as source", function(done) {
      const a = ["10.10.0.1"];
      const s = "emergingthreats";
      const t = new IPDatabase(tableName, 1000, 10);

      t.updateAddresses(a, s, function(e, r) {
        if (e) {
          done(e);
        } else {
          var p = {
            TableName: tableName,
            KeyConditionExpression: "IPAddress = :ipaddress",
            FilterExpression: "SourceRBL = :source",
            ExpressionAttributeValues: {
              ":ipaddress": "10.10.0.1",
              ":source": s
            }
          };

          docClient.query(p, function(err, data) {
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

    it("creates records with tor as source", function(done) {
      const ad = ["192.168.0.1"];
      const so = "tor";
      const ta = new IPDatabase(tableName, 1000, 10);

      ta.updateAddresses(ad, so, function(e, r) {
        if (e) {
          done(e);
        } else {
          var pa = {
            TableName: tableName,
            KeyConditionExpression: "IPAddress = :ipaddress",
            FilterExpression: "SourceRBL = :source",
            ExpressionAttributeValues: {
              ":ipaddress": "192.168.0.1",
              ":source": so
            }
          };

          docClient.query(pa, function(err, data) {
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

    it("updates database with new addresses", function(done) {
      //create items with addresses
      const source = "testsource";
      var params = {
        TableName: tableName,
        Item: {
         "IPAddress": {
           S: "10.0.0.1"
          },
         "SourceRBL": {
           S: source
          },
          "Active": {
            "S": "true"
          },
          "CreatedDate": {
            "S": (new Date()).toUTCString()
          }
        },
        ReturnConsumedCapacity: "TOTAL"
      };
      const ipdb = new IPDatabase(tableName, 1000, 10);
      dynamodb.putItem(params, function(error, results) {
        if (error) {
          done(error);
        } else {
          // console.log(results.length);
          ipdb.waitForTableActive(tableName).then((d) => {
            // console.log('test record created for ' + source);
            const addr = ["10.0.0.1", "127.0.0.1", "192.168.0.1"];
            ipdb.updateAddresses(addr, source, function(e, r) {
              if (e) {
                done(e);
              } else {
                expect(r.length).to.equal(2);
                var pa = {
                  TableName: tableName,
                  FilterExpression: "SourceRBL = :source",
                  ExpressionAttributeValues: {
                    ":source": source
                  }
                };
                docClient.scan(pa, function(err, data) {
                  if (err) {
                    done(err);
                  } else {
                    expect(data.Count).to.equal(3);
                    done();
                  }
                });
              }
            });
          }).catch((e) => done(e));
        }
      });
    });

    after(function(done) {
      dynamodb.describeTable({TableName: tableName}, function (e, d) {
        if (e) {
          done(e);
        } else {
          dynamodb.deleteTable({TableName: tableName}, function(err, results) {
            done(err);
          });
        }
      });
    });
  });

  describe("Retrieves blacklist records", function(done) {
    this.timeout(0);
    var dynamodb = new aws.DynamoDB();
    before("creates test database", function(done) {
      var tableParams = {
        TableName: tableName,
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
      dynamodb.describeTable({TableName: tableName}, function (e, d) {
        if (e) {
          if (e.code === 'ResourceNotFoundException') {
            // table does not exist. create it
            dynamodb.createTable(tableParams, function(e, d) {
              if (e) {
                done(e);
              } else {
                dynamodb.waitFor('tableExists', {
                  TableName: tableName
                }, (err, dat) => {
                  if (e) {
                    done(e);
                  } else {
                    // create test data
                    const a = ["10.10.0.1"];
                    const s = "emergingthreats";
                    const t = new IPDatabase(tableName, 1000, 10);

                    t.updateAddresses(a, s, function(e, r) {
                      done(e);
                    });
                  }
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

    it("gets active blacklist records", function(done) {
      const testdb = new IPDatabase(tableName, 1000, 10);
      testdb.getActiveIPAddresses().then(function(addresses) {
        expect(addresses).to.include("10.10.0.1");
        done();
      }).catch(function(error) {
        done(error);
      })
    });

    after("deletes test database", function(done) {
      dynamodb.describeTable({TableName: tableName}, function (e, d) {
        if (e) {
          done(e);
        } else {
          dynamodb.deleteTable({TableName: tableName}, function(err, results) {
            done(err);
          });
        }
      });
    });
  });
});
