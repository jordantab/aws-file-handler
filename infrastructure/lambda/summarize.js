const { EC2Client, RunInstancesCommand } = require("@aws-sdk/client-ec2");

// Initialize ec2 client
const ec2Client = new EC2Client();


exports.handler = async function (event) {
    console.log("DynamoDB Stream Event:", JSON.stringify(event, null, 2));
    
    for (const record of event.Records) { 
        console.log("Stream record: ", JSON.stringify(record, null, 2));
        
        if (record.eventName == 'INSERT') {
            const newItem = record.dynamodb.NewImage;
            console.log("New item added: ", JSON.stringify(newItem,));
            
            // TODO: launch instance
            try {
                console.log("Creating new ec2 instance")
                await launchEC2Instance()
            } catch (err) {
                console.error("Error launching EC2 instance:", err);
            }
        }
    }
};

async function launchEC2Instance() {
    const params = {
        ImageId: 'ami-0866a3c8686eaeeba',
        InstanceType: 't2.micro',
        MinCount: 1,
        MaxCount: 1,
    }

    try {
        const command = new RunInstancesCommand(params)
        console.log("Sending request")
        const response = await ec2Client.send(command);
        console.log("EC2 instance launched successfully: ", response);
    } catch (err) {
        console.error("Failed to launch EC2 instance: ", err)
    }
}
