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
		assert.equals(assert.rpc.call(this, 'get_network_interfaces'),
			['response', 'get_network_interfaces',
				os.networkInterfaces()]);
	}
});
