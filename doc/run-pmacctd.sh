#!/bin/sh
sudo `dirname $0`/../../pmacct-1.5.0rc3-chris/src/pmacctd -f `dirname $0`/pmacctd-amqp.conf -i wlan0 -d
