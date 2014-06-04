// RequireJS is configured by loading lib/require.config.js first.

// http://www.nathandavison.com/article/17/using-qunit-and-requirejs-to-build-modular-unit-tests

"use strict";

// http://www.jshint.com/docs/
/* jshint node: false, -W097 */
/* global QUnit, define, test, ok, equal, deepEqual */

// http://api.qunitjs.com/QUnit.config/#entry-examples
QUnit.config.autostart = false;

define(
	['Client', 'jquery'],
	function(Client, jquery) {
		function FakeSockJsClient() {
		}

		test("create a Controller", function()
		{
			var sock = new FakeSockJsClient();
			var con = new Client.Controller({
				socket: sock
			});
			con.run();
			equal(sock, con.sock);
			equal('function', typeof sock.onopen,
				"Controller should have set event handlers on the socket");
			equal('function', typeof sock.onmessage,
				"Controller should have set event handlers on the socket");
			equal('function', typeof sock.onclose,
				"Controller should have set event handlers on the socket");
		});

		var sample_packet = {
			"ip_dst": "196.200.217.54",
			"ip_proto": "tcp",
			"tos": 72,
			"ip_src": "86.30.131.111",
			"bytes": 1976,
			"port_dst": 37201,
			"packets": 8,
			"port_src": 2201,
			"timeslot_start": 1000,
			"timeslot_end": 2000
		};

		test("send messages to Controller", function()
		{
			var sock = new FakeSockJsClient();
			var db = new Client.Database();
			var con = new Client.Controller({
				socket: sock,
				database: db
			});
			var handle = con.run();
			equal(con.database, db);
			sock.onmessage({data: JSON.stringify(sample_packet)});
			deepEqual(db.all(), [sample_packet], "The received " +
				"packet should have been saved in the database");

			// Test that data ends up in the graph after
			// update_chart has fired.
			deepEqual([], con.chart.plot.getData());

			clearInterval(handle);
		});

		test("Controller creates Database with default aggregation", function()
		{
			var sock = new FakeSockJsClient();
			var con = new Client.Controller({
				socket: sock,
				start_update_timer: false
			});
			con.run();
			ok(con.database instanceof Client.Database);
			deepEqual(con.database.options.aggregate_by,
				[new Client.AggregateOnField('ip_src')],
				"Controller should have created a Database " +
				"which aggregates on ip_src by default");
		});

		function insert_packets(db, packets)
		{
			for (var i = 0; i < packets.length; i++)
			{
				db.insert(jquery.extend({}, sample_packet,
					packets[i]));
			}
		}

		test("Database aggregates packets", function()
		{
			var db = new Client.Database({
				aggregate_by: [new Client.AggregateOnField('ip_src')]
			});

			deepEqual(db.options.aggregate_by,
				[new Client.AggregateOnField('ip_src')],
				"Database should have used our custom " +
				"aggregation settings");

			insert_packets(db, [{}]);
			var results = db.aggregated();
			function extract_data(results)
			{
				var series_data = {};
				jquery.each(results, function(key, value) {
					series_data[key] = value.data;
				});
				return series_data;
			}

			var expected_results = {};
			expected_results[sample_packet.ip_src] = [
				[sample_packet.timeslot_start, 0],
				[sample_packet.timeslot_end, sample_packet.bytes]
			];
			deepEqual(extract_data(results), expected_results,
				"The inserted data should have been aggregated");

			// Write another packet to a different destination
			insert_packets(db, [{ip_dst: "1.2.3.4"}]);
			expected_results[sample_packet.ip_src] = [
				[sample_packet.timeslot_start, 0],
				[sample_packet.timeslot_end, sample_packet.bytes * 2]
			];
			results = db.aggregated();
			deepEqual(extract_data(results), expected_results,
				"The inserted data should have been aggregated");
		});

		/*
		 * When we receive no data from the server in a particular
		 * interval, that means that it didn't see any packets, so
		 * the series should be filled with a zero entry inbetween.
		 */
		test("Database fills gaps with zeroes", function()
		{
			var db = new Client.Database({
				aggregate_by: [new Client.AggregateOnField('ip_src')]
			});

			insert_packets(db, [
				{timeslot_start: 1200, timeslot_end: 1202, bytes: 200},
				{timeslot_start: 1202, timeslot_end: 1204, bytes: 300},
				// missing packets for 1204-1210
				// wide timeslot for some reason:
				{timeslot_start: 1210, timeslot_end: 1214, bytes: 400},
				{timeslot_start: 1214, timeslot_end: 1216, bytes: 100},
			]);

			var results = db.aggregated();
			function extract_data(results)
			{
				var series_data = {};
				jquery.each(results, function(key, value) {
					series_data[key] = value.data;
				});
				return series_data;
			}

			var expected_results = {};
			expected_results[sample_packet.ip_src] =
			[
				[1200, 0],
				[1202, 200 * 500],
				[1204, 300 * 500],
				[1206, 0],
				[1210, 0],
				[1214, 400 * 250],
				[1216, 100 * 500]
			];

			deepEqual(extract_data(results), expected_results,
				"The samples should have been normalised " +
				"into bytes/second, and the gap filled with " +
				"a zero record in the middle");
		});

		test("Graph ticks should be formatted with time", function()
		{
			var chart = new Client.Chart();
			var xaxis = chart.plot.getXAxes()[0];
			ok(xaxis.tickFormatter !== undefined);
			var exampleDate = new Date(1401896227000);
			equal(xaxis.tickFormatter(exampleDate, xaxis),
				"15:37:07");
		});

		/*
		 * When we receive no data from the server in a particular
		 * interval, that means that it didn't see any packets, so
		 * the series should be filled with a zero entry inbetween.
		 */
		test("Aggregate ", function() {
			var db = new Client.Database({
				aggregate_by: [new Client.AggregateOnField('ip_src')]
			});

			insert_packets(db, [
				{timeslot_start: 1200, timeslot_end: 1202, bytes: 200},
				{timeslot_start: 1202, timeslot_end: 1204, bytes: 300},
				// missing packets for 1204-1210
				// wide timeslot for some reason:
				{timeslot_start: 1210, timeslot_end: 1214, bytes: 400},
				{timeslot_start: 1214, timeslot_end: 1216, bytes: 100},
			]);

			var results = db.aggregated();
			function extract_data(results)
			{
				var series_data = {};
				jquery.each(results, function(key, value) {
					series_data[key] = value.data;
				});
				return series_data;
			}

			var expected_results = {};
			expected_results[sample_packet.ip_src] =
			[
				[1200, 0],
				[1202, 200 * 500],
				[1204, 300 * 500],
				[1206, 0],
				[1210, 0],
				[1214, 400 * 250],
				[1216, 100 * 500]
			];

			deepEqual(extract_data(results), expected_results,
				"The samples should have been normalised " +
				"into bytes/second, and the gap filled with " +
				"a zero record in the middle");
		});


		// Finally start QUnit.
		// QUnit.load();
		// QUnit.start();
	}
);
