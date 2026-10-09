-- shardHosts.ssl has been unused since SSL shard support was removed (32c4fe56, 2011), and
-- shardHostReplicas.secure was never used
SET SESSION lock_wait_timeout = 2;
ALTER TABLE `shardHosts` DROP COLUMN `ssl`, ALGORITHM=INSTANT;
ALTER TABLE `shardHostReplicas` DROP COLUMN `secure`, ALGORITHM=INSTANT;
