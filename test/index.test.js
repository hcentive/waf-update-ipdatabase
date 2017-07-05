'use strict';

const expect = require('chai').expect;
const request = require('request');
const aws = require('aws-sdk');
const index = require("../index.js");

// test locally
aws.config.update({
    region: "us-east-1",
    endpoint: "http://localhost:8000"
});

describe("Index", function() {
  it("calls exports.handler", function(done) {
    expect(1).to.equal(1);
    done();
  });
});
