/*
 * nodeflow/lib/Server.js
 * Based on https://github.com/squaremo/rabbit.js/blob/master/example/sockjs/server.js
 * Copyright (c) 2014 Chris Wilson
 * Copyright (c) 2014 rabbit.js (info@rabbitmq.com)
 * Licensed under the MPL license.
 */

'use strict';

var extend = require('extend');
var fs = require('fs');
var http = require('http');
var log = require('npmlog');
var os = require('os');
var sockjs = require('sockjs');
var url = require('url');

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
		var data = JSON.parse(msg.toString('utf-8'));
		if (!data.timeslot_start || !data.timeslot_end)
		{
			server.log.info("rejecting incoming packet with no " +
				"timeslot start/end times: did you use a " +
				"recent enough version of pmacct with " +
				"'amqp_history: 1s' in the configuration?");
		}
		else
		{
			data.timeslot_start = Date.parse(data.timeslot_start);
			data.timeslot_end = Date.parse(data.timeslot_end);
			var str = JSON.stringify(['packet', data]);
			server.log.info("sending to client: " + str);
			connection.write(str);
		}
	});

	// Handle incoming packets from sockjs client (browser)
	/*
	 * Server handles incoming RPC requests (commands) from Client: Websockets data
	 * consisting of JSON dumps of arrays, where the first item in the array is the
	 * command name and the remaining items are command arguments.
	 *
	 * It sends back a reply to each request, which is a JSON dump of an array,
	 * where the first item is "response" or "error". The second item is the command
	 * name, and the remaining items are response arguments.
	 */
	connection.on('data', function(message) {
		server.log.info("received from client: " + message);
		message = JSON.parse(message);
		var response;

		switch (message[0])
		{
			case 'get_network_interfaces':
				response = server.get_network_interfaces(message);
				break;

			default:
				response = ['error', message[0], 'unknown command'];
				break;
		}

		var str = JSON.stringify(response);
		server.log.info("replying to client: " + str);
		connection.write(str);
	});
};

Server.prototype.get_network_interfaces = function(message)
{
	return [
		'response', 'get_network_interfaces',
		os.networkInterfaces()
	];
};

// ==== boring details

Server.prototype.handler = function(req, res)
{
	console.assert(this instanceof Server);
	var server = this;

	var path = url.parse(req.url).pathname;
	if (path == '/')
	{
		path = '/www/index.html';
	}

	var content_type = 'text/html';
	if (path.substr(-4) == '.css')
	{
		content_type = 'text/css';
	}

	fs.readFile(__dirname + "/.." + path, function(err, data) {
		if (err) return server.send500(res, err);
		res.writeHead(200, {'Content-Type': content_type});
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

