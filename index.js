var aws = require('aws-sdk');
var alienvault = require('./lib/alienvault.js');
var db = require('./lib/dynamodb.js');

var updateIPDatabase = function(callback) {
  // Update DynamoDB database with new IP addresses in Alienvault's RBL.
  alienvault.getAVAddresses(null, function(error, data) {
    if (error) {
      callback(error, null);
      process.exit(1);
    } else {
      console.log("Updating blacklist table with " + data.length);

      db.createBlacklistTable(function(err, da) {
        if (err != null) {
          callback(err, null);
          process.exit(1);
        } else {
          db.updateAddresses(data, "alienvault", function(e, d) {
            if (e) {
              callback(e, null);
              process.exit(1);
            } else {
              callback(null, d);
            }
          });
        }
      });
    }
  });
};

function callback(err, data) {
  if (err) {
    console.log(err, err.stack);
  } else {
    console.log(data);
  }
}

updateIPDatabase(callback);
