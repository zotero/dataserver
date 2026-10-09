-- Run on master before deploying the getNextShard() change. New libraries are assigned to
-- shards on hosts with acceptNewLibraries=1.
SET SESSION lock_wait_timeout = 2;
ALTER TABLE `shardHosts` ADD `acceptNewLibraries` TINYINT UNSIGNED NOT NULL DEFAULT 0, ALGORITHM=INSTANT;

-- Before deploying, set acceptNewLibraries=1 on the shard host(s) that should receive new
-- libraries, or library creation will fail
