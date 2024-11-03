import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { LambdaRestApi } from "aws-cdk-lib/aws-apigateway";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";

export class InfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const metadataTable = new dynamodb.Table(this, "FileMetadataTable", {
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      tableName: "FileMetadataTable",
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
  }
}
