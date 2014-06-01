/*
 * nodeflow/tasks/server.js
 * Based on http://github.com/amiorin/grunt-watchify
 * Copyright (c) 2014 Chris Wilson
 * Copyright (c) 2013 Alberto Miorin, contributors
 * Licensed under the MIT license.
 */

'use strict';

module.exports = function(grunt) {
	var Server = require('../lib/Server');

	grunt.registerTask('server',
		"Run the AMQP/RabbitMQ client and WebSocket server",
		function() {
			var self = this,
				_ = grunt.util._,
				done = _.once(self.async());
			new Server().run();
		});
};

