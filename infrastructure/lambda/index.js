const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");


// Initialize DynamoDB client
const ddb = new DynamoDBClient();

const storeMetadata = async function (text, s3Link) {
    const params = {
        TableName: process.env.TABLE_NAME,
        Item: {
            id: { S: new Date().toISOString() },
            text: { S: text },                 
            s3Link: { S: s3Link }              
        }
    };

    try {
        const command = new PutItemCommand(params)
        const response = await ddb.send(command);
        return {
            statusCode: 200,
            headers: {"Access-Control-Allow-Origin": "*"},
            body: JSON.stringify({ message: "Metadata stored successfully" }),
        }
    } catch (err) {
        console.error("Error storing metadata:", err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: err.message }),
        }

     }
};

exports.handler = async function (event) {
    console.log("request:", JSON.stringify(event, undefined, 2));
    try {
        const body = JSON.parse(event.body);
        const { text, s3Link } = body
        
        if (!text || !s3Link) {
            return {
                statusCode: 400,
                headers: {"Access-Control-Allow-Origin": "*"},
                body: JSON.stringify({ error: "Missing required fields: text and s3Link" }),
            }
        }
        const response = await storeMetadata(text, s3Link)
        return {
            ...response,
            headers: {
                ...response.headers,
                "Access-Control-Allow-Origin": "*",
            },
        };
    } catch (err) {
        console.error("Error storing metadata:", err);
        return {
            statusCode: 500,
            headers: {"Access-Control-Allow-Origin": "*"},
            body: JSON.stringify({ error: err.message }),
        }
    }

}