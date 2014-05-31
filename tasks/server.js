/*
 * nodeflow/tasks/server.js
 * Based on node_modules/grunt-browserify/tasks/browserify.js
 * Copyright (c) 2014 Chris Wilson
 */

'use strict';

var prefix = 'nodeflow.server';
/*
* grunt-browserify
* https://github.com/jmreidy/grunt-browserify
*
* Copyright (c) 2013 Justin Reidy
* Licensed under the MIT license.
*/
'use strict';
var path = require('path');
var async = require('async');

module.exports = Task;

function Task (grunt) {
	var task = this;
	grunt.registerTask('server',
		"Run the AMQP/RabbitMQ client and WebSocket server",
		function() {
			Task.runTask(grunt);
		});
}

Task.runTask = function (grunt, options) {
	var context = require('rabbit.js').createContext();
	context.on('ready', function() {
		log.info(prefix, 'Server starting');
		require('../lib/server');
	});
};
