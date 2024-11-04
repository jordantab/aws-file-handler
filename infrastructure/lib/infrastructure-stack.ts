import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { LambdaRestApi } from "aws-cdk-lib/aws-apigateway";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as eventsources from "aws-cdk-lib/aws-lambda-event-sources";
import * as iam from "aws-cdk-lib/aws-iam";

export class InfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const metadataTable = new dynamodb.Table(this, "FileMetadataTable", {
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      tableName: "FileMetadataTable",
      stream: dynamodb.StreamViewType.NEW_IMAGE,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const index = new lambda.Function(this, "IndexHandler", {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset("lambda"),
      handler: "index.handler",
      environment: {
        TABLE_NAME: metadataTable.tableName,
      },
    });

    metadataTable.grantWriteData(index);

    const gateway = new LambdaRestApi(this, "Endpoint", {
      handler: index,
      restApiName: "InfrastructureAPI",
      defaultCorsPreflightOptions: {
        allowOrigins: ["*"],
        allowMethods: ["GET", "POST", "OPTIONS"],
      },
    });

    const summarize = new lambda.Function(this, "SummarizeHandler", {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset("lambda"),
      handler: "summarize.handler",
      environment: {
        TABLE_NAME: metadataTable.tableName,
      },
    });

    metadataTable.grantStreamRead(summarize);

    //  Add event source for summarize handler
    summarize.addEventSource(
      new eventsources.DynamoEventSource(metadataTable, {
        startingPosition: lambda.StartingPosition.LATEST,
        filters: [
          lambda.FilterCriteria.filter({
            eventName: lambda.FilterRule.isEqual("INSERT"),
          }),
        ],
      })
    );

    //  Give lambda function necessary permissions to create ec2 instance
    summarize.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ec2:RunInstances",
          "ec2:DescribeInstances",
          "ec2:CreateTags",
        ],
        resources: [
          "arn:aws:ec2:us-east-1:*:instance/*",
          "arn:aws:ec2:us-east-1:*:security-group/*",
          "arn:aws:ec2:us-east-1:*:key-pair/*",
          "arn:aws:ec2:us-east-1:*:network-interface/*",
          "arn:aws:ec2:us-east-1:*:subnet/*",
          "arn:aws:ec2:us-east-1:*:volume/*",
          "arn:aws:ec2:us-east-1::image/ami-0866a3c8686eaeeba",
        ],
      })
    );
  }
}
