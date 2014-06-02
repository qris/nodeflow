// RequireJS is configured by loading lib/require.config.js first.

// http://www.nathandavison.com/article/17/using-qunit-and-requirejs-to-build-modular-unit-tests

"use strict";

// http://www.jshint.com/docs/
/* jshint node: false, -W097 */
/* global QUnit, define, test, ok */

// http://api.qunitjs.com/QUnit.config/#entry-examples
QUnit.config.autostart = false;

define(
	['Client'],
	function(Client) {
		test( "hello test", function() {
			ok( 1 == "1", "Passed!" );
		});

		// Finally start QUnit.
		// QUnit.load();
		// QUnit.start();
	}
);
