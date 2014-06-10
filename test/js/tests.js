// RequireJS is configured by loading lib/require.config.js first.

// http://www.nathandavison.com/article/17/using-qunit-and-requirejs-to-build-modular-unit-tests

"use strict";

// http://www.jshint.com/docs/
/* jshint node: false, -W097 */
/* global QUnit, define, test, asyncTest, start, ok, equal, deepEqual */

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
			var handle = con.run();
			clearInterval(handle);
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

		asyncTest("send messages to Controller", function()
		{
			var sock = new FakeSockJsClient();
			var db = new Client.Database({
				filters: [
					new Client.Filter.Coalesce(['ip_src'])
				],
				labeller: new Client.Labeller('ip_src')
			});
			var con = new Client.Controller({
				socket: sock,
				database: db
			});
			var handle = con.run();
			var old_chart_redraw = con.chart.redraw;
			con.chart.redraw = function()
			{
				con.chart.redraw.fired++;
				return old_chart_redraw.apply(this);
			};
			con.chart.redraw.fired = 0;

			equal(con.database, db);
			sock.onmessage({data: JSON.stringify(sample_packet)});
			deepEqual(db.all(), [sample_packet], "The received " +
				"packet should have been saved in the database");

			// Test that data ends up in the graph after
			// update_chart has fired.
			deepEqual([], con.chart.plot.getData(),
				"The chart should have an empty data set to draw");
			equal(con.chart.redraw.fired, 0, "Chart should not " +
				"have been updated yet, apart from the " +
				"initial run before we patched update_chart");
			setTimeout(function() {
				start();
				clearInterval(handle);
				equal(1, con.chart.redraw.fired,
				"Chart should have been updated once, " +
				"since we patched update_chart");
				var chart_data = con.chart.plot.getData();
				equal(1, chart_data.length,
					"There should be one series in the Chart now");
				equal(chart_data[0].label, sample_packet.ip_src,
					"The series must have a label, or " +
					"it will not be drawn on the Plot");
			}, 1000);
		});

		test("Controller creates Database with default filters", function()
		{
			var sock = new FakeSockJsClient();
			var con = new Client.Controller({
				socket: sock,
				start_update_timer: false
			});
			con.run();
			ok(con.database instanceof Client.Database);
			deepEqual(con.database.options.filters,
				[
					new Client.Filter.LocalTime(),
					new Client.Filter.Coalesce(['ip_src'])
				],
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

		function extract_data(results)
		{
			var series_data = {};
			jquery.each(results, function(key, value) {
				series_data[key] = value.data;
			});
			return series_data;
		}

		test("Database aggregates packets", function()
		{
			var db = new Client.Database({
				filters: [new Client.Filter.Coalesce(['ip_src'])]
			});

			deepEqual(db.options.filters,
				[new Client.Filter.Coalesce(['ip_src'])],
				"Database should have used our custom " +
				"aggregation settings");

			insert_packets(db, [{}]);
			var results = db.aggregated();
			var expected_results = {};
			expected_results["ip_src=" + sample_packet.ip_src] = [
				[sample_packet.timeslot_start, 0],
				[sample_packet.timeslot_end, sample_packet.bytes]
			];
			deepEqual(extract_data(results), expected_results,
				"The inserted data should have been aggregated");

			// Write another packet to a different destination
			insert_packets(db, [{ip_dst: "1.2.3.4"}]);
			expected_results["ip_src=" + sample_packet.ip_src] = [
				[sample_packet.timeslot_start, 0],
				[sample_packet.timeslot_end, sample_packet.bytes * 2]
			];
			results = db.aggregated();
			deepEqual(extract_data(results), expected_results,
				"The inserted data should have been aggregated");
		});

		test("Packet filters", function()
		{
			var tz_offset = -(new Date().getTimezoneOffset() * 60 * 1000);

			deepEqual(
				new Client.Filter.LocalTime()
					.filter([sample_packet]),
				[jquery.extend({}, sample_packet,
					{timeslot_start: sample_packet.timeslot_start +
						tz_offset,
					timeslot_end: sample_packet.timeslot_end +
						tz_offset,
					cloned: true})]);

			deepEqual(
				new Client.Filter.Field({ip_src: sample_packet.ip_src})
					.filter([sample_packet]),
				[sample_packet]);

			deepEqual(
				new Client.Filter.Field({ip_src: sample_packet.ip_dst}, "Other")
					.filter([sample_packet]),
				[jquery.extend({}, sample_packet,
					{ip_src: "Other", cloned: true})]);

			var packet_without_directional_fields =
				jquery.extend({}, sample_packet);
			delete packet_without_directional_fields.ip_src;
			delete packet_without_directional_fields.ip_dst;
			delete packet_without_directional_fields.port_src;
			delete packet_without_directional_fields.port_dst;

			deepEqual(
				new Client.Filter.Direction([sample_packet.ip_src])
					.filter([sample_packet]),
				[jquery.extend({}, packet_without_directional_fields,
					{
						direction: 'out',
						ip_inside: sample_packet.ip_src,
						ip_outside: sample_packet.ip_dst,
						port_inside: sample_packet.port_src,
						port_outside: sample_packet.port_dst,
						cloned: true
					})]);

			deepEqual(
				new Client.Filter.Coalesce(['ip_src'])
					.filter([sample_packet]),
				[{
					ip_src: sample_packet.ip_src,
					bytes: sample_packet.bytes,
					packets: sample_packet.packets,
					flows: sample_packet.flows,
					timeslot_start: sample_packet.timeslot_start,
					timeslot_end: sample_packet.timeslot_end,
					cloned: true
				}]);
		});

		test("Database aggregates packets by direction", function()
		{
			var db = new Client.Database({
				filters: [
					new Client.Filter.Direction([sample_packet.ip_src]),
					new Client.Filter.Coalesce(['ip_inside', 'direction'])
				]
			});

			insert_packets(db, [
				{ // outbound
					ip_src: sample_packet.ip_src,
					ip_dst: sample_packet.ip_dst,
					bytes: 100
				},
				{ // inbound
					ip_src: sample_packet.ip_dst,
					ip_dst: sample_packet.ip_src,
					bytes: 200
				},
				{ // internal (ignored)
					ip_src: sample_packet.ip_src,
					ip_dst: sample_packet.ip_src,
					bytes: 300
				},
				{ // external (ignored)
					ip_src: sample_packet.ip_dst,
					ip_dst: sample_packet.ip_dst,
					bytes: 400
				}
			]);

			var actual_results = db.aggregated();
			var expected_results = {};
			expected_results[
				db.aggregation_key({
					ip_inside: sample_packet.ip_src,
					direction: "out"
				})] = [
				[sample_packet.timeslot_start, 0],
				[sample_packet.timeslot_end, 100]
			];
			expected_results[
				db.aggregation_key({
					ip_inside: sample_packet.ip_src,
					direction: "in"
				})] = [
				[sample_packet.timeslot_start, 0],
				[sample_packet.timeslot_end, -200]
			];
			deepEqual(extract_data(actual_results), expected_results,
				"The inserted data should have been " +
				"aggregated by direction relative to the " +
				"configured home network address.");
		});

		test("Aggregation combines all but top X results into " +
			"'Other' category", function()
		{
			var db = new Client.Database({
				filters: [new Client.Filter.Coalesce(['ip_src'])]
			});

			insert_packets(db, [
				{ip_src: '1.2.3.1', bytes: 1000},
				{ip_src: '1.2.3.2', bytes: 2000},
				{ip_src: '1.2.3.3', bytes: 3000},
				{ip_src: '1.2.3.4', bytes: 4000},
				{ip_src: '1.2.3.5', bytes: 5000},
				{ip_src: '1.2.3.6', bytes: 6000},
				{ip_src: '1.2.3.7', bytes: 7000},
				{ip_src: '1.2.3.8', bytes: 8000},
				{ip_src: '1.2.3.9', bytes: 9000},
				{ip_src: '1.2.3.10', bytes: 10000},
				{ip_src: '1.2.3.11', bytes: 11000},
				{ip_src: '1.2.3.12', bytes: 12000},
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

			var expected_results = {
				'ip_src=1.2.3.3': {bytes: 3000},
				'ip_src=1.2.3.4': {bytes: 4000},
				'ip_src=1.2.3.5': {bytes: 5000},
				'ip_src=1.2.3.6': {bytes: 6000},
				'ip_src=1.2.3.7': {bytes: 7000},
				'ip_src=1.2.3.8': {bytes: 8000},
				'ip_src=1.2.3.9': {bytes: 9000},
				'ip_src=1.2.3.10': {bytes: 10000},
				'ip_src=1.2.3.11': {bytes: 11000},
				'ip_src=1.2.3.12': {bytes: 12000},
				'Other': {bytes: 3000},
			};

			// convert format to match actual results
			for (var i in expected_results)
			{
				var bytes = expected_results[i].bytes;
				expected_results[i] = [
					[sample_packet.timeslot_start, 0],
					[sample_packet.timeslot_end, bytes]
				];
			}

			deepEqual(extract_data(results), expected_results,
				"The inserted data should have been " +
				"aggregated and the smallest rows combined " +
				"into the category 'Other'");
		});

		/*
		 * When we receive no data from the server in a particular
		 * interval, that means that it didn't see any packets, so
		 * the series should be filled with a zero entry inbetween.
		 */
		test("Database fills gaps with zeroes", function()
		{
			var db = new Client.Database({
				filters: [new Client.Filter.Coalesce(['ip_src'])]
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
			expected_results["ip_src=" + sample_packet.ip_src] =
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
				filters: [new Client.Filter.Coalesce(['ip_src'])]
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
			expected_results["ip_src=" + sample_packet.ip_src] =
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
