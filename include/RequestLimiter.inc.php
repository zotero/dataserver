<?php
/*
	This code is based on Stripe request limiter:
	https://stripe.com/blog/rate-limiters
*/

// Notice: If we are using lua scripts, we shouldn't use any PHP serializer
// for the same redis connection, because data can't be deserialized inside lua script

class Z_RequestLimiter {
	protected static $redis;
	protected static $rateLimiterLuaSHA1;
	protected static $concurrencyLimiterLuaSHA1;
	// Lua script is from https://gist.github.com/ptarjan/e38f45f2dfe601419ca3af937fff574d
	protected static $rateLimiterLua = '
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
	protected static $concurrencyLimiterLua = '
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
	
	public static function init() {
		self::$redis = Z_Redis::get();
		if (!self::$redis) return false;
		// Todo: Hardcode SHA1 to prevent calculating it on each request
		self::$rateLimiterLuaSHA1 = sha1(self::$rateLimiterLua);
		self::$concurrencyLimiterLuaSHA1 = sha1(self::$concurrencyLimiterLua);
		return true;
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
	public static function checkBucketRate($params) {
		$bucket = $params['bucket'];
		$capacity = $params['capacity'];
		$rate = $params['rate'];
		$prefix = 'rrl:' . $bucket;
		$keys = [$prefix . '.tk', $prefix . '.ts'];
		$args = [$rate, $capacity, time(), 1];
		
		try {
			$res = self::$redis->evalSha(self::$rateLimiterLuaSHA1, array_merge($keys, $args), count($keys));
			if (!$res) {
				Z_Core::logError('Executing evalSha failed in Z_RequestLimiter::limitRate, maybe sha1 is wrong');
				
				$res = self::$redis->eval(self::$rateLimiterLua, array_merge($keys, $args), count($keys));
				if (!$res) {
					Z_Core::logError('Executing eval failed in Z_RequestLimiter::limitRate');
					return null;
				}
			}
		}
		catch (Exception $e) {
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
	public static function beginConcurrent($params) {
		$ttl = $params['ttl']; //seconds how long the token will be kept (if not removed by finishConcurrent)
		$capacity = $params['capacity'];
		$timestamp = time();
		$id = Zotero_Utilities::randomString(5, 'mixed');
		$key = 'crl:' . $params['bucket'];
		
		try {
			// Tokens with expired TTL are removed if the same bucket is hit again,
			// otherwise they will be kept forever. For something like userID it's not
			// a problem, but randomly generated ids can fill whole memory
			self::$redis->zRemRangeByScore($key, '-inf', $timestamp - $ttl);
			$keys = [$key];
			$args = [$capacity, $timestamp, $id];
			$res = self::$redis->evalSha(self::$concurrencyLimiterLuaSHA1, array_merge($keys, $args), count($keys));
			if (!$res) {
				Z_Core::logError('Executing evalSha failed in Z_RequestLimiter::beginConcurrent, maybe sha1 is wrong');
				
				$res = self::$redis->eval(self::$concurrencyLimiterLua, array_merge($keys, $args), count($keys));
				if (!$res) {
					Z_Core::logError('Executing eval failed in Z_RequestLimiter::beginConcurrent');
					return null;
				}
			}
		}
		catch (Exception $e) {
			Z_Core::logError('Redis error in Z_RequestLimiter::beginConcurrent: ' . $e->getMessage());
			return null;
		}
		
		return $res[0] ? $id : null;
	}
	
	/**
	 * Must be called every time when the script finishes concurrent
	 * request, otherwise element in the Redis sorted set can stay forever
	 * @param $bucket
	 * @param $id
	 */
	public static function finishConcurrent($bucket, $id) {
		$key = 'crl:' . $bucket;
		try {
			$removed = self::$redis->zRem($key, $id);
			if (!$removed) {
				Z_Core::logError('Failed to remove key Z_RequestLimiter::finishConcurrent');
			}
		}
		catch (Exception $e) {
			Z_Core::logError('Redis error in Z_RequestLimiter::finishConcurrent: ' . $e->getMessage());
		}
	}
}
