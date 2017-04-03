<?php

/*
    ***** BEGIN LICENSE BLOCK *****

    This file is part of the Zotero Data Server.

    Copyright © 2010 Center for History and New Media
                     George Mason University, Fairfax, Virginia, USA
                     http://zotero.org

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.

    ***** END LICENSE BLOCK *****
*/

class Z_RateLimiter
{
    protected $request_rate_limiter_lua = '
    local tokens_key = KEYS[1]
    local timestamp_key = KEYS[2]
    
    local rate = tonumber(ARGV[1])
    local capacity = tonumber(ARGV[2])
    local now = tonumber(ARGV[3])
    local requested = tonumber(ARGV[4])
    
    local fill_time = capacity/rate
    local ttl = math.floor(fill_time*2)
    
    local last_tokens = tonumber(redis.call("get", tokens_key))
    if last_tokens == nil then
      last_tokens = capacity
    end
    
    local last_refreshed = tonumber(redis.call("get", timestamp_key))
    if last_refreshed == nil then
      last_refreshed = 0
    end
    
    local delta = math.max(0, now-last_refreshed)
    local filled_tokens = math.min(capacity, last_tokens+(delta*rate))
    local allowed = filled_tokens >= requested
    local new_tokens = filled_tokens
    if allowed then
      new_tokens = filled_tokens - requested
    end
    
    redis.call("setex", tokens_key, ttl, new_tokens)
    redis.call("setex", timestamp_key, ttl, now)
    
    return { allowed, new_tokens }';

    public function __construct()
    {
        $this->redis = Z_Redis::get();
    }

    public function checkRequestRateLimiter($bucket, $rate, $burst)
    {
        $capacity = $burst * $rate;

        // Make a unique key per user.
        $prefix = 'request_rate_limiter:' . $bucket;

        $keys = [$prefix . '.tokens', $prefix . '.timestamp'];

        $args = [$rate, $capacity, time(), 1];

        try {
            $res = $this->redis->eval($this->request_rate_limiter_lua, array_merge($keys, $args), 2);
        } catch (Exception $e) {
            Z_Core::debug('Redis exception in Z_RateLimiter::checkRequestRateLimiter: '.$e->getMessage());
            return null;
        }

        return $res;
    }
}