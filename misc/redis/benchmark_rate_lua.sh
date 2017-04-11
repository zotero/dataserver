#!/bin/sh

add=`redis-cli --eval rate.lua | sed 's/.*f_\([0-9a-z]\{40\}\).*/\1/'`

args="2 ratetest:__rand_int__ ratetest:__rand_int__ 1 2000 1 1"

redis-benchmark -c 50 -n 2000000 -r 100000000 evalsha $add $args

redis-cli --raw keys "ratetest:*" | xargs redis-cli del