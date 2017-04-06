region=us-east-1
s3_bucket_name=zotero
http_endpoint=http://user:password@www.zotero.org/sns
sns_topic_name=s3-object-created-$(echo $s3_bucket_name | tr '.' '-')
sqs_queue_name=$sns_topic_name

sns_topic_arn=$(aws sns create-topic --region "$region" --name "$sns_topic_name" --output text --query 'TopicArn')

echo sns_topic_arn=$sns_topic_arn

aws sns set-topic-attributes \
  --topic-arn "$sns_topic_arn" \
  --attribute-name Policy \
  --attribute-value \
  '{
      "Version": "2008-10-17",
      "Id": "s3-publish-to-sns",
      "Statement": [{
              "Effect": "Allow",
              "Principal": { "AWS" : "*" },
              "Action": [ "SNS:Publish" ],
              "Resource": "'$sns_topic_arn'",
              "Condition": {
                  "ArnLike": {
                      "aws:SourceArn": "arn:aws:s3:*:*:'$s3_bucket_name'"
                  }
              }
      }]
  }'

aws s3api put-bucket-notification \
  --region "$region" \
  --bucket "$s3_bucket_name" \
  --notification-configuration \
  '{
    "TopicConfiguration": {
      "Events": [ "s3:ObjectCreated:*" ],
      "Topic": "'$sns_topic_arn'"
    }
  }'

aws sns subscribe --topic-arn "$sns_topic_arn" --protocol http --notification-endpoint "$http_endpoint"