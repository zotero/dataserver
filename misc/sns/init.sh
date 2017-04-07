REGION=us-east-1
S3_BUCKET_NAME=
HTTPS_ENDPOINT=
SNS_TOPIC_NAME=s3-object-created-$(echo $S3_BUCKET_NAME | tr '.' '-')

sns_topic_arn=$(aws sns create-topic --region "$REGION" --name "$SNS_TOPIC_NAME" --output text --query 'TopicArn')

echo SNS_TOPIC_ARN=$SNS_TOPIC_ARN

aws sns set-topic-attributes \
  --topic-arn "$SNS_TOPIC_ARN" \
  --attribute-name Policy \
  --attribute-value \
  '{
      "Version": "2008-10-17",
      "Id": "s3-publish-to-sns",
      "Statement": [{
              "Effect": "Allow",
              "Principal": { "AWS" : "*" },
              "Action": [ "SNS:Publish" ],
              "Resource": "'$SNS_TOPIC_ARN'",
              "Condition": {
                  "ArnLike": {
                      "aws:SourceArn": "arn:aws:s3:*:*:'$S3_BUCKET_NAME'"
                  }
              }
      }]
  }'

aws s3api put-bucket-notification \
  --region "$REGION" \
  --bucket "$S3_BUCKET_NAME" \
  --notification-configuration \
  '{
    "TopicConfiguration": {
      "Events": [ "s3:ObjectCreated:*" ],
      "Topic": "'$SNS_TOPIC_ARN'"
    }
  }'

aws sns subscribe --topic-arn "$SNS_TOPIC_ARN" --protocol https --notification-endpoint "$HTTPS_ENDPOINT"