#!/bin/sh

# Env vars
export APACHE_RUN_USER=www-data
export APACHE_RUN_GROUP=www-data
export APACHE_LOCK_DIR=/var/lock/apache2
export APACHE_PID_FILE=/var/run/apache2/apache2.pid
export APACHE_RUN_DIR=/var/run/apache2
export APACHE_LOG_DIR=/var/log/apache2

ROOT_DIR=/var/www/zotero

chmod 777 "$ROOT_DIR/tmp"
cd "$ROOT_DIR"

aws s3 mb s3://${S3_BUCKET}
aws s3 mb s3://${S3_BUCKET_FULLTEXT}
aws --endpoint-url $LOCALSTACK_SERVER_URL sns create-topic --name zotero

# Start rinetd
# (see docs here: https://raw.githubusercontent.com/samhocevar/rinetd/refs/heads/main/index.html)
# Most entries in the configuration file are forwarding rules. 
# The format of a forwarding rule is as follows:
#   bindaddress bindport connectaddress connectport [options...]
# echo "0.0.0.0		$S3_SERVER_PORT		minio		$S3_SERVER_PORT" > /etc/rinetd.conf
# TODO: Figure out how to generalize this
echo "0.0.0.0		9000		minio		9000" > /etc/rinetd.conf
/etc/init.d/rinetd start

# # Upgrade database
# /init-mysql.sh

# Start Apache2
exec apache2 -DNO_DETACH -k start