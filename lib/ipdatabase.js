const aws = require('aws-sdk');
const _ = require('underscore');

aws.config.setPromisesDependency(null);

class IPDatabase {
  constructor(tableName = "IPBlacklist", newWriteCapacity = 1000, existingWriteCapacity = 10) {
    this.dynamodb = new aws.DynamoDB();
    this.docClient = new aws.DynamoDB.DocumentClient();
    this.newTableWriteCapacity = 1000;
    this.existingTableWriteCapacity = 10;
    this.tableName = tableName;
  }

  tableParams(capacity) {
    if (!capacity) {
      capacity = this.existingTableWriteCapacity;
    }
    return {
      TableName: this.tableName,
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
        WriteCapacityUnits: capacity
      },
      StreamSpecification: {
        StreamEnabled: true,
        StreamViewType: "NEW_AND_OLD_IMAGES"
      }
    };
  }

  ipRecord(ipaddress, source) {
    return {
      TableName: this.tableName,
      Item: {
        "IPAddress": ipaddress,
        "CreatedDate": (new Date()).toUTCString(),
        "SourceRBL": source,
        "Active": "true"
      },
      ConditionExpression: "attribute_not_exists(IPAddress) and attribute_not_exists(SourceRBL)"
    };
  }

  putRequest(address, source) {
    return {
      "PutRequest": {
        "Item": {
          "IPAddress": {
            "S": address
          },
          "SourceRBL": {
            "SS": source
          },
          "Active": {
            "S": "true"
          },
          "CreatedDate": {
            "S": (new Date()).toUTCString()
          }
        }
      }
    };
  }

  // create IP blacklist table if it does not exist
  createBlacklistTable(callback) {
    // this.dynamodb.listTables({ExclusiveStartTableName: tableName, Limit: 1}, function(error, data) {
    var db = this;
    // var db = new aws.DynamoDB();
    var descTablePromise = db.dynamodb.describeTable({
      TableName: db.tableName
    }).promise();

    descTablePromise.then(function(data) {
      callback(null, data);
    }).catch(function(error) {
      if (error.code === 'ResourceNotFoundException') {
        // console.log('table does not exist. create it');
        var createTablePromise = db.dynamodb.createTable(db.tableParams(db.newTableWriteCapacity)).promise();

        createTablePromise.then(function(d) {
          var tableExistsPromise = db.dynamodb.waitFor('tableExists', {
            TableName: db.tableName
          }).promise();
          tableExistsPromise.then(function(results) {
            callback(null, results);
          }).catch(function(err) {
            callback(err, null);
          });
        }).catch(function(e) {
          callback(e, null);
        });
      } else {
        callback(error, null);
      }
    });
  }

  getRecordByIP(ipaddress, callback) {
    var params = {
      TableName: this.tableName,
      KeyConditionExpression: "IPAddress = :ipaddress",
      ExpressionAttributeValues: {
        ":ipaddress": ipaddress
      }
    };

    docClient.query(params, function(err, data) {
      if (err) {
        callback(err, null);
      } else {
        callback(null, data);
      }
    });
  }

  getRecordByIPandSource(ipaddress, source) {
    var params = {
      TableName: this.tableName,
      KeyConditionExpression: "IPAddress = :ipaddress",
      FilterExpression: "SourceRBL = :source",
      ExpressionAttributeValues: {
        ":ipaddress": ipaddress,
        ":source": source
      }
    };

    return this.docClient.query(params).promise();
  }

  createIPRecord(ipaddress, source) {
    var db = this;
    var record = db.ipRecord(ipaddress, source);

    // console.log(record);

    return this.docClient.put(record).promise();
  }

  addSourceRBL(ipaddress, source, callback) {
    var db = this;
    getRecordByIP(ipaddress, function(err, data) {
      if (err) {
        callback(err, null);
      } else {
        var src = data.Items[0].SourceRBL;
        src.push(source);

        var ud = (new Date()).toUTCString();

        var updateParams = {
          TableName: db.tableName,
          Key: {
            "IPAddress": ipaddress
          },
          UpdateExpression: "SET SourceRBL = :src, UpdatedDate = :ud",
          ExpressionAttributeValues: {
            ":src": src,
            ":ud": ud
          },
          ReturnValues: "ALL_NEW"
        };

        db.docClient.update(updateParams, function(e, d) {
          if (e) {
            callback(e, null);
          } else {
            callback(null, d);
          }
        });
      }
    });
  }

  deactivateIPRecord(ipaddress, source, callback) {
    var params = {
      TableName: this.tableName,
      Key: {
        "IPAddress": ipaddress
      },
      UpdateExpression: "SET Active = :active, UpdatedDate = :udate",
      ExpressionAttributeValues: {
        ":active": "false",
        ":udate": (new Date()).toUTCString()
      },
      ReturnValues: "ALL_NEW"
    };

    this.docClient.update(params, function(err, data) {
      if (err) {
        callback(err, null);
      } else {
        callback(null, data);
      }
    });
  }

  updateAddresses(ipaddresses, source, callback) {
    var db = this;
    var params = {
      RequestItems: {
        IPBlacklist: []
      },
      ReturnConsumedCapacity: "TOTAL"
    };

    // var updateCapacityPromise = db.updateDBWriteCapacity(ipaddresses.length).promise();
    db.updateDBWriteCapacity(ipaddresses.length).then(function(results) {
      var ipmap = ipaddresses.map((address) => {
        return new Promise(function(resolve, reject) {
          db.getRecordByIPandSource(address, source).then(function(data) {
            if (data.Count == 0) {
              // console.log("creating record " + address + " : " + source);
              db.createIPRecord(address, source).then(function(d) {
                resolve(address);
              }).catch(function(e) {
                if (e.code != 'ConditionalCheckFailedException') {
                  reject(e);
                } else {
                  resolve(address);
                }
              });
            } else {
              // ignore duplicates
              console.log('Duplicate address found - ' + address);
              resolve(address);
            }
          }).catch(function(err) {
            console.log("ERR");
            reject(err);
          });
        });
      });
      var all = Promise.all(ipmap);
      all.then(function(addrs) {
        // console.log(d);
        // reset write capacity
        db.updateDBWriteCapacity(db.existingTableWriteCapacity).then(function(d) {
          callback(null, addrs);
        }).catch(function(e) {
          callback(e, null);
        });
        // resolve(addrs);
      });
    }).catch(function(error) {
      console.log("ERRORRR");
      callback(error, null);
      // reject(error);
    });
  }

  updateDBWriteCapacity(capacity) {
    var db = this;
    return new Promise(function(resolve, reject) {
      // check database throughput capacity
      var describeTablePromise = db.dynamodb.describeTable({
        TableName: db.tableName
      }).promise();
      describeTablePromise.then(function(data) {
        // console.log("data.Table.ProvisionedThroughput.WriteCapacityUnits - " + data.Table.ProvisionedThroughput.WriteCapacityUnits);
        if (data.Table.ProvisionedThroughput.WriteCapacityUnits !== capacity) {
          // console.log("updating capacity to - " + capacity);
          var updateParams = {
            TableName: db.tableName,
            ProvisionedThroughput: {
              ReadCapacityUnits: 1,
              WriteCapacityUnits: capacity
            }
          };
          // console.log("Updating table capacity");
          var updPromise = db.dynamodb.updateTable(updateParams).promise();
          updPromise.then((d) => resolve(d)).catch((e) => reject(e));
        } else {
          // console.log("REJECT");
          resolve('Capacity not required');
        }
      }).catch(function(error) {
        // console.log("ERROR");
        reject(error);
      });
    });
  }

  getActiveIPAddresses() {
    var db = this;
    var params = {
      ExpressionAttributeValues: {
       ":a": {
         S: "true"
        }
      },
      FilterExpression: "Active = :a",
      ProjectionExpression: "IPAddress",
      TableName: db.tableName
    };

    return new Promise(function(resolve, reject) {
      var dbScanPromise = db.dynamodb.scan(params).promise();
      dbScanPromise.then(function(data) {
        var addresses = _.map(data.Items, function(item) {
          return item.IPAddress["S"];
        });
        resolve(addresses);
      }).catch(function(error) {
        reject(error);
      });
    });
  }
}

module.exports = IPDatabase;
