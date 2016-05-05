var async = require('async');
var aws = require('aws-sdk');

// test locally
// aws.config.update({
//     region: "us-east-1",
//     endpoint: "http://localhost:8000"
// });

var dynamodb = new aws.DynamoDB();
var docClient = new aws.DynamoDB.DocumentClient();

var tableName = "IPBlacklist";
var newTableWriteCapacity = 1000;
var existingTableWriteCapacity = 10;

var tableParams = function (capacity) {
  if (!capacity) {
    capacity = existingTableWriteCapacity;
  }
  return {
    TableName: tableName,
    KeySchema: [
      {AttributeName: "IPAddress", KeyType: "HASH"}
    ],
    AttributeDefinitions: [
      {AttributeName: "IPAddress", AttributeType: "S"}
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 1,
      WriteCapacityUnits: capacity
    },
    StreamSpecification: {
      StreamEnabled: true,
      StreamViewType: "NEW_AND_OLD_IMAGES"
    }
  };
};

var ipRecord = function(ipaddress, source) {
  return {
    TableName: tableName,
    Item: {
      "IPAddress": ipaddress,
      "CreatedDate": (new Date()).toUTCString(),
      "SourceRBL": source,
      "Active": "true"
    },
    ConditionExpression: "attribute_not_exists(IPAddress) and attribute_not_exists(SourceRBL)"
  };
};

// create IP blacklist table if it does not exist
var createIPBlacklistTable = function(callback) {
  // dynamodb.listTables({ExclusiveStartTableName: tableName, Limit: 1}, function(error, data) {
  dynamodb.describeTable({TableName: tableName}, function(error, data) {
    if (error) {
      if (error.code === 'ResourceNotFoundException') {
        // table does not exist. create it
        console.log("Creating " + tableName);
        dynamodb.createTable(tableParams(newTableWriteCapacity), function(e, d) {
          if (e) {
            callback(e, null);
          } else {
            dynamodb.waitFor('tableExists', {TableName: tableName}, (err, dat) => callback(err, dat));
          }
        });
      } else {
        callback(error, null);
      }
    } else {
      console.log(tableName + " - exists");
      callback(null, data);
    }
  });
};

var getRecordByIP = function(ipaddress, callback) {
  var params = {
    TableName: tableName,
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
};

var getRecordByIPandSource = function(ipaddress, source, callback) {
  var params = {
    TableName: tableName,
    KeyConditionExpression: "IPAddress = :ipaddress",
    FilterExpression: "SourceRBL = :source",
    ExpressionAttributeValues: {
        ":ipaddress": ipaddress,
        ":source": source
    }
  };

  docClient.query(params, function(err, data) {
    if (err) {
      callback(err, null);
    } else {
      callback(null, data);
    }
  });
};

var createIPRecord = function(ipaddress, source, callback) {
  var record = ipRecord(ipaddress, source);
  // console.log(record);
  docClient.put(record, function(err, data) {
    if (err) {
      callback(err, null);
    } else {
      callback(null, data);
    }
  });
};

var addSourceRBL = function(ipaddress, source, callback) {
  getRecordByIP(ipaddress, function(err, data) {
    if (err) {
      callback(err, null);
    } else {
      var src = data.Items[0].SourceRBL;
      src.push(source);

      var ud = (new Date()).toUTCString();

      var updateParams = {
        TableName: tableName,
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

      docClient.update(updateParams, function(e, d) {
        if (e) {
          callback(e, null);
        } else {
          callback(null, d);
        }
      });
    }
  });
};

var deactivateIPRecord = function (ipaddress, source, callback) {
  var params = {
    TableName: tableName,
    Key: {
        "IPAddress":ipaddress
    },
    UpdateExpression: "SET Active = :active, UpdatedDate = :udate",
    ExpressionAttributeValues: {
        ":active": "false",
        ":udate": (new Date()).toUTCString()
    },
    ReturnValues: "ALL_NEW"
  };

  docClient.update(params, function(err, data) {
    if (err) {
      callback(err, null);
    } else {
      callback(null, data);
    }
  });
};

var putRequest = function(address, source) {
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
};

var createIPRecords = function(ipaddresses, source, callback) {
  var params = {RequestItems: {IPBlacklist: []},ReturnConsumedCapacity: "TOTAL"};
  ipaddresses.forEach(function(address) {
    getRecordByIPandSource(address, source, function(err, data) {
      if (err) {
        callback(err, null);
      } else {
        // console.log(JSON.stringify(data.Count));
        if (data.Count == 0){
          console.log("creating record " + address + " : " + source);
          createIPRecord(address, source, function(error, dat) {
            if (error) {
              if (error.code != 'ConditionalCheckFailedException'){
                callback(error, null);
                return;
              } else {
                console.log('Duplicate address found - ' + address);
              }
            }
          });
        }
      }
    });
  });
  //check table WriteCapacityUnits; if value is not equal to existingTableWriteCapacity, then change it to existingTableWriteCapacity;
  dynamodb.describeTable({TableName: tableName}, function(error, data) {
    if (error) {
      callback(error, null);
      return;
    }
    if (data.Table.ProvisionedThroughput.WriteCapacityUnits > existingTableWriteCapacity) {
      var updateParams = {
        TableName: tableName,
        ProvisionedThroughput: {
          ReadCapacityUnits: 1,
          WriteCapacityUnits: existingTableWriteCapacity
        }
      };
      dynamodb.updateTable(updateParams, function(e, d) {
        if (e) {
          callback(e, null);
          return;
        }
      });
    }
  });
  callback(null, ipaddresses);
};

exports.updateAddresses = function(addresses, source, callback) {
  createIPRecords(addresses, source, callback);
};

exports.createBlacklistTable = function(callback) {
  createIPBlacklistTable(callback);
};
