/*
 * nodeflow/lib/Client.js
 * Based on https://github.com/sockjs/sockjs-client#example
 * Copyright (c) 2014 Chris Wilson
 */

define(['sockjs'],
	function(SockJS)
	{
		'use strict';

		var prefix = 'NodeFlow.Client';

		function Client (url) {
			this.url = url;
		}

		Client.prototype.run = function () {
			var sock = new SockJS('http://localhost:8080/socks');
			sock.onopen = function() {
				console.log('open');
			};
			sock.onmessage = function(e) {
				console.log('message', e.data);
			};
			sock.onclose = function() {
				console.log('close');
			};
		};

		return Client;
	}
);
