import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { LambdaRestApi } from "aws-cdk-lib/aws-apigateway";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as eventsources from "aws-cdk-lib/aws-lambda-event-sources";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as ec2 from "aws-cdk-lib/aws-ec2";

export class InfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create an S3 bucket for the application
    const profoundBucket = new s3.Bucket(this, "ProfoundBucket", {
      versioned: false,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      cors: [
        {
          allowedOrigins: ["http://localhost:3000"],
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.POST],
          allowedHeaders: ["*"],
          exposedHeaders: ["ETag"],
          maxAge: 3000,
        },
      ],
    });

    // Output the bucket name to be used by the client side
    new cdk.CfnOutput(this, "S3BucketName", {
      value: profoundBucket.bucketName,
      description: "The S3 Bucket name where files are stored",
      exportName: "S3BucketName",
    });

    // Upload the python script to s3 bucket
    new s3deploy.BucketDeployment(this, "DeployScript", {
      sources: [s3deploy.Source.asset("./scripts")],
      destinationBucket: profoundBucket,
      destinationKeyPrefix: "scripts/",
    });

    // dynamoDB table that stores s3 file metadata
    const metadataTable = new dynamodb.Table(
      this,
      "ProfoundFileMetadataTable",
      {
        partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
        tableName: "ProfoundFileMetadataTable",
        stream: dynamodb.StreamViewType.NEW_IMAGE,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }
    );

    // initial insertion of the new file metadata into the dynamoDB table
    const index = new lambda.Function(this, "DDBIndexHandler", {
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

    // Output the API Gateway URL to be used by the client side
    new cdk.CfnOutput(this, "ApiGatewayUrl", {
      value: gateway.url,
      description: "The URL of the API Gateway",
      exportName: "ApiGatewayUrl",
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

    // Create a new vpc for ec2 instance
    const vpc = new ec2.Vpc(this, "NewEC2VPC", {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          subnetType: ec2.SubnetType.PUBLIC,
          name: "PublicSubnet",
          cidrMask: 24,
        },
        {
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          name: "PrivateSubnet",
          cidrMask: 24,
        },
      ],
    });

    // Create a security group within the new VPC
    const ec2SecurityGroup = new ec2.SecurityGroup(this, "EC2SecurityGroup", {
      vpc,
      description:
        "Security group for EC2 instance with HTTP, HTTPS, and SSH access",
      allowAllOutbound: true,
    });

    // Add inbound rules to allow HTTP, HTTPS, and SSH
    ec2SecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      "Allow HTTP access from anywhere"
    );
    ec2SecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      "Allow SSH access from anywhere"
    );
    ec2SecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      "Allow HTTPS access from anywhere"
    );

    // cdk friendly arn formatting
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

    // ec2 instance Role
    const instanceProfile = new iam.CfnInstanceProfile(
      this,
      "EC2InstanceProfile",
      {
        roles: [instanceRole.roleName],
      }
    );

    // lambda function handler that triggers python script
    const summarize = new lambda.Function(this, "SummarizeHandler", {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset("lambda"),
      handler: "summarize.handler",
      environment: {
        TABLE_NAME: metadataTable.tableName,
        BUCKET_NAME: profoundBucket.bucketName,
        SCRIPT_PREFIX: "scripts/",
        INSTANCE_ROLE_ARN: instanceProfile.attrArn,
        OPENAI_API_KEY_SSM_PARAM: "/openai/api_key",
        SECURITY_GROUP_ID: ec2SecurityGroup.securityGroupId,
        SUBNET_ID: vpc.privateSubnets[0].subnetId,
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
