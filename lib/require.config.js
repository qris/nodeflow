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
	baseUrl: '../lib',
	// Except these ones which either live elsewhere, or have different filenames:
	paths: {
		sockjs: '../lib/ext/sockjs-0.3.min',
		tests: '../test/js/tests',
		qunit: '../test/js/qunit-1.14.0',
		jquery: '../lib/ext/jquery-1.11.1',
		flot: '../lib/ext/flot/jquery.flot',
		flot_time: '../lib/ext/flot/jquery.flot.time',
		handlebars: '../lib/ext/handlebars-v1.3.0',
		netmask: '../node_modules/netmask/lib/netmask'
	},
	// http://www.nathandavison.com/article/17/using-qunit-and-requirejs-to-build-modular-unit-tests
	shim: {
		'qunit': {
			exports: 'QUnit',
			init: function() {
				QUnit.config.autoload = false;
				QUnit.config.autostart = false;
			}
		},
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
