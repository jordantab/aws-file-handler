const { EC2Client, RunInstancesCommand } = require("@aws-sdk/client-ec2");

// Initialize ec2 client
const ec2Client = new EC2Client();


exports.handler = async function (event) {
    console.log("DynamoDB Stream Event:", JSON.stringify(event, null, 2));
    const bucketName = process.env.BUCKET_NAME;
    const instanceRoleArn = process.env.INSTANCE_ROLE_ARN;
    
    for (const record of event.Records) { 
        console.log("Stream record: ", JSON.stringify(record, null, 2));
        
        if (record.eventName == 'INSERT') {
            const newItem = record.dynamodb.NewImage;
            console.log("New item added: ", JSON.stringify(newItem,));
            
            // TODO: launch instance
            try {
                console.log("Creating new ec2 instance")
                await launchEC2Instance(bucketName, instanceRoleArn)
            } catch (err) {
                console.error("Error launching EC2 instance:", err);
            }
        }
    }
};

async function launchEC2Instance(bucketName, instanceRoleArn) {
    const scriptKey = 'placeholder.py';

    const userData = `#!/bin/bash
        echo "Starting user data script..." | tee -a /var/log/cloud-init-output.log

        # Update system and install necessary tools
        sudo yum update -y | tee -a /var/log/cloud-init-output.log
        echo "System update completed" | tee -a /var/log/cloud-init-output.log

        # Install Python3
        sudo yum install -y python3 | tee -a /var/log/cloud-init-output.log
        echo "Python3 installed" | tee -a /var/log/cloud-init-output.log

        # Download the Python script from S3
        echo "Downloading script from S3" | tee -a /home/ec2-user/placeholder_script_output.log
        aws s3 cp s3://${bucketName}/${scriptKey} /home/ec2-user/placeholder_script.py | tee -a /home/ec2-user/placeholder_script_output.log

        # Make the script executable and run it
        chmod +x /home/ec2-user/placeholder_script.py | tee -a /home/ec2-user/placeholder_script_output.log
        echo "Running the placeholder script" | tee -a /home/ec2-user/placeholder_script_output.log
        python3 /home/ec2-user/placeholder_script.py | tee -a /home/ec2-user/placeholder_script_output.log

        echo "User data script completed" | tee -a /var/log/cloud-init-output.log
        `;

    const params = {
        ImageId: 'ami-06b21ccaeff8cd686',
        InstanceType: 't3.medium',
        MinCount: 1,
        MaxCount: 1,
        KeyName: '11785',
        SecurityGroupIds: [
            "sg-0a1066ca0cc64c325"
        ],
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
