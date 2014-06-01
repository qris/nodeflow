// http://requirejs.org/docs/api.html#define

requirejs.config({
    // By default load any module IDs from js/lib
    baseUrl: '',
    // except, if the module ID starts with "app",
    // load it from the js/app directory. paths
    // config is relative to the baseUrl, and
    // never includes a ".js" extension since
    // the paths config could be for a directory.
    paths: {
        sockjs: 'ext/sockjs-0.3.min'
    }
});

// Start the main app logic.
requirejs(['sockjs', 'Client'],
function(SockJS, Client) {
	// SockJS and Client are loaded and can be used here.
	var client = new Client('http://localhost:8080/socks');
	client.run();
});
