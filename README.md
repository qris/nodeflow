# NodeFlow

A JavaScript Netflow/IPFIX collector and graphing tool.

Written in Node.JS, to make use of
[Node-Netflowd](https://github.com/Sghazzawi/Node-Netflowd), but runs in the
browser with [Browserify](https://github.com/substack/node-browserify).
Designed according to the principles discussed in
[Cross platform JavaScript with Browserify – Sharing Code Between Node.js and the Browser](https://blog.codecentric.de/en/2014/02/cross-platform-javascript/).

## Installation

To install dependencies on a freshly checked-out project:

	npm install

Many commands are run through `grunt`, which you can either install globally:

	npm install -g grunt

Or add to your `PATH`:

	export PATH=`pwd`/node_modules/grunt-cli/bin:$PATH

Or run using its relative path:

	node_modules/grunt-cli/bin/grunt

## Running the interactive client

To run the built-in RabbitMQ client and WebSocket server, to receive
messages from pmacct and forward them to connected in-browser clients:

	grunt server

To lint and start the server:

	grunt

After starting the server, you can
[connect to this server](http://localhost:8080/www/client.html) using your
browser, and see the Netflow traffic graphed.

## Running tests

You can run the tests for the server-side Node.js module Server.js from the
command line with:

	bin/buster-test

You can run the tests for the client-side browser module Client.js from the
command line with:

	grunt test

Note: you need PhantomJS 2.0 for the tests to pass, but `npm` currently
installs 1.9.7 instead, which
[doesn't work](https://github.com/ariya/phantomjs/issues/10952). To upgrade
your `npm` installation of PhantomJS to 2.0:

* [Download it here](https://groups.google.com/d/msg/phantomjs/cgTH-jqCSGg/RGWsAHiVSZAJ)
  and unpack the ZIP file (or just look in the phantomjs_2 directory)
* Find the correct PhantomJS binary for your system
* Copy it to `node_modules/grunt-contrib-qunit/node_modules/grunt-lib-phantomjs/node_modules/phantomjs/lib/phantom/bin/phantomjs`,
replacing the PhantomJS 1.9.7 binary installed by `grunt-contrib-qunit`.

You can also run the tests in a web browser by starting the dummy server:

	grunt connect:server:keepalive

and then [open the test suite in your browser](http://localhost:1234/test/runner.html).

