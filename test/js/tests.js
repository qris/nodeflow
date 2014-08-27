// RequireJS is configured by loading lib/require.config.js first.

// http://www.nathandavison.com/article/17/using-qunit-and-requirejs-to-build-modular-unit-tests

"use strict";

// http://www.jshint.com/docs/
/* jshint node: false, -W097 */
/* global window, define */

define(
	['Client', 'jquery', 'cjs!qunit', 'cjs!netmask', 'sinon'],
	function(Client, jquery, QUnit, netmask, sinon) {
		// http://api.qunitjs.com/QUnit.config/#entry-examples
		QUnit.config.autostart = false;
		QUnit.config.autorun = false;
		var test = QUnit.test;
		var asyncTest = QUnit.asyncTest;
		var ok = QUnit.ok;
		var equal = QUnit.equal;
		var deepEqual = QUnit.deepEqual;
		var fixtures = {};

		// Initialise the sandbox
		jquery.ajax({
			url: '../www/client.html',
			dataType: 'html',
			success: function(data, textStatus, jqXHR)
			{
				fixtures.html = jquery(data);
				fixtures.html = jquery(jquery.grep(fixtures.html,
					function(elementOfArray, indexInArray)
					{
						return (elementOfArray.nodeName != 'SCRIPT');
					}));

				// Finally start QUnit.
				QUnit.load();
				QUnit.start();
			},
		});

		QUnit.module("module", {
			setup: function(assert) {
				var fixture_container = jquery('#qunit-fixture');
				fixture_container.empty();
				fixture_container.append(fixtures.html.clone());
				window.location.replace('#');
			}
		});

		function FakeSockJsClient() {
		}

		function create_controller(options)
		{
			var sock = new FakeSockJsClient();
			options = jquery.extend({
				socket: sock,
				start_update_timer: false
			}, options);
			return new Client.Controller(options);
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

		asyncTest("send messages to Controller", function()
		{
			var db = new Client.Database({
				filters: [
					new Client.Filter.Coalesce(['ip_src'])
				],
				labeller: new Client.Labeller('ip_src')
			});
			var con = create_controller({
				database: db,
				start_update_timer: true
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
			con.sock.onmessage({
				type: 'message',
				data: JSON.stringify(['packet', sample_packet]),
			});
			deepEqual(db.all(), [sample_packet], "The received " +
				"packet should have been saved in the database");

			// Test that data ends up in the graph after
			// update_chart has fired.
			deepEqual([], con.chart.plot.getData(),
				"The chart should have an empty data set to draw");
			equal(con.chart.redraw.fired, 0, "Chart should not " +
				"have been updated yet, apart from the " +
				"initial run before we patched redraw()");
			setTimeout(function() {
				QUnit.start();
				clearInterval(handle);
				equal(1, con.chart.redraw.fired,
				"Chart should have been updated once, " +
				"since we patched redraw()");
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
			var con = create_controller({
				show_local_times: true
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

			var sample_packet_rfc1918 = jquery.extend({},
				sample_packet, {ip_src: "192.168.0.2"});

			var packet_without_directional_fields =
				jquery.extend({}, sample_packet_rfc1918);
			delete packet_without_directional_fields.ip_src;
			delete packet_without_directional_fields.ip_dst;
			delete packet_without_directional_fields.port_src;
			delete packet_without_directional_fields.port_dst;
			jquery.extend(packet_without_directional_fields, {
				direction: 'out',
				ip_inside: "192.168.0.2",
				ip_outside: sample_packet.ip_dst,
				port_inside: sample_packet.port_src,
				port_outside: sample_packet.port_dst,
				cloned: true
			});

			deepEqual(
				new Client.Filter.Direction(["192.168.0.2"])
					.filter([sample_packet_rfc1918]),
				[packet_without_directional_fields]);

			deepEqual(
				new Client.Filter.Direction(["192.168.0.0/24"])
					.filter([sample_packet_rfc1918]),
				[packet_without_directional_fields]);

			deepEqual(
				new Client.Filter.Direction(["192.168.1.0/24"])
					.filter([sample_packet_rfc1918]),
				[]);

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

			var key_out = db.aggregation_key({
				ip_inside: sample_packet.ip_src,
				direction: "out"
			});
			expected_results[key_out] = [
				[sample_packet.timeslot_start, 0],
				[sample_packet.timeslot_end, 100]
			];

			var key_in = db.aggregation_key({
				ip_inside: sample_packet.ip_src,
				direction: "in"
			});
			expected_results[key_in] = [
				[sample_packet.timeslot_start, 0],
				[sample_packet.timeslot_end, -200]
			];

			ok(key_out != key_in, "in and out direction series " +
				"keys should be different");

			deepEqual(extract_data(actual_results), expected_results,
				"The inserted data should have been " +
				"aggregated by direction relative to the " +
				"configured home network address.");

			equal(actual_results[key_in].opposite_direction,
				actual_results[key_out], "Series with opposite " +
				"directions should be linked together");
			equal(actual_results[key_out].opposite_direction,
				actual_results[key_in], "Series with opposite " +
				"directions should be linked together");
		});

		function convert_to_rate(packet)
		{
			return packet.bytes * 1000 /
				(packet.timeslot_end - packet.timeslot_start);
		}

		function convert_to_kbps(packet)
		{
			return convert_to_rate(packet) * 8 / 1000;
		}

		test("Controller updates the data table as data is added", function()
		{
			var home_network = "86.30.0.0/16";
			ok(new netmask.Netmask(home_network).contains(sample_packet.ip_src),
				"This test will fail unless the sample " +
				"packet is contained in the home network");

			var con = create_controller({
				home_networks: [home_network]
			});
			con.run();

			// An outbound packet (upload)
			con.database.insert(sample_packet);
			con.update_chart_now();

			// Find the data table and extract results from it
			var table = con.table.element;
			equal(1, table.length);

			function assertElementText(selector, expected_contents)
			{
				// Convert all expected contents to text,
				// to match what we'll actually find in HTML.
				for (var i = 0; i < expected_contents.length; i++)
				{
					expected_contents[i] = "" + expected_contents[i];
				}

				var text = [];
				jquery(selector, table).each(function(i, element)
					{
						text[i] = jquery(element).text();
					});
				deepEqual(text, expected_contents);
			}
			
			assertElementText("th", ["Local IP", "Totals (MB)",
				"Average (kb/s)", "Down", "Up", "Down", "Up"]);

			assertElementText("td", [sample_packet.ip_src,
				"", sample_packet.bytes,
				"", convert_to_kbps(sample_packet)]);

			// An inbound packet (download)
			var inbound_packet = jquery.extend({}, sample_packet, {
				ip_src: sample_packet.ip_dst,
				ip_dst: sample_packet.ip_src,
				bytes: 4095
			});
			insert_packets(con.database, [inbound_packet]);
			con.update_chart_now();

			assertElementText("td", [
				sample_packet.ip_src,
				inbound_packet.bytes,
				sample_packet.bytes,
				convert_to_kbps(inbound_packet),
				convert_to_kbps(sample_packet)]);

			// Insert a packet that only has an inbound flow
			var inbound_only_dst = "86.30.0.2";
			ok(new netmask.Netmask(home_network).contains(inbound_only_dst),
				"This test will fail unless the sample " +
				"packet is contained in the home network");
			var inbound_only_packet = jquery.extend({},
				sample_packet, {
					ip_src: sample_packet.ip_dst,
					ip_dst: inbound_only_dst,
					bytes: 2001
				});
			insert_packets(con.database, [inbound_only_packet]);
			con.update_chart_now();

			// Check that its table row is rendered properly
			assertElementText("td", [sample_packet.ip_src,
				inbound_packet.bytes,
				sample_packet.bytes,
				convert_to_kbps(inbound_packet),
				convert_to_kbps(sample_packet),
				inbound_only_dst,
				"2001", "",
				convert_to_kbps(inbound_only_packet), ""
				]);
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
		test("Aggregation should fill gaps between flow records " +
			"with zeroes ", function() {
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

		function assert_filters(controller, networks, aggregate,
			labeller, message, time_window)
		{
			deepEqual(controller.home_networks, networks,
				"controller state: " + message);

			var aggregate_with_direction = [aggregate];
			if (networks !== undefined && networks.length > 0)
			{
				aggregate_with_direction.push('direction');
			}

			if (networks !== undefined && networks.length > 0)
			{
				deepEqual(controller.database.options.filters,
					[
						new Client.Filter.Direction(networks),
						new Client.Filter.Coalesce(aggregate_with_direction),
					],
					"filters: " + message);
			}
			else
			{
				deepEqual(controller.database.options.filters,
					[new Client.Filter.Coalesce(aggregate_with_direction)],
					"filters: " + message);
			}

			deepEqual(controller.database.labeller,
				new Client.Labeller(labeller),
				"labeller: " + message);

			deepEqual(jquery('.netgraph-home-networks input').map(
				function(index, domElement)
				{
					return domElement.value;
				}).get(),
				networks || [],
				"form fields: " + message);

			deepEqual(jquery('.netgraph-home-networks input').map(
				function(index, domElement)
				{
					return jquery(domElement).data('old-value');
				}).get(),
				networks || [],
				"recorded old values of form fields: " + message);

			var home_networks_param =
				(networks === undefined ? '' :
				 ("home_networks=" + networks.join(',') + ';'));
			time_window = time_window || controller.time_window;

			equal(window.location.hash, '#' + home_networks_param +
				'aggregate=' + aggregate + ";" +
				'time_window=' + time_window,
				"window location hash: " + message);
		}

		// This is kind of dodgy. Why not? It makes sense to keep the
		// location hash in sync with the current configuration.
		test("Controller should not assume default values for " +
			"location hash parameters, except aggregate", function() {
			var con = create_controller();
			con.run();
			equal(window.location.hash, "#aggregate=ip_src;" +
				"time_window=" + con.time_window);
		});

		test("Controller should initialise itself and form fields " +
			"from hash parameters", function() {
			window.location.hash = '#home_networks=192.168.0.0/24;' +
				'aggregate=ip_dst';
			var con = create_controller();
			con.run();

			assert_filters(con, ["192.168.0.0/24"], 'ip_dst', 'ip_dst',
				"Controller should have initialised itself " +
				"from hash parameters");

			var add_network_text = jquery('input#netgraph-home-network-add[type=text]');
			equal(1, add_network_text.length,
				"should be an empty text field to add a new " +
				"home network");
			add_network_text.val('192.168.2.0/23');
			var add_network_button = jquery('button[name=netgraph-home-network-add-button]');
			equal(1, add_network_button.length,
				"should be a button to add a new home network");
			add_network_button.trigger('click');

			assert_filters(con, ['192.168.0.0/24', '192.168.2.0/23'],
				'ip_dst', 'ip_dst', "Controller should have " +
				"updated everything for newly added network");

			// test remove button - the first one.
			var remove_network_button =
				jquery('.netgraph-home-network-remove');
			remove_network_button.trigger('click');

			assert_filters(con, ['192.168.2.0/23'],
				'ip_dst', 'ip_dst', "Controller should have " +
				"updated everything when network was removed");

			// test changing text box value
			jquery('.netgraph-home-network-addr').val('192.168.3.0/24').trigger('change');
			assert_filters(con, ['192.168.3.0/24'],
				'ip_dst', 'ip_dst', "Controller should have " +
				"updated everything for modified network");

			// test that changes in controller are reflected in UI
			// and location target, and vice versa.
			// test that removing all networks switches back to
			// nondirectional mode, and vice versa.
		});

		asyncTest("Controller should initialize itself using " +
			"get_network_interfaces RPC to server if no hash " +
			"parameters are supplied", function() {

			var sock = new FakeSockJsClient();
			var messages = [];
			sock.send = sinon.spy(function(message) {
				messages.push(message);
				var props = JSON.parse(message);
				equal(props[1], 'get_network_interfaces');
				if (props[1] == 'get_network_interfaces') {
					this.onmessage({data: JSON.stringify([
						'response', props[0], props[1],
						{"lo":[{"address":"127.0.0.1","family":"IPv4","internal":true},{"address":"::1","family":"IPv6","internal":true}],
						"wlan0":[{"address":"192.168.2.142","family":"IPv4","internal":false},{"address":"fe80::234:ffff:aaaa:bbbb","family":"IPv6","internal":false}]}
						])
					});
				}
				else
				{
					throw new Error("Unknown command: " + props[1]);
				}
			});
			var con = create_controller({socket: sock});
			Client.Controller.sequence = 1;
			con.run();

			setTimeout(function()
				{
					ok(sock.send.calledOnce);
					deepEqual(messages, [JSON.stringify([1, 'get_network_interfaces'])],
						"client should have sent a single RPC request, " +
						"get_network_interfaces");
					assert_filters(con, ['127.0.0.1', '192.168.2.142'],
						'ip_inside', 'ip_inside',
						"Controller should have called " +
						"get_network_interfaces and " +
						"initialised itself");
					QUnit.start();
				}, 2);
		});

		test("Controller should select the right aggregation option " +
			"from its hash parameters", function() {
			var con = create_controller({
				// Provide a param_string to disable configuration by RPC
				param_string: "aggregate=port_src"
			});
			con.run();

			assert_filters(con, undefined, 'port_src', 'port_src',
				"Controller should have initialised itself " +
				"from param string");
			equal('port_src', jquery('.netgraph-aggregate-select').val(),
				"Controller should have selected the select " +
				"box item corresponding to the current " +
				"aggregation");
		});

		test("User can change column to aggregate", function() {
			var con = create_controller({
				// Provide a param_string to disable configuration by RPC
				param_string: "home_networks="
			});
			con.run();

			assert_filters(con, [], 'ip_src', 'ip_src',
				"Controller should have initialised itself " +
				"from param string");
			deepEqual(['ip_src', 'ip_dst', 'port_src', 'port_dst'],
				con.aggregate_options, "Controller should " +
				"allow aggregation by source and dest port " +
				"and IP when no home networks configured");
			deepEqual(con.aggregate_options,
				jquery('.netgraph-aggregate-select option').map(
				function(index, domElement)
				{
					return domElement.value;
				}).get(),
				"Controller should allow user to configure " +
				"aggregation by source and dest port and IP " +
				"when no home networks configured");
			var aggregate_select = jquery(".netgraph-aggregate-select");
			equal(aggregate_select.val(), 'ip_src', "Aggregation " +
				"by ip_src should be selected by default");
			aggregate_select.val('ip_dst');
			aggregate_select.trigger('change');

			assert_filters(con, [], 'ip_dst', 'ip_dst',
				"Controller should have updated itself to " +
				"match new selected aggregation");
		});

		function assertTimeSetup(con, time_window, time_before_change)
		{
			QUnit.strictEqual(undefined, con.time_start);
			equal(time_window, con.time_window);

			var chart_options = con.chart.update_x_axis();
			ok(chart_options.now >= time_before_change,
				"update_x_axis() should have returned the " +
				"current timestamp (>= " + time_before_change + ")");

			var time_after = Date.now();
			ok(chart_options.now <= time_after,
				"update_x_axis() should have returned the " +
				"current timestamp (<= " + time_after + ")");
			equal(chart_options.max, chart_options.now,
				"update_x_axis() should have set the chart " +
				"maximum to the current time unless " +
				"overridden by chart options");
			equal(chart_options.min,
				chart_options.max - (time_window * 1000),
				"update_x_axis() should have set the chart " +
				"minimum to " + time_window + " seconds ago, " +
				"unless overridden by chart options");

			var axis_opts = con.chart.plot.getXAxes()[0].options;
			ok(axis_opts.max >= time_before_change,
				"update_x_axis() max should have been " +
				"applied to the chart's X axis");
			ok(axis_opts.max <= time_after,
				"update_x_axis() max should have been " +
				"applied to the chart's X axis");
			equal(axis_opts.min, axis_opts.max - (time_window * 1000),
				"update_x_axis() min should have been " +
				"applied to the chart's X axis");
		}

		test("Time parameters are initialised to defaults", function() {
			var con = create_controller();
			var time_before = Date.now();
			con.run();
			assertTimeSetup(con, 60, time_before);
		});

		test("Time parameters are initialised using hash params", function() {
			var con = create_controller({
				param_string: "time_window=70"
			});
			var time_before = Date.now();
			con.run();
			equal(70, con.chart.options.window_seconds);
			assertTimeSetup(con, 70, time_before);
		});

		test("User can change time parameters using GUI", function() {
			var con = create_controller();
			var time_before = Date.now();
			con.run();

			// test changing text box value
			jquery('input[name=netgraph_time_window_input]').val('80').trigger('change');
			equal(80, con.time_window);
			equal(80, con.chart.options.window_seconds);
			assertTimeSetup(con, 80, time_before);
			equal(window.location.hash,
				"#aggregate=ip_src;time_window=80",
				"Hash parameters should have been updated " +
				"when user changed the time window");
		});
	}
);
