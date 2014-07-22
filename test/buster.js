// http://docs.busterjs.org/en/latest/overview/

"use strict";

var config = module.exports;

config["node"] = {
    environment: "node",
    rootPath: "../",
    sources: [
        "lib/Server.js",
    ],
    tests: [
        "test/js/server-tests.js"
    ]
};

