/*
 * nodeflow/lib/Client.js
 * Based on https://github.com/sockjs/sockjs-client#example
 * Copyright (c) 2014 Chris Wilson
 */

define(['sockjs', 'jquery', 'flot', 'flot_time', 'handlebars', 'cjs!netmask',
	'promise/promise'],
	function(SockJS, jquery, flot, flot_time, Handlebars, netmask, es6_promise)
	{
		var Promise = es6_promise.Promise;

		'use strict';
		var module = {};

		var Counter = module.Counter = function(name, value, label)
		{
			if (!this) throw new Error("Should only be called with new!");
			this.name = name;
			this.value = value;
			this.label = label;
		};

		module.opposite_direction = function(direction)
		{
			if (direction == 'in')
			{
				return 'out';
			}
			else if (direction == 'out')
			{
				return 'in';
			}
			else
			{
				throw Error("Unknown direction: " + direction);
			}
		};

		var Serie = module.Serie = function(name, index, derive, unique,
			all_series, get_aggregation_key)
		{
			if (!this) throw new Error("Should only be called with new!");
			this.name = name;
			this.index = index;
			this.derive = derive;
			this.unique = unique;
			this.data = [];
			this.total = 0;
			this.last_value = Number.NaN;
			this.last_timestamp = Number.NaN;

			if (unique.direction)
			{
				// Try to find the opposite direction series,
				// and link them together through
				// this.opposite_direction

				var opposite_name = module.opposite_direction(unique.direction);
				var criteria = jquery.extend({},
					unique, {direction: opposite_name});
				var opposite_key = get_aggregation_key(criteria);
				var opposite_serie = all_series[opposite_key];

				if (opposite_serie)
				{
					opposite_serie.opposite_direction = this;
				}

				// Maybe null, and that's OK. If our partner
				// is created later, we'll be updated by it.
				this.opposite_direction = opposite_serie;
			}
		};

		Serie.prototype.add_point = function(timestamp, value)
		{
			var relative_value;

			if (this.derive)
			{
				var absolute_value = value;
				
				if (this.last_value === Number.NaN)
				{
					relative_value = Number.NaN;
				}
				else
				{
					relative_value = absolute_value -
						this.last_value;
				}
			}
			else
			{
				relative_value = value;
			}

			this.last_value = value;
			this.last_timestamp = timestamp;
			this.total += relative_value;

			this.data.push([timestamp, relative_value]);
		};

		Serie.prototype.average_kbps = function()
		{
			var elapsed = this.data[this.data.length-1][0] -
				this.data[0][0];
			// elapsed is in milliseconds, we want to convert bps
			// to kbps, these two factors of 1000 cancel out.
			return this.total * 8 / elapsed;
		};

		/**
		 * The logic for plotting bandwidth use graphs is this:
		 * we want the y value at time t to reflect as accurately as
		 * possible the bandwidth used by those flows during (t-dt, t),
		 * so that the Y axis is comparable to the total capacity of
		 * the line. But flows don't use bandwidth instantaneously,
		 * only over time, and we have a limited sampling resolution.
		 *
		 * We also want the line to go to zero when we know a flow wasn't
		 * transmitting (because there's no accounting record(s) for that
		 * period, to avoid the illusion that it was transmitting because
		 * the line is joined up. And we want to avoid unnecessary
		 * discontinuities which make the graph harder to read. And we
		 * want the area under the graph to be approximately equal to
		 * the amount of data transferred.
		 *
		 * So we do it like this, which is not 100% faithful but it's
		 * easy to calculate and render, and to interpret once you know
		 * how.
		 *
		 * We allocate all bandwidth used to the end of the time
		 * period. If there's a gap following it, then we know that the
		 * flow wasn't transmitting during this gap, so we write a zero
		 * one period (dt) after the end of the current one. We start
		 * from zero again if there's a gap, otherwise we continue the
		 * current line.
		 *     .       .         .       .   .                     _____
		 *    /|      /|\       / \      A   A          ___       /|   |\
		 *   / |     / | \     /   \    / \ / \     ___|   |     / |   | \
		 *  /  |    /  |  \   /     \  /   V   \   |   |   |    /  |   |  \
		 * +---+---+---+---+-F-+---+-I-+---+---+---+---+---+---+---+---+---+
		 * A   B   C   D   E   G   H   J   K   L   M   N   O   P   Q   R   S
		 *
		 * A single flow record will be drawn like (CDE), not like (ABC)
		 * with a sudden drop to zero.
		 *
		 * We prefer CDE over AB because AB has the wrong integral,
		 * CDE has the correct integral, but implies that the flow was
		 * transmitting during time DE, when we know that it was not
		 * (there would have been a flow record for that period if it
		 * was). You should therefore ignore this tailoff always.
		 *
		 * We could shift the time bin left (FGHI), which is more
		 * time-accurate, but it also implies traffic during FG and HI,
		 * which there wasn't, so it doesn't solve that problem. It's
		 * also hard to calculate if the data points are not evenly
		 * spaced.
		 *
		 * We could draw a sharp spike entirely within the time interval
		 * (JK), but when the flow continues over time (JKL) the graph
		 * is sharply discontinuous and thus noisy (compare with PQRS).
		 * It also implies a burstiness that we have no evidence for,
		 * and if we double the height to make the area match, then
		 * we could exceed the actual capacity of the link in the total
		 * heights of bars for one timestamp.
		 *
		 * (MNO) is the most accurate representation of what we actually
		 * know (for two flow records), but it doesn't look as good/smooth.
		 * Flot can draw it by setting bars: true, but then we need to
		 * assign the data to the beginning of each slot instead of the end.
		 *
		 * So basically, we'll draw CDE, you admire the pretty graphs
		 * and ignore the data transfer rate implied by the last
		 * segment, and everyone's happy.
		 */
		Serie.prototype.add_sample = function(aggregate)
		{
			console.assert(aggregate instanceof Aggregate);
			var last_sample = this.last_sample;

			if (last_sample && aggregate.timeslot_start <
				last_sample.timeslot_end)
			{
				throw new Error("samples must be added in time order!");
			}

			if (last_sample &&
				last_sample.timeslot_end != aggregate.timeslot_start)
			{
				// There is a missing flow record, so insert
				// a zero one period after the end of the
				// previous one, and another zero at the
				// beginning of this one, to ensure that the
				// graph is flat zero during all that time.
				this.add_point(last_sample.timeslot_end +
					(last_sample.timeslot_end - last_sample.timeslot_start),
					0);
				this.add_point(aggregate.timeslot_start, 0);
			}
			else if (!last_sample)
			{
				// Add a single zero to make the graph slope
				// upwards from the correct place on the X axis
				this.add_point(aggregate.timeslot_start, 0);
			}
			else
			{
				// No missing flow record, assume the flow
				// continues smoothly
			}

			var elapsed_ms = aggregate.timeslot_end -
				aggregate.timeslot_start;
			var transfer_rate = aggregate.bytes * 1000 / elapsed_ms; // bytes/sec

			if (this.unique.direction == 'in')
			{
				// Invert the graph so that inbound (download)
				// traffic is downwards (negative).
				transfer_rate = -transfer_rate;
			}

			this.add_point(aggregate.timeslot_end, transfer_rate);

			this.last_sample = aggregate;
		};

		var Filter = module.Filter = function() { };
		Filter.KEEP_FIELDS = ['bytes', 'packets', 'flows',
			'timeslot_start', 'timeslot_end', 'cloned'];

		Filter.prototype.clone_once = function(packet)
		{
			if (packet.cloned === undefined)
			{
				return jquery.extend({}, packet, {cloned: true});
			}
			else
			{
				return packet;
			}
		};

		Filter.LocalTime = function()
		{
			this.tz_offset = -(new Date().getTimezoneOffset() * 60 * 1000);
		};

		Filter.LocalTime.prototype = new Filter();

		Filter.LocalTime.prototype.filter = function(packets)
		{
			var packets_out = [];
			for (var i = 0; i < packets.length; i++)
			{
				var packet = this.clone_once(packets[i]);
				packet.timeslot_start += this.tz_offset;
				packet.timeslot_end   += this.tz_offset;
				packets_out.push(packet);
			}
			return packets_out;
		};

		Filter.Field = function(field_values, other_value)
		{
			this.field_values = field_values;
			this.other_value = other_value;
		};

		Filter.Field.prototype = new Filter();

		Filter.Field.prototype.filter = function(packets)
		{
			var packets_out = [];
			for (var i = 0; i < packets.length; i++)
			{
				var packet = packets[i];

				for (var field_name in this.field_values)
				{
					if (this.field_values.hasOwnProperty(field_name))
					{
						var field_value = this.field_values[field_name];
						if (packet[field_name] != field_value)
						{
							packet = this.clone_once(packet);
							packet[field_name] = this.other_value;
						}
					}
				}

				packets_out.push(packet);
			}
			return packets_out;
		};

		Filter.Direction = function(home_networks)
		{
			if (!this) throw new Error("Should only be called with new!");

			this.home_networks = [];
			for (var i = 0; i < home_networks.length; i++)
			{
				this.home_networks.push(new netmask.Netmask(home_networks[i]));
			}
		};

		Filter.Direction.prototype = new Filter();

		Filter.Direction.prototype.adjust = function(packet, direction)
		{
			if (direction == 'out')
			{
				packet = this.clone_once(packet);
				packet.ip_inside = packet.ip_src;
				packet.ip_outside = packet.ip_dst;
				packet.port_inside = packet.port_src;
				packet.port_outside = packet.port_dst;
			}
			else if (direction == 'in')
			{
				packet = this.clone_once(packet);
				packet.ip_inside = packet.ip_dst;
				packet.ip_outside = packet.ip_src;
				packet.port_inside = packet.port_dst;
				packet.port_outside = packet.port_src;
			}
			else
			{
				throw Error("Unknown direction: " + direction);
			}

			packet.direction = direction;
			delete packet.ip_src;
			delete packet.ip_dst;
			delete packet.port_src;
			delete packet.port_dst;
			return packet;
		};

		Filter.Direction.prototype.filter = function(packets)
		{
			var packets_out = [];
			for (var i = 0; i < packets.length; i++)
			{
				var packet = packets[i];

				for (var j = 0; j < this.home_networks.length; j++)
				{
					var network = this.home_networks[j];
					var src = network.contains(packet.ip_src);
					var dst = network.contains(packet.ip_dst);

					if (src && !dst)
					{
						packets_out.push(this.adjust(packet, 'out'));
					}
					else if (dst && !src)
					{
						packets_out.push(this.adjust(packet, 'in'));
					}
					// else: it's internal or external, don't count it.
				}
			}

			return packets_out;
		};

		Filter.Coalesce = function(keep_fields)
		{
			if (!this) throw new Error("Should only be called with new!");
			this.keep_fields = keep_fields;
		};

		Filter.Coalesce.prototype = new Filter();

		Filter.Coalesce.prototype.filter = function(packets)
		{
			var packets_out = [];
			var packet_in, packet_out;

			function copy_field(j, field_name)
			{
				packet_out[field_name] = packet_in[field_name];
			}

			for (var i = 0; i < packets.length; i++)
			{
				packet_in = this.clone_once(packets[i]);
				packet_out = {};

				for (var j = 0; j < this.keep_fields.length; j++)
				{
					var keep_field_name = this.keep_fields[j];
					packet_out[keep_field_name] =
						packet_in[keep_field_name];
				}

				jquery.each(Filter.KEEP_FIELDS, copy_field);
				packets_out.push(packet_out);
			}

			return packets_out;
		};

		var Database = module.Database = function(options)
		{
			if (!this) throw new Error("Should only be called with new!");
			this.packets_by_arrival = [];
			this.packets_by_time = {};
			this.label_for_key = {};
			this.options = jquery.extend({
				filters: [],
				num_promoted_keys: 10,
				other_key_name: "Other",
			}, options);
		};

		Database.prototype.set_filters = function(filters)
		{
			this.options.filters = filters;
		};

		Database.prototype.set_labeller = function(labeller)
		{
			this.labeller = labeller;
		};

		Database.prototype.insert = function(packet)
		{
			this.packets_by_arrival.push(packet);

			var slot = this.packets_by_time[packet.timestamp];

			if (slot === undefined)
			{
				slot = this.packets_by_time[packet.timestamp] = [];
			}

			slot.push(packet);
		};

		Database.prototype.all = function()
		{
			return this.packets_by_arrival.slice();
		};

		Database.prototype.unique_fields = function(packet)
		{
			var unique = {};

			jquery.each(packet,
				function(field_name, field_value)
				{
					if (Filter.KEEP_FIELDS.indexOf(field_name) >= 0)
					{
						// These fields cannot be part
						// of the aggregation key
					}
					else
					{
						unique[field_name] = field_value;
					}
				});

			return unique;
		};

		Database.prototype.aggregation_key = function(packet)
		{
			var values = [];

			jquery.each(this.unique_fields(packet),
				function(field_name, field_value)
				{
					values.push(field_name + "=" +
						field_value);
				});

			return values.join();
		};

		var Aggregate = module.Aggregate = function(name, packet, unique_fields)
		{
			this.bytes = packet.bytes;
			this.timeslot_start = packet.timeslot_start;
			this.timeslot_end = packet.timeslot_end;
			this.unique = unique_fields;
		};

		Aggregate.prototype.add = function(packet)
		{
			console.assert(packet.timeslot_start ==
				this.timeslot_start);
			console.assert(packet.timeslot_end ==
				this.timeslot_end);
			this.bytes += packet.bytes;
		};

		module.filter = function(packets, filters)
		{
			for (var i = 0; i < filters.length; i++)
			{
				var filter = filters[i];
				packets = filter.filter(packets);
			}

			return packets;
		};

		Database.prototype.get_included_packets = function()
		{
			return module.filter(this.packets_by_arrival,
				this.options.filters);
		};

		Database.prototype.get_promoted_keys = function(packets)
		{
			// First loop over all the packets and add together
			// the ones with the same timeslot_start and
			// aggregation key.
			var key, key_totals = {};

			for (var i = 0; i < packets.length; i++)
			{
				var packet = packets[i];
				key = this.aggregation_key(packet);
				var value = packet.bytes;

				if (key in key_totals)
				{
					key_totals[key] += value;
				}
				else
				{
					key_totals[key] = value;
				}
			}

			// Loop over key_totals converting to an array that
			// we can sort.
			var key_total_array = [];
			for (key in key_totals)
			{
				key_total_array.push([key, key_totals[key]]);
			}

			// Then sort it
			key_total_array.sort(function(a, b) {
				return b[1] - a[1];
			});

			// Convert back to an object
			var keys_promoted = {};
			for (i = 0; i < this.options.num_promoted_keys &&
				i < key_total_array.length; i++)
			{
				key = key_total_array[i][0];
				keys_promoted[key] = true;
			}

			return keys_promoted;
		};

		Database.prototype.aggregate_into_slots = function(packets,
			promoted_keys)
		{
			// Then loop over all the packets and add together the
			// ones with the same timeslot_start and aggregation
			// key (or "Other" if the key is not promoted)
			var slot_keys = {};
			var slots = [];
			var other_key = this.options.other_key_name;


			for (var i = 0; i < packets.length; i++)
			{
				var packet = packets[i];

				var slot = packet.timeslot_start;
				var keys = slot_keys[slot];
				if (keys === undefined)
				{
					keys = slot_keys[slot] = {};
					slots.push({slot: slot, keys: keys});
				}

				var key = this.aggregation_key(packet);
				if (!(key in promoted_keys))
				{
					key = other_key;
				}

				if (key in keys)
				{
					var old_aggregate = keys[key];
					old_aggregate.add(packet);
				}
				else
				{
					var new_aggregate = keys[key] =
						new Aggregate(key, packet,
							this.unique_fields(packet));
				}

				if (!(key in this.label_for_key))
				{
					if (this.labeller)
					{
						this.label_for_key[key] =
							this.labeller.label(packet);
					}
					else
					{
						this.label_for_key[key] = key;
					}
				}
			}

			return slots;
		};

		Database.prototype.add_slots_to_series = function(slots)
		{
			var series = {};

			for (var i = 0; i < slots.length; i++)
			{
				var keys = slots[i].keys;
				for (var key in keys)
				{
					if (!keys.hasOwnProperty(key))
					{
						continue;
					}

					var serie = series[key];
					var aggregate = keys[key];

					if (serie === undefined)
					{
						serie = series[key] = new Serie(key,
							series.length, false,
							aggregate.unique, series,
							this.aggregation_key.bind(this));
					}

					serie.add_sample(aggregate);
				}
			}

			return series;
		};

		Database.prototype.aggregated = function()
		{
			// Apply the packet filter just once
			var packets = this.get_included_packets();

			// First find out which keys are to be promoted.
			var promoted_keys = this.get_promoted_keys(packets);

			// Then loop over all the packets and add together the
			// ones with the same timeslot_start and aggregation
			// key (or "Other" if the key is not promoted)
			var slots = this.aggregate_into_slots(packets,
				promoted_keys);

			// Sort slots into order before adding their contents
			// to series, because it must be done in correct order.
			slots.sort(function(a, b) {
				return a.slot - b.slot;
			});

			return this.add_slots_to_series(slots);
		};

		var Chart = module.Chart = function(options)
		{
			if (!this) throw new Error("Should only be called with new!");
			this.options = jquery.extend({
				graph: jquery('#netgraph-graph'),
				window_seconds: 60,
				series: {
					lines: { show: true },
					points: { show: false },
					shadowSize: 0 // drawing is faster without shadows
				},
				filters: [],
				xaxis: { mode: "time" },
				yaxis: { min: 0 },
				grid: {
					backgroundColor: { colors: ["#fff", "#eee"] }
				},
			}, options);

			this.data = [];
			this.series_by_name = {};
			this.series_visible = this.options.series_visible || [];

			var chart_options = jquery.extend({}, this.options); // clone
			chart_options.xaxis = this.update_x_axis();
			this.plot = jquery.plot(this.options.graph, this.data,
				chart_options);
		};

		Chart.prototype.update_x_axis = function()
		{
			var chart_xaxis = {
				mode: this.options.xaxis.mode || "time",
				max: this.options.xaxis.max || Date.now(),
				timeformat: this.options.time_format || "%H:%M:%S",
				tickFormatter: this.options.date_formatter
			};
			chart_xaxis.min = chart_xaxis.max -
				(this.options.window_seconds * 1000);
			return chart_xaxis;
		};

		Chart.prototype.update = function(series)
		{
			series = module.filter(series, this.options.filters);
			this.plot.setData(series);
			this.redraw();
		};

		Chart.prototype.redraw = function()
		{
			var plot_options = this.plot.getXAxes()[0].options;
			jquery.extend(plot_options, this.update_x_axis());
			// since the axes do change, we do need to call plot.setupGrid()
			this.plot.setupGrid();
			this.plot.draw();
		};

		module.series_to_row_nondirectional = function(series, index,
			key_field)
		{
			var serie = series[index];

			return {
				key: serie.unique[key_field],
				total: serie.total,
				rate: serie.average_kbps()
			};
		};

		/**
		 * This function receives all series so that it can extract
		 * both the outbound and inbound serie from the list if it
		 * needs to.
		 */
		module.series_to_row_directional = function(series, index,
			key_field)
		{
			console.assert(key_field, "we should be told which " +
				"field to use as the key");

			var serie_in = series[index];
			var serie_out = serie_in.opposite_direction;

			if (serie_in.unique.direction == 'in' && serie_out)
			{
				// Good, we have flows in both directions
				return {
					key: serie_in.unique[key_field],
					total_down: -serie_in.total,
					total_up: serie_out.total,
					rate_down: -serie_in.average_kbps(),
					rate_up: serie_out.average_kbps()
				};
			}
			else if (serie_in.unique.direction == 'in' && serie_out === undefined)
			{
				return {
					key: serie_in.unique[key_field],
					total_down: -serie_in.total,
					total_up: "",
					rate_down: -serie_in.average_kbps(),
					rate_up: ""
				};
			}

			console.assert(serie_in.unique.direction == 'out',
				"If it's not inbound then it should be outbound");

			if (serie_out === undefined)
			{
				// This is an outbound flow with no
				// corresponding inbound, so we haven't
				// included it as part of the corresponding
				// inbound, so render it now.
				return {
					key: serie_in.unique[key_field],
					total_down: "",
					total_up: serie_in.total,
					rate_down: "",
					rate_up: serie_in.average_kbps()
				};
			}
			else
			{
				// This is an outbound flow with a corresponding
				// inbound, and the output row will be generated
				// for that inbound, so don't generate one here.
				return null;
			}
		};

		var DataTable = module.DataTable = function(options)
		{
			if (!this) throw new Error("Should only be called with new!");

			this.options = jquery.extend({
				series_to_row_data: null,
				css_class: 'netgraph-table',
				row_template: "<tr>\n" +
					"<td class='netgraph-key'>{{key}}</td>\n" +
					"<td class='netgraph-total-down'>{{total_down}}</td>\n" +
					"<td class='netgraph-total-up'>{{total_up}}</td>\n" +
					"<td class='netgraph-rate-down'>{{rate_down}}</td>\n" +
					"<td class='netgraph-rate-up'>{{rate_up}}</td>\n" +
					"</tr>\n"
			}, options);

			this.options.header = "<table class='" +
				this.options.css_class + "'>\n" +
				"<thead>\n" +
				"<tr>\n" +
				"<th rowspan='2'>Local IP</th>\n" +
				"<th colspan='2'>Totals (MB)</th>\n" +
				"<th colspan='2'>Average (kb/s)</th>\n" +
				"</tr>\n" +
				"<tr>\n" +
				"<th>Down</th>\n" +
				"<th>Up</th>\n" +
				"<th>Down</th>\n" +
				"<th>Up</th>\n" +
				"</tr>\n" +
				"</thead>\n" +
				"<tbody></tbody>\n" +
				"</table>\n";
			this.row_template_compiled =
				Handlebars.compile(this.options.row_template);

			var table = this.element = this.options.table ||
				jquery('#netgraph-table');
			table.empty();
			table.append(this.options.header);
			this.tbody = jquery('tbody', table);
		};

		DataTable.prototype.set_series_to_row_data = function(series_to_row_data)
		{
			this.options.series_to_row_data = series_to_row_data;
		};

		DataTable.prototype.set_key_field = function(key_field)
		{
			this.options.key_field = key_field;
		};

		DataTable.prototype.update = function(series)
		{
			console.assert(this.options.key_field, "we should " +
				"know which field is the key field by now");

			this.tbody.empty();
			for (var i = 0; i < series.length; i++)
			{
				var row_data = this.options.series_to_row_data(series, i,
					this.options.key_field);
				if (row_data !== null)
				{
					var row_html = this.row_template_compiled(row_data);
					this.tbody.append(row_html);
				}
			}
		};

		var Controller = module.Controller = function(options)
		{
			if (!this) throw new Error("Should only be called with new!");
			this.options = jquery.extend({
				url: 'http://localhost:8080/socks',
				prefix: 'NodeFlow.Client',
				scroll_interval: 1000, // 50,
				update_interval: 1000,
				start_update_timer: true,
				param_string: window.location.hash.substring(1),
				home_networks: [],
				home_network_template: "<li>" +
					"<input class='netgraph-home-network-addr' " +
					"value='{{netmask}}' /> " +
					"<button class='netgraph-home-network-remove'" +
					">Remove</button></li>\n",
				home_network_container:
					jQuery('.netgraph-home-networks')
			}, options);
			this.rpc_queue = {};
		};

		Controller.prototype.parse_home_networks = function(value)
		{
			var networks = value.split(",");
			return {home_networks: networks};
		};

		Controller.prototype.parse_aggregate = function(value)
		{
			var fields = value.split(",");
			return {aggregate: fields};
		};

		Controller.prototype.parse_param = function(name, value)
		{
			if (name == 'home_networks')
			{
				return this.parse_home_networks(value);
			}
			else if (name == 'aggregate')
			{
				return this.parse_aggregate(value);
			}
		};

		Controller.prototype.parse_params = function(param_string)
		{
			var params = param_string.split(";");
			var options_out = {};

			for (var i = 0; i < params.length; i++)
			{
				var param = params[i];
				var name_and_value = param.split("=", 2);
				jquery.extend(options_out,
					this.parse_param(name_and_value[0],
						name_and_value[1]));
			}

			return options_out;
		};

		Controller.prototype.update_location_hash = function()
		{
			var params = [];
			var addrs = [];
			var network_list = this.home_networks;

			for (var i = 0; i < network_list.length; i++)
			{
				addrs.push(network_list[i].toString());
			}

			if (addrs.length > 0)
			{
				params.push("home_networks=" + addrs.join(","));
			}

			console.assert(this.aggregate,
				"aggregate should be set to something by " +
				"this point");
			params.push("aggregate=" + this.aggregate.join(","));

			window.location.replace('#' + params.join(";"));
		};

		Controller.prototype.set_home_networks = function(home_networks)
		{
			this.home_networks = home_networks;
			var table_options;

			var filters = [];
			if (this.options.show_local_times)
			{
				filters.push(new Filter.LocalTime());
			}

			if (home_networks.length > 0)
			{
				filters.push(new Filter.Direction(home_networks));
				this.aggregate = this.options.aggregate ||
					['ip_inside', 'direction'];

				table_options = {
					series_to_row_data: module.series_to_row_directional
				};
			}
			else
			{
				this.aggregate = ['ip_src'];

				table_options = {
					series_to_row_data: module.series_to_row_nondirectional
				};
			}

			// TODO FIXME support multiple fields in Labeller
			var label_field = this.options.label_fields ||
				this.aggregate[0];
			this.labeller = this.options.labeller ||
				new module.Labeller(label_field);

			filters.push(new Filter.Coalesce(this.aggregate));
			this.database.set_filters(filters);
			this.database.set_labeller(this.labeller);
			this.options.home_network_container.empty();

			for (var i = 0; i < home_networks.length; i++)
			{
				this._add_home_network(home_networks[i],
					this.options.home_network_container);
			}

			this.table.set_series_to_row_data(table_options.series_to_row_data);
			// TODO FIXME remove the "key_field" hack
			this.table.set_key_field(label_field);
			this.update_location_hash();
		};

		Controller.sequence = 1;

		Controller.prototype.rpc = function(command, args)
		{
			var controller = this;

			var promise = new Promise(function(resolve, reject)
			{
				var seq = Controller.sequence++;
				var message = args.slice(0);
				message.unshift(seq, command);

				controller.rpc_queue[seq] = [command,
					function rpc_handler(args)
					{
						resolve.apply(resolve, args);
					}];
				controller.sock.send(JSON.stringify(message));
			});
			promise.then(undefined, function(e) {
				console.log("RPC call failed: " + e + "\n" + e.stack);
			});
			return promise;
		};

		Controller.prototype.on_rpc_response = function(message)
		{
			var type = message[0];
			if (type == 'error')
			{
				console.log("Received error message from " +
					"RPC server: " + JSON.stringify(message));
				return;
			}

			var seq = message[1];
			if (!(seq in this.rpc_queue))
			{
				console.log("Unexpected RPC response: " +
					JSON.stringify(message));
				return;
			}

			var entry = this.rpc_queue[seq];
			var command = message[2];
			if (entry[0] != command)
			{
				console.log("RPC response mismatch: " +
					"expected " + command + " response " +
					"but received " + JSON.stringify(message));
				return;
			}

			delete this.rpc_queue[seq];
			// Pass the remaining args to the handler, which
			// will use them to resolve the promise.
			entry[1](message.slice(3));
		};

		Controller.prototype.run = function()
		{
			var controller = this;

			this.sock = this.options.socket || new SockJS(this.options.url);

			// Allow hash parameters to override defaults passed in
			// to the constructor. If you don't want this, pass an
			// empty string as the "param_string" option, which
			// overrides the use of window.location.hash.
			jquery.extend(this.options, this.parse_params(this.options.param_string));

			this.home_network_template_compiled =
				Handlebars.compile(this.options.home_network_template);

			this.database = this.options.database || new Database({});
			this.table = this.options.table || new DataTable(
				jquery.extend({},
					this.options.table_options || {}));
			this.set_home_networks(this.options.home_networks);

			jquery('button[name=netgraph-home-network-add-button]').click(
				function(e) {
					var netmask_text = jquery('#netgraph-home-network-add');
					var netmask_obj = new netmask.Netmask(netmask_text.val());
					var network_list = controller.home_networks;
					network_list.push(netmask_obj.toString());
					controller.set_home_networks(network_list);
				});

			this.chart = this.options.chart || new Chart();

			this.sock.onopen = function() {
				console.log('SockJS websocket open');
			};

			this.sock.onmessage = function(message) {
				// console.log('message', e.data);
				var data = JSON.parse(message.data);
				if (data[0] == 'packet')
				{
					controller.database.insert(data[1]);
				}
				else if (data[0] == 'response' ||
					data[0] == 'error')
				{
					controller.on_rpc_response(data);
				}
				else
				{
					console.log("Unknown RPC message: " +
						message);
				}
			};

			this.sock.onclose = function() {
				console.log('SockJS websocket closed');
			};

			// Need to set socket event handlers before calling any
			// RPC methods, in case they return a message really
			// quickly, as our tests do!

			if (this.options.home_networks.length == 0 &&
				!this.options.param_string)
			{
				this.rpc('get_network_interfaces', []).then(
					function(result)
					{
						var home_networks = [];
						for (var interface_name in result)
						{
							var addrs = result[interface_name];
							for (var i = 0; i < addrs.length; i++)
							{
								var addr = addrs[i];
								if (addr.family == "IPv4")
								{
									home_networks.push(addr.address);
								}
							}
						}
						controller.set_home_networks(home_networks);
					},
					function(e)
					{
						throw e;
					});
			}

			this.update_chart();

			if (this.options.start_update_timer)
			{
				return setInterval(this.update_chart.bind(this),
					this.options.scroll_interval);
			}
		};

		Controller.prototype._add_home_network = function(netmask_object,
			target_query)
		{
			var html = this.home_network_template_compiled({
				netmask: netmask_object.toString()
			});
			var query = jQuery(html);
			query.appendTo(target_query);
			var controller = this;
			query.find('input').data("old-value",
				netmask_object.toString());
			query.on('change', 'input', function(event) {
				controller._update_home_network(event, query);
			});
			query.on('click', 'button', function(event) {
				controller._remove_home_network(event, query);
			});
			return query;
		};

		Controller.prototype._update_home_network = function(event,
			target_query)
		{
			var input = jquery('input', target_query);
			var new_home_networks = jquery.map(
				this.home_networks,
				function(network, i)
				{
					// Find the network that string-matches
					// the text box that goes with this button,
					// and replace it with the new value;
					if (network.toString() == input.data('old-value'))
					{
						return input.val(); // new value
					}
					else
					{
						return network;
					}
				});
			this.set_home_networks(new_home_networks);
		};

		Controller.prototype._remove_home_network = function(event,
			target_query)
		{
			var input = jquery('input', target_query);
			var new_home_networks = jquery.grep(
				this.home_networks,
				function(network, i)
				{
					// Remove the network that string-matches
					// the text box that goes with this button.
					return network.toString() != input.val();
				});
			this.set_home_networks(new_home_networks);
		};

		// TODO FIXME support multiple fields in Labeller
		module.Labeller = function(field_name)
		{
			this.field_name = field_name;
		};

		module.Labeller.prototype.label = function(aggregate)
		{
			return aggregate[this.field_name];
		};

		Controller.prototype.update_chart = function()
		{
			var now = Date.now();
			if (this.last_update === undefined ||
				this.last_update + this.options.update_interval < now)
			{
				this.update_chart_now();
				this.last_update = now;
			}
			else
			{
				this.chart.redraw();
			}
		};

		Controller.prototype.update_chart_now = function()
		{
			var all_data = this.database.aggregated();
			var all_series = [];
			for (var serie_name in all_data)
			{
				if (all_data.hasOwnProperty(serie_name))
				{
					all_series.push(jquery.extend({
						label: this.database.label_for_key[serie_name]
					}, all_data[serie_name]));
				}
			}
			this.chart.update(all_series);
			this.table.update(all_series);
		};

		return module;
	}
);
