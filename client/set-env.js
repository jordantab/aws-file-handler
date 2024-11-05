// combined-env-setup.js
const fs = require("fs");
const path = require("path");
const os = require("os");

// Paths to AWS configuration files
const awsCredentialsPath = path.join(os.homedir(), ".aws", "credentials");
const awsConfigPath = path.join(os.homedir(), ".aws", "config");

// Path to CDK outputs file
const cdkOutputsPath = path.resolve(__dirname, "../infrastructure/cdk-outputs.json");

// Path to .env.local file
const envFilePath = path.join(__dirname, ".env.local");

let envContent = "";

try {
  // Step 1: Extract AWS credentials
  if (fs.existsSync(awsCredentialsPath)) {
    const awsCredentials = fs.readFileSync(awsCredentialsPath, "utf-8");

    // Extract credentials from the default profile
    const defaultProfile = awsCredentials.match(
      /\[default\][\s\S]*?aws_access_key_id\s*=\s*(\S+)[\s\S]*?aws_secret_access_key\s*=\s*(\S+)/m
    );

    if (defaultProfile) {
      const awsAccessKeyId = defaultProfile[1];
      const awsSecretAccessKey = defaultProfile[2];
      envContent += `AWS_ACCESS_KEY_ID=${awsAccessKeyId}\nAWS_SECRET_ACCESS_KEY=${awsSecretAccessKey}\n`;
    } else {
      console.warn("Default AWS profile not found. Skipping AWS credentials.");
    }
  } else {
    console.warn("AWS credentials file not found. Skipping AWS credentials.");
  }

  // Step 2: Extract AWS region
  let awsRegion = "us-east-1"; // Default region if none is found
  if (fs.existsSync(awsConfigPath)) {
    const awsConfig = fs.readFileSync(awsConfigPath, "utf-8");
    const regionMatch = awsConfig.match(/\[default\][\s\S]*?region\s*=\s*(\S+)/m);
    if (regionMatch) {
      awsRegion = regionMatch[1];
    }
  }
  envContent += `AWS_REGION=${awsRegion}\n`;

  // Step 3: Read CDK outputs
  if (fs.existsSync(cdkOutputsPath)) {
    const cdkOutputs = JSON.parse(fs.readFileSync(cdkOutputsPath, "utf-8"));

    // Extract the bucket name and API Gateway URL from CDK outputs
    const bucketName = cdkOutputs.InfrastructureStack?.S3BucketName;
    const apiGatewayUrl = cdkOutputs.InfrastructureStack?.ApiGatewayUrl;

    if (bucketName && apiGatewayUrl) {
      envContent += `NEXT_PUBLIC_S3_BUCKET=${bucketName}\nNEXT_PUBLIC_API_GATEWAY_URL=${apiGatewayUrl}\n`;
    } else {
      console.warn("Required CDK outputs not found in cdk-outputs.json. Skipping bucket and API Gateway URL.");
    }
  } else {
    console.warn("cdk-outputs.json file not found. Skipping CDK outputs.");
  }

  // Step 4: Append to .env.local if it exists, or create it if it doesn’t
  fs.appendFileSync(envFilePath, envContent);
  console.log(`Environment variables have been added to ${envFilePath}`);
} catch (error) {
  console.error("Error writing to .env.local file:", error.message);
}
