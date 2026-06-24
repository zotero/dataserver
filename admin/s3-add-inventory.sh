#!/bin/sh
SOURCE_BUCKET="bucket1"
DESTINATION_BUCKET="bucket2"
INVENTORY_ID="inventory1"

aws s3api put-bucket-inventory-configuration \
--bucket $SOURCE_BUCKET \
--id $INVENTORY_ID \
--inventory-configuration \
'{
    "Schedule": {
        "Frequency": "Daily"
    },
    "IsEnabled": true,
    "Destination": {
        "S3BucketDestination": {
            "Bucket": "arn:aws:s3:::'$DESTINATION_BUCKET'",
            "Format": "CSV"
        }
    },
    "OptionalFields": ["Size","LastModifiedDate","ETag"],
    "IncludedObjectVersions": "Current",
    "Id": "'$INVENTORY_ID'"
}'