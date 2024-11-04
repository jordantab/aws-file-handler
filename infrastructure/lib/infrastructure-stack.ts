import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { LambdaRestApi } from "aws-cdk-lib/aws-apigateway";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as eventsources from "aws-cdk-lib/aws-lambda-event-sources";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";

export class InfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // s3 bucket that stores the python script
    const scriptBucket = new s3.Bucket(this, "ScriptBucket", {
      versioned: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new s3deploy.BucketDeployment(this, "DeployScript", {
      sources: [s3deploy.Source.asset("./scripts")],
      destinationBucket: scriptBucket,
    });

    // dynamoDB table that stores s3 file metadata
    const metadataTable = new dynamodb.Table(this, "FileMetadataTable", {
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      tableName: "FileMetadataTable",
      stream: dynamodb.StreamViewType.NEW_IMAGE,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // initial insertion of the new file metadata into the dynamoDB table
    const index = new lambda.Function(this, "IndexHandler", {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset("lambda"),
      handler: "index.handler",
      environment: {
        TABLE_NAME: metadataTable.tableName,
      },
    });

    metadataTable.grantWriteData(index);

    // API Gateway for the DynamoDB insertion lambda function
    const gateway = new LambdaRestApi(this, "Endpoint", {
      handler: index,
      restApiName: "InfrastructureAPI",
      defaultCorsPreflightOptions: {
        allowOrigins: ["*"],
        allowMethods: ["GET", "POST", "OPTIONS"],
      },
    });

    // create role for ec2 instance with necessary permissions
    const instanceRole = new iam.Role(this, "EC2InstanceRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
    });

    instanceRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonS3FullAccess")
    );
    instanceRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchAgentServerPolicy")
    );

    const ec2InstanceArn = cdk.Arn.format(
      {
        service: "ec2",
        region: this.region,
        account: this.account,
        resource: "instance",
        resourceName: "*",
      },
      this
    );

    const ssmParameterArn = cdk.Arn.format(
      {
        service: "ssm",
        region: this.region,
        account: this.account,
        resource: "parameter/openai/api_key",
      },
      this
    );

    instanceRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["dynamodb:UpdateItem", "ec2:TerminateInstances"],
        resources: [metadataTable.tableArn, ec2InstanceArn],
      })
    );

    const instanceProfile = new iam.CfnInstanceProfile(
      this,
      "EC2InstanceProfile",
      {
        roles: [instanceRole.roleName],
      }
    );

    const summarize = new lambda.Function(this, "SummarizeHandler", {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset("lambda"),
      handler: "summarize.handler",
      environment: {
        TABLE_NAME: metadataTable.tableName,
        BUCKET_NAME: scriptBucket.bucketName,
        INSTANCE_ROLE_ARN: instanceProfile.attrArn,
        OPENAI_API_KEY_SSM_PARAM: "/openai/api_key",
      },
    });

    metadataTable.grantStreamRead(summarize);

    //  Add event source for summarize handler to keep track of new file uploads
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

    //  Give lambda function necessary permissions to create ec2 instance with power
    summarize.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ec2:RunInstances",
          "ec2:DescribeInstances",
          "ec2:CreateTags",
          "iam:PassRole",
          "ssm:GetParameter",
        ],
        resources: [
          "arn:aws:ec2:us-east-1:*:instance/*",
          "arn:aws:ec2:us-east-1:*:security-group/*",
          "arn:aws:ec2:us-east-1:*:key-pair/*",
          "arn:aws:ec2:us-east-1:*:network-interface/*",
          "arn:aws:ec2:us-east-1:*:subnet/*",
          "arn:aws:ec2:us-east-1:*:volume/*",
          "arn:aws:ec2:us-east-1::image/*",
          instanceRole.roleArn,
          ssmParameterArn,
        ],
      })
    );
  }
}
