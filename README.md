# Application Overview

This application allows users to upload a `.txt` file along with additional text input, which is then processed and stored using various AWS services. The application performs the following steps:

1. **File Upload**: The uploaded `.txt` file is stored in an S3 bucket.
2. **Metadata Storage**: A metadata table is created in DynamoDB to store the S3 path of the original file, the input text, an AI-generated summary, and the S3 path of the new file.
3. **Summary Generation**: Using OpenAI's API, the application generates a summary of the contents of the uploaded file.
4. **New File Creation**: A new file is created in S3 containing the original content and the generated summary. The S3 path of this new file is stored in the DynamoDB metadata table.

This infrastructure is deployed using AWS CDK, making it fully customizable and easy to set up in any AWS account. Follow the steps below to configure and deploy the application.

---

## Application Components

The application is divided into two main components:

1. **Next.js Client**: A user interface built with Next.js that allows users to upload `.txt` files and input text for processing.
2. **AWS CDK Backend**: An AWS infrastructure setup managed by AWS CDK, which deploys the necessary resources such as S3, DynamoDB, and Lambda functions to handle file storage, metadata management, and summary generation.

## Getting Started

To begin using the application, clone the repository locally:

```bash
git clone https://github.com/jordantab/profound-takehome.git
cd profound-takehome
```

## Environment Setup

Before setting up each component, ensure you have the following tools installed:

- **AWS CLI**: [Install and configure the AWS CLI](https://aws.amazon.com/cli/).
- **AWS CDK**: Install AWS CDK globally:
  ```bash
  npm install -g aws-cdk
  ```
- **Node.js**: Install the latest verion of Node.js

## AWS Configuration

### Step 1: Create IAM User with Necessary Permissions

Before proceeding with the AWS configuration, create an AWS IAM user and provide the necessary permissions. The AWS user associated with the provided **Access Key ID** and **Secret Access Key** must have the following permissions to deploy and run the application successfully:

- **AmazonAPIGatewayAdministrator**
- **AmazonAPIGatewayInvokeFullAccess**
- **AmazonDynamoDBFullAccess**
- **AmazonEC2FullAccess**
- **AmazonS3FullAccess**
- **AmazonSSMFullAccess**
- **AWSCloudFormationFullAccess**
- **AWSLambda_FullAccess**
- **CloudWatchLogsFullAccess**
- **IAMFullAccess**

These permissions can be assigned by attaching the relevant AWS managed policies to the IAM user. This will allow the application to manage resources such as S3 buckets, DynamoDB tables, Lambda functions, EC2 instances, and API Gateway, as well as interact with the OpenAI API through AWS SSM.

### Step 2: Configure AWS CLI

The AWS CDK will use your AWS CLI configuration to determine the default account and region for deployment. If you haven't configured your AWS CLI yet, you can set it up by running:

```bash
aws configure
```

This command will prompt you for your:

- **AWS Access Key ID**
- **AWS Secret Access Key**
- **Default region name** (e.g., `us-east-1`)
- **Default output format** (e.g., None)

Ensure that the AWS CLI is properly configured with the credentials of the IAM user created in Step 1.

### Step 3: Configure OpenAI API Key

Store your OpenAI API key in AWS Systems Manager (SSM) Parameter Store. Replace `<your_api_key>` with your OpenAI API key.

```bash
aws ssm put-parameter --name "/openai/api_key" --value "<your_api_key>" --type "SecureString"
```

This will securely store your API key, making it accessible to the application while keeping it safe.

## Infrastructure Deployment

### Step 4: Deploy AWS CDK Backend

Now that you have configured your AWS environment and stored your OpenAI API key, you can deploy the infrastructure required for the application.

#### Step 4.1: Install Dependencies

Navigate to the infrastructure directory and install the necessary dependencies for the AWS CDK stack:

```bash
cd infrastructure
npm install
```

#### Step 4.2: Deploy the CDK Stack

Run the follwoing command to deploy the AWS infrastructure

```bash
cdk deploy --outputs-file cdk-outputs.json
```

This command will deploy all the necessary AWS resources, including:

- **An S3 bucket** for file storage
- **A DynamoDB table** for storing metadata
- **Lambda functions** for processing data
- **EC2 instances** for running scripts

During deployment, you will be asked to confirm that you allow IAM-related changes, such as creating roles and policies. Type y to proceed.

## Client Application Setup

The Client of this application is built with **Next.js** and provides a user-friendly interface for uploading `.txt` files and input text for processing. This section will guide you through setting up and running the Client.

### Step 5: Set Up the Client (Next.js Application)

The Client interacts with the AWS backend services to enable users to upload files and input text. Follow the steps below to set up the Client:

### Step 5.1: Install Client Dependencies

First, navigate to the `client` directory and install all necessary dependencies using npm:

```bash
cd ../client
npm install
```

This command will install all required packages specified in the package.json file.

### Step 5.2: Setup Client Environment

Run the following command to setup the clientside enviroment variables necessary:

```bash
node set-env
```

This command will install initialize the AWS credentials, as well as the API Gateway URL, and the S3 bucket name used for the experiment.

### Step 5.3: Start Client Application

After setting up the environment variables, run the following command to start the Next.js application:

```bash
npm run dev
```

### Step 5.4: Upload .txt file

Test the application functionality by uploading a .txt file and some accompanying text. You can see the results on your AWS console by checking the S3 and DynamoDB services.
