const aws = require('aws-sdk');
const _ = require('underscore');

aws.config.setPromisesDependency(null);

class IPDatabase {
  constructor(tableName = "IPBlacklist", newWriteCapacity = 1000, existingWriteCapacity = 10) {
    this.dynamodb = new aws.DynamoDB();
    this.docClient = new aws.DynamoDB.DocumentClient();
    this.tableCapacity = 1;
    this.tableName = tableName;
    this.batchCapacity = 25;
  }

  tableParams(capacity) {
    if (!capacity) {
      capacity = this.tableCapacity;
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
        ReadCapacityUnits: 10,
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
            "S": source
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

  waitForTableActive(tableName) {
    var db = this;
    return new Promise(function(resolve, reject) {
      (function checkStatus() {
        var descTablePromise = db.dynamodb.describeTable({ TableName: db.tableName }).promise();
        descTablePromise.then(function(r) {
          if (r.Table.TableStatus === 'ACTIVE') {
            resolve(r);
          } else {
            checkStatus();
          }
        }).catch(function(er) {
          reject(er);
        });
      })();
    });
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
        var createTablePromise = db.dynamodb.createTable(db.tableParams(db.tableCapacity)).promise();

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

  getIPsBySourceRBL(source) {
    var db = this;
    var params = {
      ExpressionAttributeValues: {
       ":s": {
         S: source
        }
      },
      FilterExpression: "SourceRBL = :s",
      ProjectionExpression: "IPAddress",
      TableName: db.tableName
    };

    // console.log('retrieve addresses for ' + source + ' from ' + db.tableName);

    return new Promise(function(resolve, reject) {
      var dbScanPromise = db.dynamodb.scan(params).promise();
      dbScanPromise.then(function(data) {
        var addresses = _.map(data.Items, function(item) {
          return item.IPAddress["S"];
        });
        // console.log(addresses);
        resolve(addresses);
      }).catch(function(error) {
        reject(error);
      });
    });
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

  updateThroughput(readCapacity, writeCapacity) {
    var db = this;
    return new Promise(function(resolve, reject) {
      // check database throughput capacity
      // console.log('get database throughput');
      var describeTablePromise = db.dynamodb.describeTable({
        TableName: db.tableName
      }).promise();
      describeTablePromise.then(function(data) {
        if ((data.Table.ProvisionedThroughput.WriteCapacityUnits !== writeCapacity)
          || (data.Table.ProvisionedThroughput.ReadCapacityUnits !== readCapacity)) {
            // writeCapacity = Match.max(data.Table.ProvisionedThroughput.WriteCapacityUnits, writeCapacity);
            // readCapacity = Math.max(data.Table.ProvisionedThroughput.ReadCapacityUnits, readCapacity);
          var updateParams = {
            TableName: db.tableName,
            ProvisionedThroughput: {
              ReadCapacityUnits: readCapacity,
              WriteCapacityUnits: writeCapacity
            }
          };
          // console.log("updating capacity to - " + readCapacity + " : " + writeCapacity);
          db.waitForTableActive(db.tableName).then(function(d) {
            // console.log('table is active. update its capacity');
            var updPromise = db.dynamodb.updateTable(updateParams).promise();
            updPromise.then(function(re) {
              // console.log('table capacity updated. wait for it to become active.');
              db.waitForTableActive(db.tableName).then((res) => { resolve(res); }).catch((err) => { reject(err); });
            }).catch((er) => reject(er));
          }).catch(function(e) {
            reject(e);
          });
        } else {
          resolve('Capacity not required');
        }
      }).catch(function(error) {
        reject(error);
      });
    });
  }

  updateDBWriteCapacity(capacity) {
    var db = this;
    return new Promise(function(resolve, reject) {
      // check database throughput capacity
      // console.log('get database throughput');
      var describeTablePromise = db.dynamodb.describeTable({
        TableName: db.tableName
      }).promise();
      describeTablePromise.then(function(data) {
        // console.log("data.Table.ProvisionedThroughput.WriteCapacityUnits - " + data.Table.ProvisionedThroughput.WriteCapacityUnits);
        if (data.Table.ProvisionedThroughput.WriteCapacityUnits !== capacity) {
          var updateParams = {
            TableName: db.tableName,
            ProvisionedThroughput: {
              ReadCapacityUnits: data.Table.ProvisionedThroughput.ReadCapacityUnits,
              WriteCapacityUnits: capacity
            }
          };
          // console.log("updating capacity to - " + capacity);
          db.waitForTableActive(db.tableName).then(function(d) {
            // console.log('table is active. update its capacity');
            var updPromise = db.dynamodb.updateTable(updateParams).promise();
            updPromise.then(function(re) {
              // console.log('table capacity updated. wait for it to become active.');
              db.waitForTableActive(db.tableName).then((res) => { resolve(res); }).catch((err) => { reject(err); });
            }).catch((er) => reject(er));
          }).catch(function(e) {
            reject(e);
          });
        } else {
          resolve('Capacity not required');
        }
      }).catch(function(error) {
        // console.log("ERROR", error);
        reject(error);
      });
    });
  }

  updateDBReadCapacity(capacity) {
    var db = this;
    return new Promise(function(resolve, reject) {
      // check database throughput capacity
      // console.log('get database throughput');
      var describeTablePromise = db.dynamodb.describeTable({
        TableName: db.tableName
      }).promise();
      describeTablePromise.then(function(data) {
        // console.log("data.Table.ProvisionedThroughput.WriteCapacityUnits - " + data.Table.ProvisionedThroughput.WriteCapacityUnits);
        if (data.Table.ProvisionedThroughput.ReadCapacityUnits !== capacity) {
          var updateParams = {
            TableName: db.tableName,
            ProvisionedThroughput: {
              ReadCapacityUnits: capacity,
              WriteCapacityUnits: data.Table.ProvisionedThroughput.WriteCapacityUnits
            }
          };
          // console.log("updating capacity to - " + capacity);
          db.waitForTableActive(db.tableName).then(function(d) {
            // console.log('table is active. update its capacity');
            var updPromise = db.dynamodb.updateTable(updateParams).promise();
            updPromise.then(function(re) {
              // console.log('table capacity updated. wait for it to become active.');
              db.waitForTableActive(db.tableName).then((res) => { resolve(res); }).catch((err) => { reject(err); });
            }).catch((er) => reject(er));
          }).catch(function(e) {
            reject(e);
          });
        } else {
          resolve('Capacity not required');
        }
      }).catch(function(error) {
        // console.log("ERROR", error);
        reject(error);
      });
    });
  }

  updateAddresses(ipaddresses, source) {
    var db = this;

    return new Promise(function(resolve, reject) {
      db.getIPsBySourceRBL(source).then(function(existing) {
        // update database with only new records
        var newAddrs = _.difference(ipaddresses, existing);
        var putRequests = newAddrs.map((newAddr) => {
          return db.putRequest(newAddr, source);
        });

        console.log('Updating RBL with ' + newAddrs.length + ' addresses for ' + source);

        // db.updateDBWriteCapacity(newAddrs.length).then(function(results) {
          var batches = [];
          while(putRequests.length > 0) {
            // splice requests based on DynamoDB batch updates limit
            batches.push(putRequests.splice(0, db.batchCapacity));
          }
          var updAddrs = batches.map((batch) => {
            var params = {
              "RequestItems": {
                [db.tableName]:
                  batch
              }
            };
            return db.updateBatch(params);
          });
          var results = Promise.all(updAddrs);
          results.then((d) => resolve(newAddrs));
        // }).catch((error) => reject(error));
      }).catch((e) => reject(e));
    });
  }

  updateBatch(params) {
    var db = this;

    return new Promise(function(resolve, reject) {
      var getItemCountPromise = db.getItemCount().then((c) => {
        // var expectItemCount = c + items.length;
        // console.log('c - ' + c + ' : expectItemCount - ' + expectItemCount);
        var batchWritePromise = db.dynamodb.batchWriteItem(params).promise();
        batchWritePromise.then(function(results) {
          if (results.UnprocessedItems.hasOwnProperty(db.tableName)) {
            // process.stdout.write('.');
            return db.updateBatch({'RequestItems': results.UnprocessedItems});
          } else {
            resolve(results);
          }
        }).catch(function(error) {
          reject(error);
        });
      }).catch((e) => reject(e));
    });
  }

  getItemCount() {
    var db = this;
    return new Promise(function(resolve, reject) {
      var docClient = new aws.DynamoDB.DocumentClient();
      var scanPromise = docClient.scan({ TableName: db.tableName }).promise();
      scanPromise.then((data) => resolve(data.Count)).catch((err) => reject(err));
    });
  }
}

module.exports = IPDatabase;
