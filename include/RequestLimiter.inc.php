<?php
/*
	This code is based on Stripe request limiter:
	https://stripe.com/blog/rate-limiters
*/

// Notice: If we are using lua scripts, we shouldn't use any PHP serializer
// for this redis connection, because inside lua scripts they can't be deserialized,
// therefore we can get unexpected behaviour

class Z_RequestLimiter {
	// Lua script is from https://gist.github.com/ptarjan/e38f45f2dfe601419ca3af937fff574d
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
	
	// Lua script is from https://gist.github.com/ptarjan/e38f45f2dfe601419ca3af937fff574d
	protected $concurrent_requests_limiter_lua = '
	local key = KEYS[1]
	
	local capacity = tonumber(ARGV[1])
	local timestamp = tonumber(ARGV[2])
	local id = ARGV[3]
	
	local count = redis.call("zcard", key)
	local allowed = count < capacity
	
	if allowed then
		redis.call("zadd", key, timestamp, id)
	end
	
	return { allowed, count }';
	
	public function __construct() {
		$this->redis = Z_Redis::get();
		// SHA1 can be hardcoded to prevent calculating it every time
		$this->request_rate_limiter_lua_sha1 = sha1($this->request_rate_limiter_lua);
		$this->concurrent_requests_limiter_lua_sha1 = sha1($this->concurrent_requests_limiter_lua);
	}
	
	/**
	 * Check if the request is allowed depending on the current rate
	 * Rate and capacity parameters allows to have flexible rate limits.
	 *
	 * rate - request accumulation rate per second (can be below 1)
	 * capacity - how many requests it can accumulate
	 *
	 * capacity=10, rate=1 means 10 request burst with 1 request per second rate
	 * capacity=100, rate=0.5 means 100 request burst with 1 request per two seconds rate
	 *
	 * @param $params - bucket, capacity, rate
	 * @return bool|null - returns true if request is allowed
	 */
	public function checkBucketRate($params) {
		$bucket = $params['bucket'];
		$capacity = $params['capacity'];
		$rate = $params['rate'];
		$prefix = 'rrl:' . $bucket;
		$keys = [$prefix . '.tk', $prefix . '.ts'];
		$args = [$rate, $capacity, time(), 1];
		
		try {
			$res = $this->redis->evalSha($this->request_rate_limiter_lua_sha1, array_merge($keys, $args), count($keys));
			if (!$res) {
				Z_Core::logError('Executing evalSha failed in Z_RequestLimiter::limitRate, maybe sha1 is wrong');
				
				$res = $this->redis->eval($this->request_rate_limiter_lua, array_merge($keys, $args), count($keys));
				if (!$res) {
					Z_Core::logError('Executing eval failed in Z_RequestLimiter::limitRate');
					return null;
				}
			}
		} catch (Exception $e) {
			Z_Core::logError('Redis exception in Z_RequestLimiter::limitRate: ' . $e->getMessage());
			return null;
		}
		
		return !!$res[0];
	}
	
	/**
	 * Limit concurrent requests per bucket.
	 * This function must be started before the actual API request logic.
	 * finishConcurrent must be called each time after finishing the API request logic.
	 *
	 * @param $params - bucket (userid or key), ttl (seconds), limit (requests per second)
	 * @return string|null - return id if the request is allowed
	 */
	public function beginConcurrent($params) {
		$ttl = $params['ttl']; //seconds how long the token will be kept (if not removed by finishConcurrent)
		$capacity = $params['capacity'];
		$timestamp = time();
		$id = Zotero_Utilities::randomString(5, 'mixed');
		$key = 'crl:' . $params['bucket'];
		
		try {
			// Tokens with expired TTL are removed if the same bucket is hit again,
			// otherwise they will be kept forever. For something like userID it's not
			// a problem, but randomly generated ids can fill whole memory
			$this->redis->zRemRangeByScore($key, '-inf', $timestamp - $ttl);
			$keys = [$key];
			$args = [$capacity, $timestamp, $id];
			$res = $this->redis->evalSha($this->concurrent_requests_limiter_lua_sha1, array_merge($keys, $args), count($keys));
			if (!$res) {
				Z_Core::logError('Executing evalSha failed in Z_RequestLimiter::beginConcurrent, maybe sha1 is wrong');
				
				$res = $this->redis->eval($this->concurrent_requests_limiter_lua, array_merge($keys, $args), count($keys));
				if (!$res) {
					Z_Core::logError('Executing eval failed in Z_RequestLimiter::beginConcurrent');
					return null;
				}
			}
		} catch (Exception $e) {
			Z_Core::logError('Redis error in Z_RequestLimiter::beginConcurrent: ' . $e->getMessage());
			return null;
		}
		
		return $res[0] ? $id : null;
	}
	
	/**
	 * Must be called every time when beginConcurrent is called
	 * @param $bucket
	 * @param $id
	 */
	public function finishConcurrent($bucket, $id) {
		$key = 'crl:' . $bucket;
		try {
			$removed = $this->redis->zRem($key, $id);
			if (!$removed) {
				Z_Core::logError('Failed to remove key Z_RequestLimiter::finishConcurrent');
			}
		} catch (Exception $e) {
			Z_Core::logError('Redis error in Z_RequestLimiter::finishConcurrent: ' . $e->getMessage());
		}
	}
}
