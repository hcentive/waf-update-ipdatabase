var aws = require('aws-sdk');
var async = require('async');
var IPDatabase = require('./lib/ipdatabase.js');
var alienvault = require('./lib/alienvault.js');
var tor = require('./lib/tor.js');
var et = require('./lib/emergingthreats.js');

exports.handler = function(event, context, cback) {
  if (event.tableName !== undefined) {
    var ipdb = new IPDatabase(event.tableName);
  } else {
    var ipdb = new IPDatabase();
  }

  ipdb.createBlacklistTable(function(err, da) {
    if (err) {
      cback(err, null);
    } else {
      async.series([
        function (callback) {
          alienvault.getAVAddresses(null, function(error, data) {     // Update DynamoDB database with new IP addresses in Alienvault's RBL.
            if (error) {
              callback(error, null);
            } else {
              console.log("Updating blacklist table with " + data.length + " addresses from Alienvault");
              ipdb.updateAddresses(data, "alienvault", function(e, d) {
                if (e) {
                  callback(e, null);
                } else {
                  console.log("Done updating IP database with Alienvault addresses");
                  callback(null, d);
                }
              });
            }
          });
        },
        function(callback) {
          tor.getTorAddresses(function(error, data) {       // Update DynamoDB database with new IP addresses in Tor Exit Nodes.
            if (error) {
              callback(error, null);
            } else {
              console.log("Updating blacklist table with " + data.length + " addresses from Tor");
              ipdb.updateAddresses(data, "tor", function(e, d) {
                if (e) {
                  callback(e, null);
                } else {
                  console.log("Done updating IP database with Tor addresses");
                  callback(null, d);
                }
              });
            }
          });
        },
        function(callback) {
          et.getETAddresses(function(error, data) {
            if (error) {
              callback(error, null);
            } else {
              console.log("Updating blacklist table with " + data.length + " addresses from Emerging Threats");
              ipdb.updateAddresses(data, "emergingthreats", function(e, d) {
                if (e) {
                  callback(e, null);
                } else {
                  console.log("Done updating IP database with Emerging Threats addresses");
                  callback(null, d);
                }
              });
            }
          });
        }
      ],
      function(err, results) {
        if (err) {
          cback(err, null);
        } else {
          console.log("Done updating IP database", results.reduce((a, b) => a+b).length());
          cback(null, results);          
        }
      });
    }
  });
}
