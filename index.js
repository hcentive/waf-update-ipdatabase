var aws = require('aws-sdk');
var async = require('async');
var IPDatabase = require('./lib/dynamodb.js');
var alienvault = require('./lib/alienvault.js');
var tor = require('./lib/tor.js');
var et = require('./lib/emergingthreats.js');

exports.handler = function(event, context) {
// var updateIPDatabase = function(event, context) {
  if (event.tableName !== undefined) {
    var ipdb = new IPDatabase(event.tableName);
  } else {
    var ipdb = new IPDatabase();
  }

  async.parallel([
    function (callback) {
      alienvault.getAVAddresses(null, function(error, data) {     // Update DynamoDB database with new IP addresses in Alienvault's RBL.
        if (error) {
          // callback(error, null);
          // console.log(error, error.stack);
          // process.exit(1);
          callback(error, null);
        } else {
          console.log("Updating blacklist table with " + data.length + " addresses from Alientvault");

          ipdb.createBlacklistTable(function(err, da) {
            if (err != null) {
              // callback(err, null);
              // console.log(err, err.stack);
              // process.exit(1);
              callback(err, null);
            } else {
              ipdb.updateAddresses(data, "alienvault", function(e, d) {
                if (e) {
                  // callback(e, null);
                  // console.log(e, e.stack);
                  // process.exit(1);
                  callback(e, null);
                } else {
                  console.log("Done updating IP database with Alienvault addresses");
                }
              });
            }
          });
        }
      });
    },
    function(callback) {
      tor.getTorAddresses(function(error, data) {       // Update DynamoDB database with new IP addresses in Tor Exit Nodes.
        if (error) {
          // callback(error, null);
          // console.log(error, error.stack);
          // process.exit(1);
          callback(error, null);
        } else {
          console.log("Updating blacklist table with " + data.length + " addresses from Tor");
          ipdb.createBlacklistTable(function(err, da) {
            if (err != null) {
              // callback(err, null);
              // console.log(err, err.stack);
              // process.exit(1);
              callback(err, null);
            } else {
              ipdb.updateAddresses(data, "tor", function(e, d) {
                if (e) {
                  // callback(e, null);
                  // console.log(e, e.stack);
                  // process.exit(1);
                  callback(e, null);
                } else {
                  console.log("Done updating IP database with Tor addresses");
                }
              });
            }
          });
        }
      });
    },
    function(callback) {
      et.getETAddresses(function(error, data) {
        if (error) {
          // callback(error, null);
          // console.log(error, error.stack);
          // process.exit(1);
          callback(error, null);
        } else {
          console.log("Updating blacklist table with " + data.length + " addresses from Emerging Threats");
          ipdb.createBlacklistTable(function(err, da) {
            if (err != null) {
              // callback(err, null);
              // console.log(err, err.stack);
              // process.exit(1);
              callback(err, null);
            } else {
              ipdb.updateAddresses(data, "emergingthreats", function(e, d) {
                if (e) {
                  // callback(e, null);
                  // console.log(e, e.stack);
                  // process.exit(1);
                  callback(e, null);
                } else {
                  console.log("Done updating IP database with Emerging Threats addresses");
                }
              });
            }
          });
        }
      });
    }
  ],
  function(err, results) {
    if (err) {
      // callback(e, null);
      console.log(err, err.stack);
      // context.done('error', 'IP blacklist database update failed : ' + err)
      // process.exit(1);
    } else {
      console.log("Done updating IP database with results - " + results);
      // context.done(results);
    }
  });
}

function callback(err, data) {
  if (err) {
    console.log(err, err.stack);
  } else {
    console.log(data);
  }
}

// updateIPDatabase(callback);
