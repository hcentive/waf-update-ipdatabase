var aws = require('aws-sdk');
var alienvault = require('./lib/alienvault.js');
var db = require('./lib/dynamodb.js');

exports.handler = function(event, context) {
  // Update DynamoDB database with new IP addresses in Alienvault's RBL.
  alienvault.getAVAddresses(null, function(error, data) {
    if (error) {
      // callback(error, null);
      console.log(error, error.stack);
      process.exit(1);
    } else {
      console.log("Updating blacklist table with " + data.length);

      db.createBlacklistTable(function(err, da) {
        if (err != null) {
          // callback(err, null);
          console.log(err, err.stack);
          process.exit(1);
        } else {
          db.updateAddresses(data, "alienvault", function(e, d) {
            if (e) {
              // callback(e, null);
              console.log(err, err.stack);
              process.exit(1);
            } else {
              console.log("Done updating IP database");
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

// updateIPDatabase(callback);
