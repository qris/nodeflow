// tests for lib/Server.js (node server-side module) using nodeunit

"use strict";

var os = require("os");
var buster = require("buster");
var assert = buster.referee.assert;
var Server = require('../../lib/Server.js');

assert.rpc = function() {
	var args = Array.prototype.slice.apply(arguments);
	this.conn.handlers.data(JSON.stringify(args));
	return JSON.parse(this.conn.written[0]);
};

buster.testCase("Server", {
	setUp: function()
	{
		this.server = new Server();
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

	"responds to incoming data from RabbitMQ by forwarding it": function()
	{
		// Mock the server's RabbitMQ context
		this.server.context = {
			// Fake server.context.socket() method to return our fake socket
			socket: function() {
				return this.fake_socket;
			},
			fake_socket: {
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
		};

		// We also need a mock SockJS connection, which captures the
		// data written to it.
		var mock_connection = {
			written: [],
			write: function(data)
			{
				this.written.push(data);
			},
			// fake event handler for incoming packets from client
			on: function(message) { },
		};

		// Initiate a fake "connection", check that the handler is bound
		this.server.onConnection(mock_connection);
		var handler = this.server.context.fake_socket.handlers.data;
		assert.defined(handler, "Server should have bound a handler " +
			"for data events");

		// Now send a test packet to the handler
		var packet = {
			timeslot_start: 1,
			timeslot_end: 2,
		};

		handler(JSON.stringify(packet));
		var expected_write = ['packet',
			{
				timeslot_start: Date.parse('1'),
				timeslot_end: Date.parse('2'),
			}
		];

		assert.equals(mock_connection.written[0],
			JSON.stringify(expected_write),
			"Server should have sent the packet to the " +
			"connected SockJS client");
	},
});
