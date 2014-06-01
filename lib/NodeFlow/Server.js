// This example makes a web site providing an uppercasing service over
// SockJS. The web page sends the user's input over a SockJS socket,
// which is relayed to a REQuest socket which we're listening on with
// a REPly socket. The answer is then calculated and sent back to the
// browser.
//
// You may ask "Why not just reply directly instead of going through
// RabbitMQ?". Well, imagine that the uppercasing was in fact some
// specialised job that was running in another program, and further
// that we might wish to run several instances of that program to keep
// up with the requests. By using RabbitMQ, the requests will be
// load-balanced among all programs listening on a REPly socket.

var log = require('npmlog');
var http = require('http');
var url = require('url');
var fs = require('fs');
var sockjs = require('sockjs');
var context = require('rabbit.js').createContext('amqp://localhost:5672');

var port = process.argv[2] || 8080;
var prefix = 'NodeFlow.Server';
var exchange = 'pmacct';

// Create a web server on which we'll serve our demo page, and listen
// for SockJS connections.
var httpserver = http.createServer(handler);// Listen for SockJS connections
var sockjs_opts = {
	sockjs_url: "http://cdn.sockjs.org/sockjs-0.2.min.js"
};
var sjs = sockjs.createServer(sockjs_opts);
sjs.installHandlers(httpserver, {prefix: '[/]socks'});

context.on('ready', function() {
	log.info(prefix, 'server is up');

	// Hook requesting sockets up
	sjs.on('connection', function(connection) {
		log.info(prefix, 'incoming connection');

		var sub = context.socket('SUB',
			{exclusive: true, autoDelete: true, routing: 'direct'});
		sub.connect(exchange, 'acct', function(ok) {
			log.info(prefix, "bound exchange " + exchange +
				" to queue " + sub.queue + ": " + ok);
			connection.write({protocol: 'nodeflow', version: 0});
		});
		sub.on('data', function(msg) {
			log.info(prefix, msg.toString('utf-8'));
			connection.write(msg);
		});

		/*
		// Piping into a SockJS socket means that our REQ socket is closed
		// when the SockJS socket is, so there's no clean-up needed.
		var setup = worker.then(function(ch) {
			return ch.assertQueue('', {
				exclusive: true, autoDelete: true
			}).then(function(ok) {
				self.queue = ok.queue; // for inspection
				log.info("auto-created queue " + ok.queue);
				worker.connect('acct_1', function() {
					// ferry requests and responses back and forth
					log.info(prefix, 'start piping');
					req.pipe(connection);
					connection.pipe(req);
			}).then(function(ok) {
				return ch.bindQueue(ok.queue, , topic);
			});
		*/
	});

	// And finally, start the web server.
	httpserver.listen(port, '0.0.0.0');
});

// ==== boring details

function handler(req, res) {
	var path = url.parse(req.url).pathname;
	switch (path){
	case '/':
		path = '/index.html';
		// fall through
	default:
		fs.readFile(__dirname + path, function(err, data) {
			if (err) return send500(res, err);
			res.writeHead(200, {'Content-Type': 'text/html'});
			res.write(data, 'utf8');
			res.end();
		});
		break;
	}
}

function send404(res, path) {
	res.writeHead(404);
	res.write('404 ' + path);
	return res.end();
}

function send500(res, err) {
	res.writeHead(500);
	res.write('500 ' + err);
	return res.end();
}
