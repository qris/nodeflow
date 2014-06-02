/*
 * nodeflow/lib/ClientLoader.js
 *
 * This is the require.js master loader and client initiator. This script
 * would be embedded in sockjs-client.html if require.js allowed it.
 *
 * Based on: http://requirejs.org/docs/api.html#define
 * Copyright (c) 2014 Chris Wilson
 */

// RequireJS is configured by loading lib/require.config.js first.

// Start the main app logic.
requirejs(['sockjs', 'Client'],
function(SockJS, Client) {
	// SockJS and Client are loaded and can be used here.
	var client = new Client('http://localhost:8080/socks');
	client.run();
});
