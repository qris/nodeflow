# NodeFlow

A JavaScript Netflow/IPFIX collector and graphing tool.

Written in Node.JS, to make use of
[Node-Netflowd](https://github.com/Sghazzawi/Node-Netflowd), but runs in the
browser with [Browserify](https://github.com/substack/node-browserify).
Designed according to the principles discussed in
[Cross platform JavaScript with Browserify – Sharing Code Between Node.js and the Browser](https://blog.codecentric.de/en/2014/02/cross-platform-javascript/).

## Usage

To install dependencies on a freshly checked-out project:

	npm install

To lint, run tests, and build `browser/dist/NodeFlow.standalone.js`:

	grunt

To run the built-in HTTP server (not working?):

	grunt server

To run the build-in RabbitMQ client and WebSocket server, to receive
messages from pmacct and forward them to connected in-browser clients:

	nodejs lib/NodeFlow/Server.js

Then you can connect to this server using your browser, and receive
Netflow messages from pmacct, at this URL:

* http://localhost:8080/sockjs-client.html
