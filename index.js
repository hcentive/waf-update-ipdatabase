var aws = require('aws-sdk');
var async = require('async');
var IPDatabase = require('./lib/ipdatabase.js');
var av = require('./lib/alienvault.js');
var tor = require('./lib/tor.js');
var et = require('./lib/emergingthreats.js');

exports.handler = function(event, context, callback) {
  if (event.tableName !== undefined) {
    var ipdb = new IPDatabase(event.tableName);
  } else {
    var ipdb = new IPDatabase();
  }

  ipdb.createBlacklistTable(function(error, data) {
    if (error) {
      callback(error, null);
    } else {
      Promise.all([av.getAddresses(), et.getAddresses(), tor.getAddresses()])
      .then(([avaddr, etaddr, toraddr]) => {
        addresses = avaddr.concat(etaddr, toraddr);
        console.log('Update database capacity before writing');
        ipdb.updateDBWriteCapacity(addresses.length).then(function(d) {
          console.log('Database capacity updated');
          Promise.all([ipdb.updateAddresses(avaddr, "alienvault"),
                      ipdb.updateAddresses(etaddr, "emergingthreats"),
                      ipdb.updateAddresses(toraddr, "tor")])
          .then(([avres, etres, torres]) => {
            console.log('Updated IPDB with - ');
            console.log('\t* Alienvault - ' + avres.length);
            console.log('\t* Emergingthreats - ' + etres.length);
            console.log('\t* Tor - ' + torres.length);

            console.log('Reset database capacity');
            ipdb.updateDBWriteCapacity(ipdb.tableCapacity)
              .then((r) => callback(null, addresses))
              .catch((e) => callback(e, null));
          }).catch((err) => callback(err, null));
        }).catch(function(e) {
          console.log(e);
          callback(e, null);
        });
      });
    }
  });
}
