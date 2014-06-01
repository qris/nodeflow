/*
 * nodeflow/lib/Server.js
 * Based on https://github.com/squaremo/rabbit.js/blob/master/example/sockjs/server.js
 * Copyright (c) 2014 Chris Wilson
 * Copyright (c) 2014 rabbit.js (info@rabbitmq.com)
 * Licensed under the MPL license.
 */

'use strict';

var log = require('npmlog');
var http = require('http');
var url = require('url');
var fs = require('fs');
var extend = require('extend');
var sockjs = require('sockjs');

module.exports = Server;

function Server(opts)
{
	this.options = {
		log_prefix: 'NodeFlow.Server',
		exchange: 'pmacct',
		mq_url: 'amqp://localhost:5672',
		ws_url: '[/]socks',
		bind_address: '0.0.0.0',
		bind_port: 8080,
		routing_key: 'acct',
		sockjs_opts: {
			sockjs_url: "http://cdn.sockjs.org/sockjs-0.2.min.js"
		}
	};

	opts = extend(this.options, opts);
	this.context = require('rabbit.js').createContext(opts.mq_url);

	this.log = function(level, message)
	{
		var args = Array.prototype.slice.call(arguments, 0);
		args.unshift(opts.log_prefix);
		log[level].apply(log, args);
	};

	this.log.info = function(message)
	{
		var args = Array.prototype.slice.call(arguments, 0);
		args.unshift(opts.log_prefix);
		log.info.apply(log, args);
	};
}

Server.prototype.run = function()
{
	// Create a web server on which we'll serve our demo page, and listen
	// for SockJS connections.
	console.assert(this instanceof Server);
	var server_instance = this;
	this.httpserver = http.createServer(function() {
		return server_instance.handler.apply(server_instance, arguments);
	});
	this.sjs = sockjs.createServer(this.options.sockjs_opts);
	this.sjs.installHandlers(this.httpserver,
		{prefix: this.options.ws_url});
	this.context.on('ready', this.onReady.bind(this));
	this.log.info('server is starting');
};

Server.prototype.onReady = function()
{
	// Hook requesting sockets up
	this.sjs.on('connection', this.onConnection.bind(this));

	// And finally, start the web server.
	this.httpserver.listen(this.options.bind_port, this.options.bind_address);

	this.log.info('server is running on ' + this.options.bind_address +
		':' + this.options.bind_port);
};

Server.prototype.onConnection = function(connection)
{
	this.log.info('incoming connection');
	var server = this;

	this.sub = this.context.socket('SUB',
		{exclusive: true, autoDelete: true, routing: 'direct'});
	this.sub.connect(this.options.exchange, this.options.routing_key,
		function(ok) {
			server.log.info("bound exchange " + this.exchange +
				" to queue " + this.sub.queue + " for " +
				this.options.routing_key + "messages: " + ok);
			connection.write({protocol: 'nodeflow', version: 0});
		});
	this.sub.on('data', function(msg) {
		server.log.info("sending to client: " + msg.toString('utf-8'));
		connection.write(msg);
	});
};

// ==== boring details

Server.prototype.handler = function(req, res)
{
	console.assert(this instanceof Server);
	var server = this;
	var path = url.parse(req.url).pathname;
	if (path == '/')
	{
		path = '/index.html';
	}

	fs.readFile(__dirname + path, function(err, data) {
		if (err) return server.send500(res, err);
		res.writeHead(200, {'Content-Type': 'text/html'});
		res.write(data, 'utf8');
		res.end();
	});
};

Server.prototype.send404 = function(res, path)
{
	res.writeHead(404);
	res.write('404 ' + path);
	return res.end();
};

Server.prototype.send500 = function(res, err)
{
	res.writeHead(500);
	res.write('500 ' + err);
	return res.end();
};

