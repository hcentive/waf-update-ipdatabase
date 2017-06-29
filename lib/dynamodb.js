var aws = require('aws-sdk');

// test locally
// aws.config.update({
//     region: "us-east-1",
//     endpoint: "http://localhost:8000"
// });

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

  // create IP blacklist table if it does not exist
  createIPBlacklistTable(callback) {
    // this.dynamodb.listTables({ExclusiveStartTableName: tableName, Limit: 1}, function(error, data) {
    var db = this;
    db.dynamodb.describeTable({
      TableName: db.tableName
    }, function(error, data) {
      if (error) {
        if (error.code === 'ResourceNotFoundException') {
          // table does not exist. create it
          db.dynamodb.createTable(db.tableParams(db.newTableWriteCapacity), function(e, d) {
            if (e) {
              callback(e, null);
            } else {
              db.dynamodb.waitFor('tableExists', {
                TableName: db.tableName
              }, (err, dat) => callback(err, dat));
            }
          });
        } else {
          callback(error, null);
        }
      } else {
        // console.log(tableName + " - exists");
        callback(null, data);
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

  getRecordByIPandSource(ipaddress, source, callback) {
    var params = {
      TableName: this.tableName,
      KeyConditionExpression: "IPAddress = :ipaddress",
      FilterExpression: "SourceRBL = :source",
      ExpressionAttributeValues: {
        ":ipaddress": ipaddress,
        ":source": source
      }
    };

    this.docClient.query(params, function(err, data) {
      if (err) {
        callback(err, null);
      } else {
        callback(null, data);
      }
    });
  }

  createIPRecord(ipaddress, source, callback) {
    var record = this.ipRecord(ipaddress, source);
    // console.log(record);
    this.docClient.put(record, function(err, data) {
      if (err) {
        callback(err, null);
      } else {
        callback(null, data);
      }
    });
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

  createIPRecords(ipaddresses, source, callback) {
    var db = this;
    var params = {
      RequestItems: {
        IPBlacklist: []
      },
      ReturnConsumedCapacity: "TOTAL"
    };
    ipaddresses.forEach(function(address) {
      db.getRecordByIPandSource(address, source, function(err, data) {
        if (err) {
          callback(err, null);
        } else {
          // console.log(JSON.stringify(data.Count));
          if (data.Count == 0) {
            // console.log("creating record " + address + " : " + source);
            db.createIPRecord(address, source, function(error, dat) {
              if (error) {
                if (error.code != 'ConditionalCheckFailedException') {
                  callback(error, null);
                  return;
                } else {
                  // ignore duplicates
                  console.log('Duplicate address found - ' + address);
                }
              }
            });
          }
        }
      });
    });
    //check table WriteCapacityUnits; if value is not equal to existingTableWriteCapacity, then change it to existingTableWriteCapacity;
    db.dynamodb.describeTable({
      TableName: db.tableName
    }, function(error, data) {
      if (error) {
        callback(error, null);
      }
      if (data.Table.ProvisionedThroughput.WriteCapacityUnits > db.existingTableWriteCapacity) {
        var updateParams = {
          TableName: db.tableName,
          ProvisionedThroughput: {
            ReadCapacityUnits: 1,
            WriteCapacityUnits: db.existingTableWriteCapacity
          }
        };
        db.dynamodb.updateTable(updateParams, function(e, d) {
          if (e) {
            callback(e, null);
            return;
          } else {
            callback(null, ipaddresses);
          }
        });
      } else {
        callback(null, ipaddresses);
      }
    });
  }
}

module.exports = IPDatabase;

exports.updateAddresses = function(addresses, source, callback) {
  const ipdb = new IPDatabase();
  ipdb.createIPRecords(addresses, source, callback);
};

exports.createBlacklistTable = function(callback) {
  const ipdb = new IPDatabase();
  ipdb.createIPBlacklistTable(callback);
};
