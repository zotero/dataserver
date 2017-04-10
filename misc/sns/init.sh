REGION=us-east-1
S3_BUCKET_NAME=
HTTPS_ENDPOINT=
SNS_TOPIC_NAME=s3-object-created-$(echo $S3_BUCKET_NAME | tr '.' '-')

SNS_TOPIC_ARN=$(aws sns create-topic --region "$REGION" --name "$SNS_TOPIC_NAME" --output text --query 'TopicArn')

echo $SNS_TOPIC_ARN

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

aws s3api put-bucket-notification-configuration \
  --region "$REGION" \
  --bucket "$S3_BUCKET_NAME" \
  --notification-configuration \
  '{
    "TopicConfigurations": [
      {
        "TopicArn": "'$SNS_TOPIC_ARN'",
        "Events": [
          "s3:ObjectCreated:*"
        ]
      }
    ]
  }'

# After this command SNS immediately sends confirmation request to the endpoint
aws sns subscribe --topic-arn "$SNS_TOPIC_ARN" --protocol http --notification-endpoint "$HTTPS_ENDPOINT"

# It's better to configure delivery policy manually.
# To use 'set-subscription-attributes' a subscription id is required,
# which is created only after endpoint confirmation.
# List all subscriptions with:
# aws sns list-subscriptions
# then use the next command with the required subscription id
#aws sns set-subscription-attributes \
#  --subscription-arn "arn:aws:sns:us-east-1:818018491371:s3-object-created-zoterotest:7d2f0d76-4dce-41ca-abbd-ff288b9713cf" \
#  --attribute-name "DeliveryPolicy" \
#  --attribute-value \
#   '{
#     "healthyRetryPolicy": {
#      "minDelayTarget": 20,
#      "maxDelayTarget": 20,
#      "numRetries": 3,
#      "numMaxDelayRetries": 0,
#      "numNoDelayRetries": 0,
#      "numMinDelayRetries": 0,
#      "backoffFunction": "linear"
#     }
#   }'
