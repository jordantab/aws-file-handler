const fs = require('fs');
const path = require('path');

// Read the CDK outputs file
const cdkOutputsPath = path.resolve(__dirname, '../infrastructure/cdk-outputs.json');
if (!fs.existsSync(cdkOutputsPath)) {
  console.error('Error: cdk-outputs.json file not found');
  process.exit(1);
}

const cdkOutputs = JSON.parse(fs.readFileSync(cdkOutputsPath, 'utf-8'));

// Extract the bucket name
const bucketName = cdkOutputs.InfrastructureStack.S3BucketName;
const apiGatewayUrl = cdkOutputs.InfrastructureStack.ApiGatewayUrl;

// Write the bucket name to the Next.js environment file (.env.local)
fs.writeFileSync(
  path.join(__dirname, '.env.local'),
    `NEXT_PUBLIC_S3_BUCKET=${bucketName}\nNEXT_PUBLIC_API_GATEWAY_URL=${apiGatewayUrl}\n`
);

console.log('Environment file created successfully.');
