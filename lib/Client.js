/*
 * nodeflow/lib/Client.js
 * Based on https://github.com/sockjs/sockjs-client#example
 * Copyright (c) 2014 Chris Wilson
 */

define(['sockjs', 'jquery', 'flot', 'flot_time'],
	function(SockJS, jquery, flot, flot_time)
	{
		'use strict';
		var module = {};

		var Counter = module.Counter = function(name, value, label)
		{
			if (!this) throw Error("Should only be called with new!");
			this.name = name;
			this.value = value;
			this.label = label;
		};

		var Serie = module.Serie = function(name, index, derive)
		{
			if (!this) throw Error("Should only be called with new!");
			this.name = name;
			this.index = index;
			this.derive = derive;
			this.data = [];
			this.total = 0;
			this.last_value = Number.NaN;
			this.last_timestamp = Number.NaN;
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
			this.last_timestamp = value;

			this.data.push([timestamp, relative_value]);
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
		Serie.prototype.add_sample = function(timestamp_start,
			timestamp_end, bytes_transferred)
		{
			var last_sample = this.last_sample;

			if (last_sample &&
				last_sample.timestamp_end != timestamp_start)
			{
				// There is a missing flow record, so insert
				// a zero one period after the end of the
				// previous one, and another zero at the
				// beginning of this one, to ensure that the
				// graph is flat zero during all that time.
				this.add_point(last_sample.timestamp_end +
					(last_sample.timestamp_end - last_sample.timestamp_start),
					0);
				this.add_point(timestamp_start, 0);
			}
			else if (!last_sample)
			{
				// Add a single zero to make the graph slope
				// upwards from the correct place on the X axis
				this.add_point(timestamp_start, 0);
			}
			else
			{
				// No missing flow record, assume the flow
				// continues smoothly
			}

			var elapsed_ms = timestamp_end - timestamp_start;
			var transfer_rate = bytes_transferred * 1000 / elapsed_ms; // bytes/sec
			this.add_point(timestamp_end, transfer_rate);

			this.last_sample = {
				timestamp_start: timestamp_start,
				timestamp_end: timestamp_end,
				bytes_transferred: bytes_transferred
			};
		};

		var AggregateOnField = module.AggregateOnField = function(field_name)
		{
			if (!this) throw Error("Should only be called with new!");
			this.field_name = field_name;
		};

		AggregateOnField.prototype.aggregate = function(packet)
		{
			return [packet[this.field_name]];
		};

		var Database = module.Database = function(options)
		{
			if (!this) throw Error("Should only be called with new!");
			this.packets_by_arrival = [];
			this.packets_by_time = {};
			this.options = jquery.extend({
				filter: [],
				aggregate_by: [],
			}, options);
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

		Database.prototype.all = function(packet)
		{
			return this.packets_by_arrival.slice();
		};

		Database.prototype.filter = function(packet)
		{
			var filters = this.options.filter;
			var packet_out = jquery.extend({}, packet); // clone

			for (var field_name in filters)
			{
				if (filters.hasOwnProperty(field_name))
				{
					var filter = filters[field_name];
					var value = packet_out[field_name];
					var passed = filter.passes(field_name,
						value, packet_out);
					if (!passed)
					{
						return undefined;
					}
				}
			}

			// All filters passed, so return the modified packet
			return packet_out;
		};

		Database.prototype.aggregation_key = function(packet)
		{
			var values = [];

			jquery.each(this.options.aggregate_by,
				function(i, aggregator)
				{
					var new_values = aggregator.aggregate(packet);
					values = values.concat(new_values);
				});

			return values.join();
		};

		Database.prototype.timestamp = function(packet)
		{
			return packet.timestamp_start;
		};

		Database.prototype.value = function(packet)
		{
			return packet.bytes;
		};

		Database.prototype.aggregated = function()
		{
			var options = this.aggregation;
			var series = {};
			var packets = this.packets_by_arrival;

			// First loop over all the packets and add together
			// the ones with the same timeslot_start and
			// aggregation key.
			var slot_keys = {};
			var slots = [];
			var keys, key;

			for (var i = 0; i < packets.length; i++)
			{
				var packet = packets[i];
				packet = this.filter(packet);
				if (packet === undefined)
				{
					continue;
				}

				var slot = packet.timeslot_start;
				keys = slot_keys[slot];
				if (keys === undefined)
				{
					keys = slot_keys[slot] = {};
					slots.push(slot);
				}

				key = this.aggregation_key(packet);
				if (key in keys)
				{
					var old_aggregate = keys[key];
					console.assert(packet.timeslot_start ==
						old_aggregate.timeslot_start);
					console.assert(packet.timeslot_end ==
						old_aggregate.timeslot_end);
					old_aggregate.bytes += packet.bytes;
				}
				else
				{
					var new_aggregate = keys[key] = {};
					new_aggregate.bytes = packet.bytes;
					new_aggregate.timeslot_start = packet.timeslot_start;
					new_aggregate.timeslot_end = packet.timeslot_end;
				}
			}

			slots.sort();

			for (i = 0; i < slots.length; i++)
			{
				keys = slot_keys[slots[i]];
				for (key in keys)
				{
					if (!keys.hasOwnProperty(key))
					{
						continue;
					}
					var aggregate = keys[key];

					var serie = series[key];
					if (serie === undefined)
					{
						serie = series[key] = new Serie(key,
							series.length, false);
					}

					serie.add_sample(aggregate.timeslot_start,
						aggregate.timeslot_end,
						aggregate.bytes);
				}
			}

			return series;
		};

		var Chart = module.Chart = function(options)
		{
			if (!this) throw Error("Should only be called with new!");
			this.options = jquery.extend({
				graph: jquery('#netgraph-graph'),
				window_seconds: 60,
				series: {
					lines: { show: true },
					points: { show: false },
					shadowSize: 0 // drawing is faster without shadows
				},
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

		/*
		Chart.prototype.format_date = function(val, axis)
		{
			var d = new Date(val);
			return d.getUTCHours()
		};

		Chart.prototype.get_series = function(name)
		{
			var series = this.series_by_name[series_name];
			if (series === undefined)
			{
				series = this.series_by_name[name] = {
					label: name
				};
			}
			return series;
		};

		Chart.prototype.add_data = function(new_data)
		{
			for (var series_name in new_data)
			{
				var series = this.get_series(series_name);
				series.data.append(new_data);
			}
		*/

		Chart.prototype.redraw = function()
		{
			this.plot.setData(this.data);
			var plot_options = this.plot.getXAxes()[0].options;
			jquery.extend(plot_options, this.update_x_axis());
			// since the axes do change, we do need to call plot.setupGrid()
			this.plot.setupGrid();
			this.plot.draw();
		};

		var Controller = module.Controller = function(options)
		{
			if (!this) throw Error("Should only be called with new!");
			this.options = jquery.extend({
				url: 'http://localhost:8080/socks',
				prefix: 'NodeFlow.Client',
				scroll_interval: 50,
				update_interval: 1000,
				start_update_timer: true
			}, options);
		};

		Controller.prototype.run = function()
		{
			var controller = this;

			this.sock = this.options.socket || new SockJS(this.options.url);
			this.database = this.options.database ||
				new Database({
					aggregate_by: [new AggregateOnField('ip_src')],
				});
			this.chart = this.options.chart || new Chart();

			this.sock.onopen = function() {
				console.log('open');
			};
			this.sock.onmessage = function(e) {
				// console.log('message', e.data);
				controller.database.insert(JSON.parse(e.data));
			};
			this.sock.onclose = function() {
				console.log('close');
			};

			if (this.options.start_update_timer)
			{
				return setInterval(this.update_chart.bind(this),
					this.options.scroll_interval);
			}
			else
			{
				// Just update once
				this.update_chart();
			}
		};

		Controller.prototype.update_chart = function()
		{
			var now = Date.now();
			if (this.last_update === undefined ||
				this.last_update + this.options.update_interval < now)
			{
				var all_data = this.database.aggregated();
				var all_series = [];
				for (var serie_name in all_data)
				{
					if (all_data.hasOwnProperty(serie_name))
					{
						all_series.push(all_data[serie_name]);
					}
				}
				this.chart.data = all_series;
				this.chart.redraw();
				this.last_update = now;
			}
			else
			{
				this.chart.redraw();
			}
		};

		return module;
	}
);
