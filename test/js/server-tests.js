// tests for lib/Server.js (node server-side module) using nodeunit

"use strict";

var extend = require('extend');
var buster = require("buster");
var os = require("os");
var Q = require('q');
var Server = require('../../lib/Server.js');

var assert = buster.referee.assert;

assert.rpc = function() {
	assert.equals(0, this.conn.written.length,
		"There should be no incoming messages left over: " +
		JSON.stringify(this.conn.written));

	var args = Array.prototype.slice.apply(arguments);
	this.conn.handlers.data(JSON.stringify(args));

	assert.equals(1, this.conn.written.length,
		"There should only be one incoming message: " +
		JSON.stringify(this.conn.written));
	return JSON.parse(this.conn.written.pop());
};

var FakeResponse = function()
{
	this.status_code = undefined;
	this.body = undefined;
	this.ended = false;
};

FakeResponse.prototype.writeHead = function(status_code) {
	assert(this.status_code === undefined);
	assert(status_code !== undefined);
	this.status_code = status_code;
};

FakeResponse.prototype.write = function(body) {
	assert(this.status_code !== undefined);
	assert(this.body === undefined);
	assert(body !== undefined);
	this.body = body;
};

FakeResponse.prototype.end = function(y) {
	assert(!this.ended);
	assert(this.body !== undefined);
	this.ended = true;
};

buster.testCase("Server", {
	setUp: function()
	{
		// We need a mock MongoDB collection, which captures the
		// data written to it.
		function FakeMongoDb() {}

		extend(FakeMongoDb.prototype, {
			inserted: [],
			insert: function(data, callback)
			{
				// create a copy, for safety
				data = extend({}, data);
				this.inserted.push(data);
				if (callback)
				{
					callback(undefined, data);
				}
			}
		});

		function FakeMongo() {}
		extend(FakeMongo.prototype, {
			connect: function(uri, callback)
			{
				/*
				ok(callback === undefined, "we should be " +
					"expected to return a promise instead");
				*/
				callback(undefined, this);
			},
			collection: function(name, callback)
			{
				if (name == 'nodeflow_db')
				{
					return this.nodeflow_db;
				}
				else
				{
					throw new Error("Unknown database: " +
						name);
				}
			},
			nodeflow_db: new FakeMongoDb(),
		});
		this.mongo = new FakeMongo();

		this.server = new Server({
			bind_port: 18080,
			mongo_db: this.mongo,
			mongo_collection: 'nodeflow_db',
		});

		// Pass a fake connection data struct to onConnection to simulate a connection,
		// and save it so that we can inject data and see what the server wrote to this
		// connection.
		this.conn = {
			handlers: {},
			on: function dispatcher(type, handler)
			{
				this.handlers[type] = handler;
			},
			written: [],
			write: function write(data)
			{
				this.written.push(data);
			},
		};
		this.spy(this.conn, 'on');
		this.server.onConnection(this.conn);
		var message = this.conn.written.pop();
		assert.equals({protocol: 'nodeflow', version: 0},
			JSON.parse(message));
	},

	"binds a data handler": function()
	{
		assert.calledOnce(this.conn.on);
		assert.defined(this.conn.handlers.data);
	},

	"responds properly to invalid request": function()
	{
		assert.equals(assert.rpc.call(this, 123, 'foobar'),
			['error', 123, 'foobar', 'unknown command']);
	},

	"responds to a request for a nonexistent file with a 404 status": function()
	{
		var req = {
			url: 'http://localhost/nonexistent.html',
		};

		var res = new FakeResponse();
		this.server.handler(req, res);
		assert.equals(404, res.status_code, "The server should have sent a " +
			"404 status code");

	},

	"responds to get_network_interfaces request": function()
	{
		var actual = assert.rpc.call(this, 1234, 'get_network_interfaces');
		var expected = ['response', 1234, 'get_network_interfaces',
			os.networkInterfaces()];

		// Travis seems to generate random MAC addresses each time we
		// ask for the list of interfaces, so we need to remove them
		// to ensure that we have something to compare.
		function delete_mac_addresses(interfaces)
		{
			for (var interface_name in interfaces)
			{
				var addresses = interfaces[interface_name];
				for (var i = 0; i < addresses.length; i++)
				{
					delete addresses[i].mac;
				}
			}
		}
		delete_mac_addresses(expected[3]);
		delete_mac_addresses(actual[3]);

		assert.equals(actual, expected,
			"should have got a list of network interfaces in " +
			"response to the get_network_interfaces command");
	},

	"responds to incoming data from RabbitMQ by forwarding it to client": function()
	{
		// Mock the server's RabbitMQ context
		extend(this.server.context, {
			// Fake server.context.socket() method to return our fake socket
			socket: function() {
				return this.fake_rabbit_sub;
			},
			fake_rabbit_sub: {
				// which has a connect() method that does nothing
				connect: function() { },
				// and an on() method which captures the handler
				on: function(event_name, handler)
				{
					this.handlers[event_name] = handler;
				},
				// and an object to store captured handlers
				handlers: { },
			},
		});

		this.server.run();
		var handler = this.server.context.fake_rabbit_sub.handlers.data;
		assert.defined(handler, "Server should have bound a handler " +
			"for data events");

		// Initiate a fake "connection", check that the handler is bound
		// this.server.onConnection(mock_connection);

		// Now send a test packet to the handler
		var packet = {
			timeslot_start: 1,
			timeslot_end: 2,
		};

		// Send the packet to the handler
		handler.call(this.server, JSON.stringify(packet));

		var expected_write = ['packet',
			{
				timeslot_start: Date.parse('1'),
				timeslot_end: Date.parse('2'),
			}
		];

		assert.equals(this.conn.written[0],
			JSON.stringify(expected_write),
			"Server should have sent the packet to the " +
			"connected SockJS client");

		assert.equals(this.mongo.nodeflow_db.inserted, [expected_write[1]],
			"Server should have sent the packet to MongoDB as well");
	},
});
