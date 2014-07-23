// tests for lib/Server.js (node server-side module) using nodeunit

"use strict";

var os = require("os");
var buster = require("buster");
var assert = buster.referee.assert;
var Server = require('../../lib/Server.js');

assert.rpc = function() {
	this.conn.handlers.data(JSON.stringify(arguments));
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
		assert.equals(assert.rpc.call(this, 'foobar'),
			['error', 'foobar', 'unknown command']);
	},

	"responds to get_network_interfaces request": function()
	{
		var expected = os.networkInterfaces();
		var actual = assert.rpc.call(this, 'get_network_interfaces');

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
		delete_mac_addresses(expected);
		delete_mac_addresses(actual);

		assert.equals(actual,
			['response', 'get_network_interfaces', expected],
			"should have got a list of network interfaces in " +
			"response to the get_network_interfaces command");
	}
});
