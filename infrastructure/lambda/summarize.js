const { EC2Client, RunInstancesCommand } = require("@aws-sdk/client-ec2");
const { SSMClient, GetParameterCommand } = require("@aws-sdk/client-ssm");

// Initialize ec2 and ssm clients
const ec2Client = new EC2Client();
const ssmClient = new SSMClient();


exports.handler = async function (event) {
    console.log("DynamoDB Stream Event:", JSON.stringify(event, null, 2));
    const bucketName = process.env.BUCKET_NAME;
    const instanceRoleArn = process.env.INSTANCE_ROLE_ARN;

    // Retrieve the OpenAI API key from SSM
    let openaiApiKey;
    try {
        const command = new GetParameterCommand({
            Name: process.env.OPENAI_API_KEY_SSM_PARAM,
            WithDecryption: true
        });
        const response = await ssmClient.send(command);
        openaiApiKey = response.Parameter.Value;
    } catch (error) {
        console.error("Failed to retrieve OpenAI API key from SSM:", error);
        return;
    }
    
    for (const record of event.Records) { 
        console.log("Stream record: ", JSON.stringify(record, null, 2));
        
        // check if the record is a new insertion
        if (record.eventName == 'INSERT') {
            const newItem = record.dynamodb.NewImage;
            console.log("New item added: ", JSON.stringify(newItem));
            const itemId = newItem.id.S;
            const s3Link = newItem.s3Link.S;
            
            try {
                console.log("Creating new ec2 instance")
                await launchEC2Instance(bucketName, instanceRoleArn, itemId, s3Link, openaiApiKey)
            } catch (err) {
                console.error("Error launching EC2 instance:", err);
            }
        }
    }
};

async function launchEC2Instance(bucketName, instanceRoleArn, itemId, s3Link, openaiApiKey) {
    // python script key on S3 bucket
    const scriptKey = 'summary_generator_script.py';

    // Bash script to get the ec2 instance running once launched
   const userData = `#!/bin/bash
    echo "Starting user data script..." | tee -a /var/log/cloud-init-output.log
    # Update system packages and install pip and virtualenv support
    sudo yum update -y
    sudo yum install -y python3-pip python3-venv

    # Create a virtual environment
    python3 -m venv /home/ec2-user/env

    # Activate the virtual environment
    source /home/ec2-user/env/bin/activate

    # Install awscli, openai, and other dependencies inside the virtual environment
    pip install boto3 uuid openai awscli

    # Set environment variables for the session
    export TABLE_NAME="${process.env.TABLE_NAME}"
    export BUCKET_NAME="${bucketName}"
    export ITEM_ID="${itemId}"
    export S3_LINK="${s3Link}"
    export OPENAI_API_KEY="${openaiApiKey}"

    # Persist environment variables for other processes
    echo "TABLE_NAME=${process.env.TABLE_NAME}" >> /etc/environment
    echo "BUCKET_NAME=${bucketName}" >> /etc/environment
    echo "ITEM_ID=${itemId}" >> /etc/environment
    echo "S3_LINK=${s3Link}" >> /etc/environment
    echo "OPENAI_API_KEY=${openaiApiKey}" >> /etc/environment

    # Use awscli from the virtual environment to download the Python script
    echo "Downloading script from S3" | tee -a /home/ec2-user/summary_generator_script_output.log
    /home/ec2-user/env/bin/aws s3 cp s3://${bucketName}/scripts/${scriptKey} /home/ec2-user/summary_generator_script.py | tee -a /home/ec2-user/summary_generator_script_output.log

    # Make the script executable and run it using the virtual environment
    chmod +x /home/ec2-user/summary_generator_script.py
    echo "Running the summary_generator_script script" | tee -a /home/ec2-user/summary_generator_script_output.log
    /home/ec2-user/env/bin/python /home/ec2-user/summary_generator_script.py | tee -a /home/ec2-user/summary_generator_script_output.log

    # Automatically terminate the instance after the script completes
    INSTANCE_ID=$(ec2-metadata -i | cut -d ' ' -f 2)
    /home/ec2-user/env/bin/aws ec2 terminate-instances --instance-ids "$INSTANCE_ID" --region ${process.env.AWS_REGION}

    echo "User data script completed" | tee -a /var/log/cloud-init-output.log
`;


    // ec2 instance parameters
    const params = {
        ImageId: 'ami-06b21ccaeff8cd686',
        InstanceType: 't3.medium',
        MinCount: 1,
        MaxCount: 1,
        SecurityGroupIds: [
            process.env.SECURITY_GROUP_ID,
        ],
        SubnetId: process.env.SUBNET_ID,
        IamInstanceProfile: {
            Arn: instanceRoleArn,
        },
        UserData: Buffer.from(userData).toString('base64'),
    }

    try {
        const command = new RunInstancesCommand(params);
        console.log("Sending request");
        const response = await ec2Client.send(command);
        console.log("EC2 instance launched successfully: ", response);
    } catch (err) {
        console.error("Failed to launch EC2 instance: ", err);
    }
}
