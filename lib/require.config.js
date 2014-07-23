/*
 * nodeflow/lib/require.config.js
 *
 * Configures require.js with the paths to all named modules, in lib, lib/ext
 * and test directories.
 *
 * Based on: http://requirejs.org/docs/api.html#config
 * Copyright (c) 2014 Chris Wilson
 */

/* jshint -W079, node: false */

var require = {
	// By default load any module IDs from the lib directory.
	baseUrl: '..',
	// Except these ones which either live elsewhere, or have different filenames:
	paths: {
		'amd-loader': 'bower_components/amd-loader/amd-loader',
		cjs: 'bower_components/cjs/cjs',
		Client: 'lib/Client',
		flot: 'lib/ext/flot/jquery.flot',
		flot_time: 'lib/ext/flot/jquery.flot.time',
		handlebars: 'lib/ext/handlebars-v1.3.0',
		jquery: 'lib/ext/jquery-1.11.1',
		netmask: 'node_modules/netmask/lib/netmask',
		qunit: 'node_modules/qunit/node_modules/qunitjs/qunit/qunit',
		sockjs: 'lib/ext/sockjs-0.3.min',
		tests: 'test/js/tests',
		tests_grunt: 'test/js/qunit-phantomjs-bridge',
	},
	// http://www.nathandavison.com/article/17/using-qunit-and-requirejs-to-build-modular-unit-tests
	shim: {
		'flot': {
			// These script dependencies should be loaded before flot:
			deps: ['jquery'],
		},
		'flot_time': {
			// These script dependencies should be loaded before flot:
			deps: ['flot'],
		},
		'handlebars': {
			exports: 'Handlebars'
		},
		'netmask': {
			exports: 'Netmask'
		}
	}
};
